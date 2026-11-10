// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ts from 'typescript';

import {isFunctionLike, nameOfFunction, shortText} from './ast.ts';
import {MAX_CONDITION_INLINE_DEPTH} from './limits.ts';
import type {ConditionKind, RenderCondition} from './manifest_types.ts';
import type {ProgramIndex} from './program_index.ts';
import type {Resolver} from './values.ts';

type RawCondition = {expr: ts.Expression; negate: boolean; at: ts.Node};

const EARLY_RETURN = /^\{?\s*return\s*(null|false|undefined|<>\s*<\/>)?\s*;?\s*\}?$/;
const ORDER: ConditionKind[] = ['permission', 'license/config/flag', 'layout', 'store selector', 'prop', 'local state'];

/** When an element renders: `cond && <el/>`, ternary arms, if/else arms, and early returns before it. */
export class Conditions {
    private readonly ix: ProgramIndex;
    private readonly R: Resolver;

    constructor(ix: ProgramIndex, R: Resolver) {
        this.ix = ix;
        this.R = R;
    }

    raw(el: ts.Node): RawCondition[] {
        const out: RawCondition[] = [];
        let prev: ts.Node = el;
        for (let p = el.parent; p; prev = p, p = p.parent) {
            if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && p.right === prev) {
                out.push({expr: p.left, negate: false, at: p});
            }
            if (ts.isConditionalExpression(p) && p.whenTrue === prev) {
                out.push({expr: p.condition, negate: false, at: p});
            }
            if (ts.isConditionalExpression(p) && p.whenFalse === prev) {
                out.push({expr: p.condition, negate: true, at: p});
            }
            if (ts.isIfStatement(p) && p.thenStatement === prev) {
                out.push({expr: p.expression, negate: false, at: p});
            }
            if (ts.isIfStatement(p) && p.elseStatement === prev) {
                out.push({expr: p.expression, negate: true, at: p});
            }
            if (isFunctionLike(p) && p.body && ts.isBlock(p.body)) {
                const holder = p.body.statements.find((st) => st.pos <= el.pos && el.end <= st.end);
                for (const st of p.body.statements) {
                    if (!holder || st.pos >= holder.pos) {
                        break;
                    }
                    if (ts.isIfStatement(st) && EARLY_RETURN.test(st.thenStatement.getText().trim())) {
                        out.push({expr: st.expression, negate: true, at: st});
                    }
                }
                if ((/^[A-Z]/).test(nameOfFunction(p)) || (ts.isMethodDeclaration(p) && p.name.getText() === 'render')) {
                    break;
                }
            }
            if (ts.isClassDeclaration(p)) {
                break;
            }
        }
        return out;
    }

    of(el: ts.Node): RenderCondition[] {
        return this.raw(el).filter((c) => !this.isNullGuard(c)).map((c) => {
            const {kind, viaLocal} = this.classify(c.expr);
            return {
                expr: this.text(c, false),
                explained: this.text(c, true),
                kind,
                ...(viaLocal ? {viaLocal} : {}),
                at: this.ix.where(c.at),
            };
        });
    }

    /** `channel && <X/>`: a guard that an object is loaded, not a condition worth documenting. */
    private isNullGuard(c: RawCondition): boolean {
        const e = c.expr;
        if (!ts.isIdentifier(e) && !ts.isPropertyAccessExpression(e)) {
            return false;
        }
        const t = this.ix.checker.getTypeAtLocation(e);
        const parts = t.isUnion() ? t.types : [t];
        return parts.every((p) => (p.flags & (ts.TypeFlags.Object | ts.TypeFlags.Undefined | ts.TypeFlags.Null | ts.TypeFlags.NonPrimitive)) !== 0) && parts.some((p) => (p.flags & ts.TypeFlags.Object) !== 0);
    }

    /** The condition text; with `explain`, identifiers bound by useSelector(state => x) are replaced by x. */
    private text(c: RawCondition, explain: boolean): string {
        let expr = c.expr;
        let negate = c.negate;
        while (ts.isPrefixUnaryExpression(expr) && expr.operator === ts.SyntaxKind.ExclamationToken && negate) {
            expr = expr.operand;
            negate = false;
        }
        while (ts.isParenthesizedExpression(expr)) {
            expr = expr.expression;
        }
        let text = shortText(expr, 200);
        if (explain) {
            const ids: ts.Identifier[] = [];
            const w = (n: ts.Node) => {
                if (ts.isIdentifier(n)) {
                    ids.push(n);
                }
                ts.forEachChild(n, w);
            };
            w(expr);
            for (const id of ids) {
                const d = this.ix.checker.getSymbolAtLocation(id)?.valueDeclaration;
                if (!d || !ts.isVariableDeclaration(d) || !d.initializer) {
                    continue;
                }
                const sel = selectorBody(d.initializer);
                if (sel) {
                    text = text.replace(new RegExp('\\b' + id.text + '\\b'), shortText(sel, 160));
                }
            }
        }
        const simple = ts.isIdentifier(expr) || ts.isPropertyAccessExpression(expr) || ts.isCallExpression(expr) || ts.isPrefixUnaryExpression(expr);
        if (!negate) {
            return text;
        }
        return simple ? `!${text}` : `!(${text})`;
    }

    /** What a condition depends on; `viaLocal` when only a local value derived from it says (`const show = canDelete && …`). */
    classify(expr: ts.Expression, depth = 0): {kind: ConditionKind; viaLocal?: true} {
        const k = this.classifyDirect(expr);
        if (k !== 'other' || depth > MAX_CONDITION_INLINE_DEPTH) {
            return {kind: k};
        }

        // inline local derived values: const showDelete = canDelete && !isSystemMessage
        const kinds: ConditionKind[] = [];
        for (const id of identifiers(expr)) {
            const d = this.ix.checker.getSymbolAtLocation(id)?.valueDeclaration;
            if (d && ts.isVariableDeclaration(d) && d.initializer && !(/^use(State|Selector)/).test(d.initializer.getText())) {
                kinds.push(this.classify(d.initializer, depth + 1).kind);
            }
            if (ts.isPropertyAccessExpression(id.parent) && (/^this\.state\./).test(id.parent.getText())) {
                kinds.push('local state');
            }
        }
        const found = ORDER.find((o) => kinds.includes(o));
        return found ? {kind: found, viaLocal: true} : {kind: 'other'};
    }

    private classifyDirect(expr: ts.Expression): ConditionKind {
        const t = expr.getText();
        if ((/isMobile|isDesktop|isTablet|isMobileView|isRHS|isExpanded|isCollapsed/i).test(t)) {
            return 'layout';
        }
        if ((/[Ll]icen[cs]e|isCloud|isEnterprise|isStarter|SKU|FeatureFlag|getConfig|config\.|Config\b/).test(t)) {
            return 'license/config/flag';
        }
        if ((/[Pp]ermission|canAccess|canManage|canEdit|isAdmin|haveI|isSystemAdmin|canCreate|canDelete/).test(t)) {
            return 'permission';
        }
        const ids = identifiers(expr);
        for (const id of ids) {
            const d = this.ix.checker.getSymbolAtLocation(id)?.valueDeclaration;
            if (!d) {
                continue;
            }
            if (ts.isVariableDeclaration(d) && d.initializer) {
                const it = d.initializer.getText();
                if ((/^useSelector\(/).test(it)) {
                    if ((/[Pp]ermission|canAccess|canManage|haveI/).test(it)) {
                        return 'permission';
                    }
                    return (/[Ll]icen|Config|FeatureFlag/).test(it) ? 'license/config/flag' : 'store selector';
                }
            }
            if (ts.isBindingElement(d) && ts.isArrayBindingPattern(d.parent)) {
                return 'local state';
            }
        }
        if ((/this\.state\./).test(t)) {
            return 'local state';
        }
        if (this.R.propsPath(expr) || ids.some((id) => this.R.propsPath(id))) {
            return 'prop';
        }
        return 'other';
    }
}

function identifiers(expr: ts.Node): ts.Identifier[] {
    const ids: ts.Identifier[] = [];
    const w = (n: ts.Node) => {
        if (ts.isIdentifier(n)) {
            ids.push(n);
        }
        ts.forEachChild(n, w);
    };
    w(expr);
    return ids;
}

/** `useSelector((state) => expr)` -> expr */
function selectorBody(init: ts.Expression): ts.Expression | null {
    if (!ts.isCallExpression(init) || init.expression.getText() !== 'useSelector') {
        return null;
    }
    const f = init.arguments[0];
    if (f && ts.isArrowFunction(f) && !ts.isBlock(f.body)) {
        return f.body;
    }
    return null;
}

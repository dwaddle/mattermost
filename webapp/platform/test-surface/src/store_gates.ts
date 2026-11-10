// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ts from 'typescript';

import {isFunctionLike, propName, returnsOf, strip} from './ast.ts';
import type {Conditions} from './conditions.ts';
import {MAX_MAP_STATE_DEPTH, MAX_STORE_CONDITION_DEPTH} from './limits.ts';
import {isCallUsage, type CodeNode, type ProgramIndex, type Usage} from './program_index.ts';
import type {Resolver} from './values.ts';

/**
 * UI shown through the store, with no modal: a click dispatches a value (`state: RHSStates.CHANNEL_INFO`), a
 * reducer keeps it, and a component renders a panel when a selector compares equal to it
 * (`isChannelInfo: rhsState === RHSStates.CHANNEL_INFO` … `if (isChannelInfo) content = <ChannelInfoRhs/>`).
 * The store isn't modelled: a click "shows" a component when a constant it puts in a value position is one
 * the component's render condition compares against. Constants are members of a constant object or enum,
 * identified by their declaration, so `RHSStates.PIN` and an unrelated `PIN` never meet.
 */

/** A member of a constant object or an enum (`RHSStates.CHANNEL_INFO`): its declaration's location and name. */
export function constKey(ix: ProgramIndex, n: ts.Node): string | null {
    if (!ts.isPropertyAccessExpression(n)) {
        return null;
    }
    const d = ix.checker.getSymbolAtLocation(n)?.valueDeclaration;
    if (!d || !(ts.isEnumMember(d) || (ts.isPropertyAssignment(d) && ts.isObjectLiteralExpression(d.parent)))) {
        return null;
    }
    if (ts.isPropertyAssignment(d) && !ts.isStringLiteralLike(d.initializer) && !ts.isNumericLiteral(d.initializer)) {
        return null;
    }
    return `${ix.where(d)} ${n.name.text}`;
}

/** Whether a constant is passed on as data (an object property, an argument, a returned or assigned value), not tested. */
export function isValuePosition(n: ts.Expression): boolean {
    const p = n.parent;
    if (ts.isPropertyAssignment(p)) {
        return p.initializer === n;
    }
    if (ts.isCallExpression(p) || ts.isNewExpression(p)) {
        return Boolean(p.arguments?.includes(n));
    }
    if (ts.isBinaryExpression(p)) {
        return p.operatorToken.kind === ts.SyntaxKind.EqualsToken && p.right === n;
    }

    // an array element only when the array is passed on itself (`[A, B].includes(x)` is a test)
    if (ts.isArrayLiteralExpression(p)) {
        return isValuePosition(p);
    }
    return ts.isReturnStatement(p) || (ts.isVariableDeclaration(p) && p.initializer === n) || (ts.isArrowFunction(p) && p.body === n);
}

export type Gate = {comp: ts.Node; usage: ts.Node};

export class StoreGates {
    private readonly ix: ProgramIndex;
    private readonly R: Resolver;
    private readonly conditions: Conditions;

    constructor(ix: ProgramIndex, R: Resolver, conditions: Conditions) {
        this.ix = ix;
        this.R = R;
        this.conditions = conditions;
    }

    /** Constant -> the components rendered only when a condition compares equal to it. */
    build(): Map<string, Gate[]> {
        const out = new Map<string, Gate[]>();
        for (const [comp, usages] of this.ix.usages) {
            if (this.ix.isLibraryNode(comp)) {
                continue;
            }
            for (const u of usages as Usage[]) {
                const anchor = usageAnchorOf(u);
                const keys = new Set<string>();
                for (const c of this.conditions.raw(anchor)) {
                    if (!c.negate) {
                        this.constantsOf(c.expr, 0, new Set()).forEach((k) => keys.add(k));
                    }
                }
                for (const k of this.caseConstants(anchor)) {
                    keys.add(k);
                }
                for (const k of keys) {
                    out.set(k, [...(out.get(k) ?? []), {comp, usage: anchor}]);
                }
            }
        }
        return out;
    }

    /** `case RHSStates.PIN:` clauses around a usage, up to its render function. */
    private caseConstants(n: ts.Node): string[] {
        const out: string[] = [];
        for (let p = n.parent; p && !isFunctionLike(p); p = p.parent) {
            if (ts.isCaseClause(p)) {
                const k = constKey(this.ix, strip(p.expression) as ts.Expression);
                if (k) {
                    out.push(k);
                }
            }
        }
        return out;
    }

    /** The constants a condition is true for: `x === K`, through `&&`/`||`, locals, selectors and connected props. */
    private constantsOf(e: ts.Expression | undefined, depth: number, seen: Set<ts.Node>): string[] {
        const x = strip(e) as ts.Expression | undefined;
        if (!x || depth > MAX_STORE_CONDITION_DEPTH || seen.has(x)) {
            return [];
        }
        seen.add(x);
        if (ts.isBinaryExpression(x)) {
            const op = x.operatorToken.kind;
            if (op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken) {
                return [constKey(this.ix, strip(x.left) as ts.Expression), constKey(this.ix, strip(x.right) as ts.Expression)].filter((k): k is string => Boolean(k));
            }
            if (op === ts.SyntaxKind.AmpersandAmpersandToken || op === ts.SyntaxKind.BarBarToken) {
                return [...this.constantsOf(x.left, depth + 1, seen), ...this.constantsOf(x.right, depth + 1, seen)];
            }
            return [];
        }
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === 'Boolean') {
            return this.constantsOf(x.arguments[0], depth + 1, seen);
        }

        // useSelector((state) => getRhsState(state) === RHSStates.PIN)
        if (ts.isCallExpression(x) && ts.isIdentifier(x.expression) && x.expression.text === 'useSelector' && x.arguments[0] && isFunctionLike(x.arguments[0])) {
            return returnsOf(x.arguments[0]).flatMap((r) => this.constantsOf(r as ts.Expression, depth + 1, seen));
        }

        // a prop: the value connect's mapStateToProps gives it
        const pp = this.R.propsPath(x);
        if (pp && pp.comp && pp.path.length === 1) {
            return this.mapStateValues(pp.comp, pp.path[0]).flatMap((v) => this.constantsOf(v, depth + 1, seen));
        }

        // a local: its initializer
        if (ts.isIdentifier(x)) {
            const d = this.ix.checker.getSymbolAtLocation(x)?.valueDeclaration;
            if (d && ts.isVariableDeclaration(d) && ts.isIdentifier(d.name) && d.initializer) {
                return this.constantsOf(d.initializer, depth + 1, seen);
            }
        }
        return [];
    }

    /** The expressions `connect(mapStateToProps)` gives a prop: `isChannelInfo: rhsState === RHSStates.CHANNEL_INFO`. */
    private mapStateValues(comp: CodeNode, prop: string): ts.Expression[] {
        const map = this.ix.connectCalls.get(comp)?.arguments[0];
        const out: ts.Expression[] = [];
        const objects = (e: ts.Node | undefined, depth: number) => {
            const x = strip(e as ts.Expression) as ts.Node | undefined;
            if (!x || depth > MAX_MAP_STATE_DEPTH) {
                return;
            }
            if (ts.isObjectLiteralExpression(x)) {
                for (const p of x.properties) {
                    if (ts.isPropertyAssignment(p) && propName(p.name) === prop) {
                        out.push(p.initializer);
                    }
                }
                return;
            }
            if (isFunctionLike(x)) {
                returnsOf(x).forEach((r) => objects(r, depth + 1));
                return;
            }
            if (ts.isIdentifier(x) || ts.isCallExpression(x)) {
                const sym = this.ix.checker.getSymbolAtLocation(ts.isIdentifier(x) ? x : x.expression);
                const d = sym?.valueDeclaration;
                const def = this.ix.resolveSymbolToNode(sym) ?? (d && ts.isVariableDeclaration(d) ? d.initializer : undefined);
                if (def && !this.ix.isLibraryNode(def)) {
                    objects(def, depth + 1);
                }
            }
        };
        objects(map, 0);
        return out;
    }
}

function usageAnchorOf(u: Usage): ts.Node {
    if (isCallUsage(u)) {
        return u.call;
    }
    return ts.isJsxOpeningElement(u) ? u.parent : u;
}

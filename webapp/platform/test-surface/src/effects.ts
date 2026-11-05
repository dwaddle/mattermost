// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ts from 'typescript';

import {calleeName, isFunctionLike, isJsxTag, nameOfFunction, propName, returnsOf, shortText, strip, type FunctionLike} from './ast.ts';
import type {CodeNode, Loc, ProgramIndex} from './program_index.ts';
import {compatible} from './roles.ts';
import type {Operations} from './routes.ts';
import {constKey, isValuePosition} from './store_gates.ts';
import {assignmentsOf, type Resolver, type Source} from './values.ts';

export type Opened = {kind: 'modal' | 'popover' | 'page' | 'menu' | 'panel'; node: CodeNode | null; target: string; at: Loc; dialogOps?: string[]};

/** A navigation: its target expression (resolved to a route later), and whether only some paths through the handler take it. */
export type Navigation = {expr: ts.Expression | null; conditional: boolean};

export type Effects = {
    ops: Set<string>;
    opens: Map<string, Opened>;

    /** Where it navigates, by the target as written. */
    navigates: Map<string, Navigation>;

    /** Constants it passes on as data (`state: RHSStates.CHANNEL_INFO`), by declaration; matched to store-gated UI. */
    signals: Map<string, string>;

    /** Calls whose target can't be known statically (callbacks from data, registries, plugin hooks). */
    unresolved: string[];

    /** Calls of parent callbacks with no static source; their effects belong to the caller. */
    delegated: string[];
    assumedPure: number;
};

// `scoped`: a callback reached through a prop of another component, traced for one instance of that component
type Target = FunctionLike | ts.ClassElement | {callSite: ts.CallExpression} | {scoped: Target; comp: CodeNode; via: Loc[]};
type Targets = {targets: Target[]; lib?: boolean; prop?: boolean; param?: boolean; dynamic?: boolean};

export const emptyEffects = (): Effects => ({ops: new Set(), opens: new Map(), navigates: new Map(), signals: new Map(), unresolved: [], delegated: [], assumedPure: 0});

/** The first open of a target, with the dialogOps of every opener of it. */
export function withDialogOps<T extends {dialogOps?: string[]}>(prev: T | undefined, o: T): T {
    if (!prev) {
        return o;
    }
    if (!o.dialogOps?.length) {
        return prev;
    }
    return {...prev, dialogOps: [...new Set([...(prev.dialogOps ?? []), ...o.dialogOps])].sort()};
}

/** Adds b's effects to a; `conditional` when b runs only on some paths of a (a call inside an `if`). */
export function mergeEffects(a: Effects, b: Effects, conditional = false): Effects {
    for (const r of b.ops) {
        a.ops.add(r);
    }
    for (const [k, o] of b.opens) {
        a.opens.set(k, withDialogOps(a.opens.get(k), o));
    }
    for (const [k, n] of b.navigates) {
        const prev = a.navigates.get(k);
        const c = conditional || n.conditional;
        a.navigates.set(k, {expr: prev?.expr ?? n.expr, conditional: prev ? prev.conditional && c : c});
    }
    for (const [k, t] of b.signals) {
        a.signals.set(k, t);
    }
    a.unresolved.push(...b.unresolved);
    a.delegated.push(...b.delegated);
    a.assumedPure += b.assumedPure;
    return a;
}

const INJECTED_PROPS = ['intl', 'history', 'location', 'match', 'dispatch', 'theme'];
const BUILTIN = /^(map|filter|forEach|reduce|some|every|find|findIndex|includes|indexOf|join|split|trim|toLowerCase|toUpperCase|startsWith|endsWith|replace|slice|concat|push|pop|shift|unshift|splice|keys|values|entries|has|get|set|add|delete|then|catch|finally|preventDefault|stopPropagation|focus|blur|select|toString|test|match|assign|freeze|stringify|parse|log|warn|error|resolve|reject|all|setTimeout|clearTimeout|requestAnimationFrame|current|scrollIntoView|getBoundingClientRect|contains|closest|querySelector|getAttribute|setAttribute|bind|call|apply)$/;
const PURE_TYPE = /^(JSX\.Element|ReactNode|React\.ReactNode|React\.JSX\.Element|Element)/;

/**
 * Traces a handler through the call graph to the client requests it can fire, the modals it
 * opens and where it navigates. connect/bindActionCreators, props callbacks, hooks, IIFEs,
 * factories and state setters are followed; catch blocks and error logging are skipped.
 */
export class Tracer {
    private readonly ix: ProgramIndex;
    private readonly R: Resolver;
    private readonly ops: Operations;
    private readonly checker: ts.TypeChecker;
    private readonly memo = new Map<ts.Node, Effects>();
    private readonly inProgress = new Set<ts.Node>();

    /** Boolean parameters known for the function being traced (`handleChange(id, value)` leaves `doSubmit = false`). */
    private flags: Map<ts.Symbol, boolean> | null = null;
    private readonly flagMemo = new Map<ts.Node, Map<string, Effects>>();
    private readonly ctMemo = new Map<ts.Node, Targets>();
    private ctDepth = 0;

    constructor(ix: ProgramIndex, R: Resolver, ops: Operations) {
        this.ix = ix;
        this.R = R;
        this.ops = ops;
        this.checker = ix.checker;
    }

    // ---- connect(): props.actions.x -> action creator ------------------------------------

    fromConnect(comp: CodeNode, propPath: string[]): Target[] | null {
        if (!this.ix.connects.has(comp)) {
            return null;
        }
        const md = this.ix.connects.get(comp);
        const out: Target[] = [];
        const objFrom = (e: ts.Node | undefined, rest: string[]) => {
            const x = strip(e as ts.Expression);
            if (!x) {
                return;
            }
            if (isFunctionLike(x)) {
                for (const r of returnsOf(x)) {
                    objFrom(r, rest);
                }
                return;
            }
            if (ts.isIdentifier(x)) {
                const s = this.checker.getSymbolAtLocation(x);
                const d = s?.valueDeclaration;
                if (d && ts.isVariableDeclaration(d) && d.initializer) {
                    objFrom(d.initializer, rest);
                    return;
                }
                if (d && ts.isFunctionDeclaration(d)) {
                    objFrom(d, rest);
                    return;
                }
                if (!rest.length) {
                    const n = this.ix.resolveSymbolToNode(s);
                    if (n && isFunctionLike(n)) {
                        out.push(n);
                    }
                }
                return;
            }
            if (ts.isCallExpression(x)) {
                if (calleeName(x) === 'bindActionCreators') {
                    objFrom(x.arguments[0], rest);
                }
                return;
            }
            if (ts.isObjectLiteralExpression(x) && rest.length) {
                for (const p of x.properties) {
                    if (ts.isSpreadAssignment(p)) {
                        objFrom(p.expression, rest);
                        continue;
                    }
                    if (propName(p.name) !== rest[0]) {
                        continue;
                    }
                    if (ts.isShorthandPropertyAssignment(p)) {
                        const n = this.ix.resolveSymbolToNode(this.checker.getShorthandAssignmentValueSymbol(p));
                        if (n && isFunctionLike(n) && rest.length === 1) {
                            out.push(n);
                        }
                    } else if (ts.isPropertyAssignment(p)) {
                        const init = strip(p.initializer) as ts.Expression;
                        if (rest.length === 1 && isFunctionLike(init)) {
                            out.push(init);
                        } else if (rest.length === 1) {
                            out.push(...this.nodesFromValue(init));
                        } else {
                            objFrom(p.initializer, rest.slice(1));
                        }
                    } else if (ts.isMethodDeclaration(p) && rest.length === 1) {
                        out.push(p);
                    }
                }
            }
        };
        objFrom(md ?? undefined, propPath);
        return out;
    }

    // ---- callee targets -----------------------------------------------------------------

    /** While tracing one instance's handler: its component and usage chain (prop callbacks follow only that usage). */
    private instance: {comp: CodeNode; via: Loc[]} | null = null;
    private readonly instanceMemo = new Map<Target, Map<string, Effects>>();

    private inInstance(n: ts.Node): boolean {
        const comp = this.instance?.comp;
        return Boolean(comp && n.getSourceFile() === comp.getSourceFile() && n.pos >= comp.pos && n.end <= comp.end);
    }

    calleeTargets(c: ts.Expression): Targets {
        if (this.inInstance(c)) {
            return this.calleeTargetsInner(c);
        }
        const memo = this.ctMemo.get(c);
        if (memo) {
            return memo;
        }
        if (this.ctDepth > 12) {
            return {targets: [], dynamic: true};
        }
        this.ctDepth++;
        try {
            const r = this.calleeTargetsInner(c);
            this.ctMemo.set(c, r);
            return r;
        } finally {
            this.ctDepth--;
        }
    }

    private calleeTargetsInner(c0: ts.Expression): Targets {
        const c = strip(c0) as ts.Expression;

        // props callbacks: props.onX, this.props.onX, this.props.actions.foo, destructured
        const pp = this.R.propsPath(c);
        if (pp && pp.path.length && INJECTED_PROPS.includes(pp.path[0])) {
            return {targets: [], lib: true};
        }

        // methods of prop data (this.props.tabs.filter(...)) are not callbacks
        if (pp && pp.path.length > 1 && ts.isPropertyAccessExpression(c) && BUILTIN.test(c.name.text) && !this.isFunctionTyped(c)) {
            return {targets: [], lib: true};
        }
        if (pp && pp.comp && pp.path.length) {
            const targets: Target[] = [...(this.fromConnect(pp.comp, pp.path) ?? [])];
            const only = this.instance && pp.comp === this.instance.comp ? this.instance.via : null;
            for (const src of this.R.sources(c)) {
                if ('marker' in src || strip(src.expr) === c) {
                    continue;
                }
                if (only && !compatible({k: 'absent', via: src.via}, only)) {
                    continue;
                }

                // the callback belongs to the component that passed it; the rest of the instance chain is that
                // component's instance, so its own prop callbacks follow only this usage too (a shared dialog's
                // onConfirm, passed through a wrapper, is the one this opener supplied)
                const rest = only && src.via?.length ? only.slice(src.via.length) : null;
                const owner = rest?.length ? this.R.componentOf(src.expr) : null;
                const found = this.nodesFromValue(src.expr);
                targets.push(...(owner ? found.map((t): Target => ({scoped: t, comp: owner, via: rest!})) : found));
            }
            return {targets, prop: true};
        }

        // IIFEs and inline function values
        if (isFunctionLike(c)) {
            return {targets: [c]};
        }

        // factory results: makeGetChannel()(state), useX()(...)
        if (ts.isCallExpression(c)) {
            const inner = this.calleeTargets(c.expression).targets.filter((t): t is FunctionLike => isFunctionLike(t as ts.Node));
            const fns = inner.flatMap((f) => returnsOf(f)).flatMap((r) => this.nodesFromValue(r));
            return fns.length ? {targets: fns} : {targets: [], dynamic: true};
        }

        // obj.method() where obj is a local object, a bindActionCreators result or a hook's returned object
        if (ts.isPropertyAccessExpression(c) && !pp) {
            const fromObj = this.memberFromSources(c.expression, c.name.text);
            if (fromObj.length) {
                return {targets: fromObj};
            }
        }

        // redux thunk plumbing: the dispatched value is visited anyway
        if (ts.isIdentifier(c) && ['dispatch', 'getState'].includes(c.text)) {
            return {targets: [], lib: true};
        }

        // members of untyped values: library or DOM objects we can't see into
        if (ts.isPropertyAccessExpression(c)) {
            const rt = this.checker.getTypeAtLocation(c.expression);
            if (rt.flags & ts.TypeFlags.Any) {
                return {targets: [], lib: true};
            }
        }
        const sym = (ts.isIdentifier(c) || ts.isPropertyAccessExpression(c)) ? this.checker.getSymbolAtLocation(c) : undefined;
        if (!sym) {
            return ts.isPropertyAccessExpression(c) && BUILTIN.test(c.name.text) ? {targets: [], lib: true} : {targets: [], dynamic: true};
        }
        const node = this.ix.resolveSymbolToNode(sym);
        if (node && isFunctionLike(node)) {
            return {targets: [node]};
        }
        const d = sym.valueDeclaration ?? sym.declarations?.[0];
        if (d && this.ix.isLibraryNode(d)) {
            return {targets: [], lib: true};
        }

        // const [x, setX] = useState(): React state setters
        if (d && ts.isBindingElement(d) && ts.isArrayBindingPattern(d.parent)) {
            const vd = d.parent.parent;
            if (vd && ts.isVariableDeclaration(vd) && vd.initializer && (/^(React\.)?use(State|Reducer|Transition)\b/).test(vd.initializer.getText())) {
                return {targets: [], lib: true};
            }

            // const [submit, error] = useSubmit(...): the element at that index of what the hook returns
            if (vd && ts.isVariableDeclaration(vd) && vd.initializer && ts.isCallExpression(strip(vd.initializer) as ts.Node)) {
                const idx = d.parent.elements.indexOf(d);
                const call = strip(vd.initializer) as ts.CallExpression;
                const hooks = this.calleeTargets(call.expression).targets.filter((t): t is FunctionLike => isFunctionLike(t as ts.Node));
                const fns = hooks.flatMap((h) => returnsOf(h)).flatMap((r) => {
                    const arr = strip(r) as ts.Expression;
                    return ts.isArrayLiteralExpression(arr) && arr.elements[idx] ? this.nodesFromValue(arr.elements[idx]) : [];
                });
                if (fns.length) {
                    return {targets: fns};
                }
            }
        }

        // const h = …, or let h; if (…) h = …: every value it can hold
        if (d && ts.isVariableDeclaration(d) && (d.initializer || isLetDecl(d))) {
            const values = [...(d.initializer ? [d.initializer] : []), ...assignmentsOf(d, sym, this.checker)];
            return {targets: values.flatMap((v) => this.nodesFromValue(v))};
        }
        if (d && ts.isParameter(d)) {
            const srcs = this.R.sources(c).filter((x): x is {expr: ts.Expression; via: Loc[]} => !('marker' in x) && strip(x.expr) !== c);
            return {targets: srcs.flatMap((x) => this.nodesFromValue(x.expr)), param: true};
        }
        if (d && ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent)) {
            const bp = this.R.bindingPath(d);
            if (bp && bp.root.kind === 'expr' && bp.path.length === 1) {
                const fns = this.memberFromSources(bp.root.expr, bp.path[0]);
                if (fns.length) {
                    return {targets: fns};
                }
            }
        }
        if (d && (ts.isPropertyDeclaration(d) || ts.isPropertySignature(d) || ts.isMethodSignature(d))) {
            if (ts.isPropertyDeclaration(d) && d.initializer) {
                return {targets: this.nodesFromValue(d.initializer)};
            }
            return {targets: [], dynamic: true};
        }
        return {targets: [], lib: !d};
    }

    /** Whether `obj.m` is a function the app defines (a callback prop), not a method of data. */
    private isFunctionTyped(c: ts.PropertyAccessExpression): boolean {
        const owner = this.checker.getTypeAtLocation(c.expression);
        if (this.checker.isArrayType(owner) || (owner.flags & (ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike))) {
            return false;
        }
        const sym = owner.getProperty(c.name.text);
        const d = sym?.valueDeclaration ?? sym?.declarations?.[0];
        return Boolean(d && !this.ix.isLibraryNode(d) && !d.getSourceFile().isDeclarationFile);
    }

    /** Function values found under `name` in the object(s) an expression can evaluate to. */
    private memberFromSources(objExpr: ts.Expression, name: string): Target[] {
        const out: Target[] = [];
        for (const s of this.R.sources(objExpr)) {
            if ('marker' in s) {
                continue;
            }
            let src = strip(s.expr) as ts.Expression;
            if (ts.isCallExpression(src) && calleeName(src) === 'bindActionCreators' && src.arguments[0]) {
                src = strip(src.arguments[0]) as ts.Expression;
            }
            if (!ts.isObjectLiteralExpression(src)) {
                continue;
            }
            for (const p of src.properties) {
                if (propName(p.name) !== name) {
                    continue;
                }
                if (ts.isShorthandPropertyAssignment(p)) {
                    // `{onClick}`: the variable behind the property (a `let` takes every value assigned to it)
                    const vs = this.checker.getShorthandAssignmentValueSymbol(p);
                    const n = this.ix.resolveSymbolToNode(vs);
                    const vd = vs?.valueDeclaration;
                    if (n && isFunctionLike(n)) {
                        out.push(n);
                    } else if (vs && vd && ts.isVariableDeclaration(vd) && (vd.initializer || isLetDecl(vd))) {
                        const values = [...(vd.initializer ? [vd.initializer] : []), ...assignmentsOf(vd, vs, this.checker)];
                        out.push(...values.flatMap((v) => this.nodesFromValue(v)));
                    } else {
                        out.push(...this.nodesFromValue(p.name));
                    }
                } else if (ts.isPropertyAssignment(p)) {
                    out.push(...this.nodesFromValue(p.initializer));
                } else if (ts.isMethodDeclaration(p)) {
                    out.push(p);
                }
            }
        }
        return out;
    }

    nodesFromValue(v0: ts.Expression): Target[] {
        const v = strip(v0) as ts.Expression;
        if (!v) {
            return [];
        }
        if (isFunctionLike(v)) {
            return [v];
        }
        if (ts.isCallExpression(v)) {
            const cn = calleeName(v);
            if (['useCallback', 'useMemo', 'debounce', 'throttle', 'memoize', 'useEvent', 'useEffectEvent'].includes(cn) && v.arguments[0]) {
                return this.nodesFromValue(v.arguments[0]);
            }
            if (cn === 'bind' && ts.isPropertyAccessExpression(v.expression)) {
                return this.nodesFromValue(v.expression.expression);
            }

            // calling a factory that returns a handler: walk the call itself
            return [{callSite: v}];
        }
        if (ts.isIdentifier(v) || ts.isPropertyAccessExpression(v)) {
            return this.calleeTargets(v).targets;
        }
        if (ts.isConditionalExpression(v)) {
            return [...this.nodesFromValue(v.whenTrue), ...this.nodesFromValue(v.whenFalse)];
        }
        if (ts.isBinaryExpression(v) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.AmpersandAmpersandToken].includes(v.operatorToken.kind)) {
            return [...(v.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? [] : this.nodesFromValue(v.left)), ...this.nodesFromValue(v.right)];
        }
        return [];
    }

    // ---- effects ------------------------------------------------------------------------

    effectsOf(fn: Target): Effects {
        // flags bound for one function don't carry into the functions it calls
        const prevFlags = this.flags;
        this.flags = null;
        try {
            return this.effectsOfUnflagged(fn);
        } finally {
            this.flags = prevFlags;
        }
    }

    /** A call's effects with the boolean arguments it passes (or leaves at a literal default) known in the callee. */
    private effectsOfCall(fn: Target, call: ts.CallExpression): Effects {
        const f = fn as ts.Node;
        if (!isFunctionLike(f) || !f.body || this.inInstance(f)) {
            return this.effectsOf(fn);
        }
        const bound = new Map<ts.Symbol, boolean>();
        f.parameters.forEach((p, i) => {
            if (!ts.isIdentifier(p.name)) {
                return;
            }
            const arg = call.arguments[i] ?? (i >= call.arguments.length ? p.initializer : undefined);
            const k = arg?.kind;
            if (k === ts.SyntaxKind.TrueKeyword || k === ts.SyntaxKind.FalseKeyword) {
                const sym = this.checker.getSymbolAtLocation(p.name);
                if (sym) {
                    bound.set(sym, k === ts.SyntaxKind.TrueKeyword);
                }
            }
        });
        if (!bound.size) {
            return this.effectsOf(fn);
        }
        const key = [...bound].map(([sym, v]) => `${sym.getName()}=${v}`).sort().join(',');
        const memo = this.flagMemo.get(f)?.get(key);
        if (memo) {
            return memo;
        }
        if (this.inProgress.has(f)) {
            return emptyEffects();
        }
        const prevFlags = this.flags;
        this.flags = bound;
        this.inProgress.add(f);
        try {
            const acc = this.effectsOfExpr(f.body);
            const m = this.flagMemo.get(f) ?? new Map<string, Effects>();
            m.set(key, acc);
            this.flagMemo.set(f, m);
            return acc;
        } finally {
            this.inProgress.delete(f);
            this.flags = prevFlags;
        }
    }

    /** A bound flag's value for a condition that is the flag or its negation; null when the condition isn't one. */
    private flagValue(cond: ts.Expression): boolean | null {
        let c = strip(cond) as ts.Expression;
        let negate = false;
        while (ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken) {
            negate = !negate;
            c = strip(c.operand) as ts.Expression;
        }
        if (!this.flags || !ts.isIdentifier(c)) {
            return null;
        }
        const sym = this.checker.getSymbolAtLocation(c);
        const v = sym ? this.flags.get(sym) : undefined;
        return v === undefined ? null : v !== negate;
    }

    private effectsOfUnflagged(fn: Target): Effects {
        if ('callSite' in fn) {
            return this.effectsOfExpr(fn.callSite);
        }
        if ('scoped' in fn) {
            const prev = this.instance;
            this.instance = {comp: fn.comp, via: fn.via};
            try {
                return this.effectsOf(fn.scoped);
            } finally {
                this.instance = prev;
            }
        }

        // a function of the instance's component depends on which usage it is traced for: memoized per instance
        const local = this.inInstance(fn as ts.Node);
        const instanceKey = local ? this.instance!.via.join('<') : '';
        const memo = local ? this.instanceMemo.get(fn)?.get(instanceKey) : this.memo.get(fn);
        if (memo) {
            return memo;
        }
        if (this.inProgress.has(fn)) {
            return emptyEffects();
        }
        this.inProgress.add(fn);
        const body = (fn as FunctionLike).body ?? fn;
        const acc = this.effectsOfExpr(body);
        this.inProgress.delete(fn);
        if (local) {
            const m = this.instanceMemo.get(fn) ?? new Map<string, Effects>();
            m.set(instanceKey, acc);
            this.instanceMemo.set(fn, m);
        } else {
            this.memo.set(fn, acc);
        }
        return acc;
    }

    private isLibTarget(t: Target): boolean {
        return !('callSite' in t) && !('scoped' in t) && this.ix.isLibraryNode(t);
    }

    private addOpen(acc: Effects, kind: Opened['kind'], node: CodeNode | null, label: string, at: ts.Node) {
        const target = node ? componentName(node) : label;

        // per place: one handler can open the same component at two places (a save opens the self-exclusion
        // ConfirmModal or the confirmation one); opens that land on the same scope are merged once scopes are known
        const key = kind + ':' + target + '@' + this.ix.where(at);
        const dialogOps = ts.isObjectLiteralExpression(at) ? this.dialogOps(at) : [];
        acc.opens.set(key, withDialogOps(acc.opens.get(key), {kind, node, target, at: this.ix.where(at), ...(dialogOps.length ? {dialogOps} : {})}));
    }

    /**
     * The requests an openModal descriptor's `dialogProps` callbacks send (`onConfirm: () => createBookmark(…)`):
     * what the modal's buttons do when this opener opened it.
     */
    private dialogOps(descriptor: ts.ObjectLiteralExpression): string[] {
        const dp = descriptor.properties.find((p) => propName(p.name) === 'dialogProps');
        if (!dp || !ts.isPropertyAssignment(dp)) {
            return [];
        }
        const objects: ts.ObjectLiteralExpression[] = [];
        const init = strip(dp.initializer) as ts.Expression;
        if (ts.isObjectLiteralExpression(init)) {
            objects.push(init);
        } else {
            for (const src of this.R.sources(dp.initializer)) {
                if (!('marker' in src) && ts.isObjectLiteralExpression(strip(src.expr) as ts.Expression)) {
                    objects.push(strip(src.expr) as ts.ObjectLiteralExpression);
                }
            }
        }
        const ops = new Set<string>();
        for (const obj of objects) {
            for (const p of obj.properties) {
                let value: ts.Expression | undefined;
                if (ts.isPropertyAssignment(p)) {
                    value = p.initializer;
                } else if (ts.isShorthandPropertyAssignment(p)) {
                    value = p.name;
                }
                if (value) {
                    // a prop callback (`handleConfirm: onDelete`) is the one this instance's usage passed
                    const via = this.inInstance(value) ? this.instance!.via : undefined;
                    this.effectsOfHandler(value, via).ops.forEach((op) => ops.add(op));
                }
            }
        }
        return [...ops].sort();
    }

    private effectsOfExpr(root: ts.Node): Effects {
        const acc = emptyEffects();
        const client = this.ix.config.client?.className ?? 'Client4';
        const visit = (n: ts.Node) => {
            // client.method referenced or called
            if (ts.isPropertyAccessExpression(n) && ts.isIdentifier(n.expression) && n.expression.text === client) {
                for (const op of this.ops.byClientMethod.get(n.name.text) ?? []) {
                    acc.ops.add(op.opId);
                }
            }

            // error paths are not what an action does
            if (ts.isCatchClause(n)) {
                return;
            }

            // a branch a bound flag rules out (`if (doSubmit)` for a call that left it false)
            if (ts.isIfStatement(n)) {
                const v = this.flagValue(n.expression);
                if (v !== null) {
                    visit(n.expression);
                    const live = v ? n.thenStatement : n.elseStatement;
                    if (live) {
                        visit(live);
                    }
                    return;
                }
            }

            // openModal({dialogType, dialogProps: {onConfirm: () => …}}): the callbacks are the modal's, run when its
            // buttons are clicked; the dialog's own elements take them through dialogProps, not the click that opens it
            if (isDialogCallback(n)) {
                return;
            }
            if (ts.isCallExpression(n) && this.ix.config.errorCalls.test(n.expression.getText())) {
                return;
            }

            // {dialogType: X} (openModal descriptors and the like)
            // (recorded at the descriptor object, where values that flow through its dialogProps are tagged)
            if (ts.isPropertyAssignment(n) && n.name.getText() === 'dialogType') {
                const node = this.ix.unwrapExpr(n.initializer);
                this.addOpen(acc, 'modal', node, shortText(n.initializer, 40), ts.isObjectLiteralExpression(n.parent) ? n.parent : n);
            }
            if (ts.isCallExpression(n) && (/(^|\.)openModal$/).test(n.expression.getText()) && n.arguments[0] && !ts.isObjectLiteralExpression(strip(n.arguments[0]) as ts.Node)) {
                this.descriptorOpens(acc, n.arguments[0]);
            }

            // a constant passed on as data: it may select store-gated UI (the panel a click shows)
            if (ts.isPropertyAccessExpression(n) && isValuePosition(n)) {
                const k = constKey(this.ix, n);
                if (k) {
                    acc.signals.set(k, n.getText());
                }
            }

            // navigation
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && ['push', 'replace'].includes(n.expression.name.text) && (/history|router/i).test(n.expression.expression.getText())) {
                mergeEffects(acc, {...emptyEffects(), navigates: new Map([[n.arguments[0] ? shortText(n.arguments[0], 60) : '?', {expr: n.arguments[0] ?? null, conditional: inBranch(n, root)}]])});
            }

            // local state that shows a modal/popover: setShowX(true), this.setState({showX: true})
            if (ts.isCallExpression(n)) {
                this.localStateOpens(acc, n);
            }

            if (ts.isCallExpression(n)) {
                const t = this.calleeTargets(n.expression);
                if (t.targets.length) {
                    for (const f of t.targets) {
                        if (!this.isLibTarget(f)) {
                            mergeEffects(acc, this.effectsOfCall(f, n), inBranch(n, root));
                        }
                    }
                } else if (t.prop || t.param) {
                    acc.delegated.push(this.ix.where(n) + ' ' + shortText(n.expression, 50));
                } else if (t.dynamic) {
                    // a call whose result is a plain value (boolean/string/number/JSX) is computation, not a request
                    const rt = this.checker.getTypeAtLocation(n);
                    const txt = this.checker.typeToString(rt);
                    const pure = (rt.flags & (ts.TypeFlags.BooleanLike | ts.TypeFlags.StringLike | ts.TypeFlags.NumberLike | ts.TypeFlags.Void)) || PURE_TYPE.test(txt);
                    if (pure) {
                        acc.assumedPure++;
                    } else {
                        acc.unresolved.push(this.ix.where(n) + ' ' + shortText(n.expression, 50));
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(root);
        return acc;
    }

    /** openModal(descriptor) where the descriptor is built elsewhere: follow it to its object literal(s). */
    private descriptorOpens(acc: Effects, arg: ts.Expression) {
        for (const src of this.R.sources(arg)) {
            if ('marker' in src) {
                continue;
            }
            const obj = strip(src.expr) as ts.Expression;
            if (!ts.isObjectLiteralExpression(obj)) {
                continue;
            }
            const p = obj.properties.find((q) => propName(q.name) === 'dialogType');
            if (p && ts.isPropertyAssignment(p)) {
                this.addOpen(acc, 'modal', this.ix.unwrapExpr(p.initializer), shortText(p.initializer, 40), obj);
            }
        }
    }

    private localStateOpens(acc: Effects, call: ts.CallExpression) {
        const arg = call.arguments[0];
        if (!arg) {
            return;
        }

        // const [show, setShow] = useState(false); setShow(true)
        if (ts.isIdentifier(call.expression) && arg.kind === ts.SyntaxKind.TrueKeyword) {
            const d = this.checker.getSymbolAtLocation(call.expression)?.valueDeclaration;
            if (d && ts.isBindingElement(d) && ts.isArrayBindingPattern(d.parent)) {
                const stateEl = d.parent.elements[0];
                const stateSym = stateEl && !ts.isOmittedExpression(stateEl) ? this.checker.getSymbolAtLocation(stateEl.name) : undefined;
                let fn: ts.Node | undefined = d;
                while (fn && !isFunctionLike(fn)) {
                    fn = fn.parent;
                }
                if (fn && stateSym) {
                    const tag = this.jsxGuardedBy(fn, (id) => ts.isIdentifier(id) && this.checker.getSymbolAtLocation(id) === stateSym);
                    if (tag) {
                        this.addOpen(acc, this.popoverOrModal(tag), this.ix.componentOfTag(tag), tag.tagName.getText(), tag);
                    }
                }
            }
            return;
        }

        // this.setState({showX: true})
        if (ts.isPropertyAccessExpression(call.expression) && call.expression.name.text === 'setState' && call.expression.expression.kind === ts.SyntaxKind.ThisKeyword && ts.isObjectLiteralExpression(arg)) {
            const cls = findClass(call);
            if (!cls) {
                return;
            }
            for (const p of arg.properties) {
                if (!ts.isPropertyAssignment(p) || p.initializer.kind !== ts.SyntaxKind.TrueKeyword) {
                    continue;
                }
                const key = propName(p.name);
                if (!key) {
                    continue;
                }
                const tag = this.jsxGuardedBy(cls, (id) => ts.isPropertyAccessExpression(id) && id.name.text === key && (/^this\.state$|^state$/).test(id.expression.getText()));
                if (tag) {
                    this.addOpen(acc, this.popoverOrModal(tag), this.ix.componentOfTag(tag), tag.tagName.getText(), tag);
                }
            }
        }
    }

    /** A modal when its tag is named like one, or when the component renders a modal or dialog itself (`<MoreDirectChannels/>` renders `<GenericModal>`). */
    private popoverOrModal(tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement): Opened['kind'] {
        if ((/Modal|Dialog/).test(tag.tagName.getText())) {
            return 'modal';
        }
        const node = this.ix.componentOfTag(tag);
        const rendersDialog = (n: ts.Node): boolean => (isJsxTag(n) && (/Modal|Dialog/).test(n.tagName.getText())) || Boolean(ts.forEachChild(n, (c) => rendersDialog(c) || undefined));
        return node && rendersDialog(node) ? 'modal' : 'popover';
    }

    /** The JSX element that a state value guards (`{x && <C/>}`, `x ? <C/> : …`, `if (x) { m = <C/>; }`) or is passed to (`<C show={x}/>`). */
    private jsxGuardedBy(scope: ts.Node, isState: (n: ts.Node) => boolean): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null {
        let found: ts.JsxOpeningElement | ts.JsxSelfClosingElement | null = null;
        const firstJsx = (n: ts.Node): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null => {
            if (ts.isJsxElement(n)) {
                return n.openingElement;
            }
            if (ts.isJsxSelfClosingElement(n)) {
                return n;
            }
            return ts.forEachChild(n, firstJsx) ?? null;
        };
        const tagOf = (e: ts.Node): ts.JsxOpeningElement | ts.JsxSelfClosingElement | null => {
            const r = strip(e as ts.Expression) as ts.Node;
            if (ts.isJsxElement(r)) {
                return r.openingElement;
            }
            return ts.isJsxSelfClosingElement(r) ? r : null;
        };
        const w = (m: ts.Node) => {
            if (found) {
                return;
            }
            if (isState(m)) {
                let p: ts.Node | undefined = m.parent;
                for (let i = 0; i < 4 && p && !found; i++, p = p.parent) {
                    if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                        found = tagOf(p.right);
                    } else if (ts.isConditionalExpression(p)) {
                        found = tagOf(p.whenTrue);
                    } else if (ts.isIfStatement(p) && m.pos >= p.expression.pos && m.end <= p.expression.end) {
                        // if (this.state.x) { modal = <C/>; }: only a dialog, since an if on state often picks a loading view
                        const t = firstJsx(p.thenStatement);
                        found = t && this.popoverOrModal(t) === 'modal' ? t : null;
                    } else if (ts.isJsxAttribute(p) && isJsxTag(p.parent.parent) && (/^(show|open|isOpen|visible|isVisible|showModal)$/).test(p.name.getText())) {
                        found = p.parent.parent;
                    }
                }
            }
            ts.forEachChild(m, w);
        };
        w(scope);
        return found;
    }

    /**
     * The component an instance's usages render: the enclosing function the app renders as a tag, not a helper inside
     * it (`generateInput` in `Input`), whose closure reads the component's props.
     */
    private instanceComponent(expr: ts.Node): CodeNode | null {
        const nearest = this.R.componentOf(expr);
        for (let n: CodeNode | null = nearest; n; n = this.R.componentOf(n)) {
            if (this.ix.usages.has(n)) {
                return n;
            }
        }
        return nearest;
    }

    /**
     * Runs `fn` for one instance of the component `expr` is in (a local handler calling props callbacks):
     * the callbacks it reaches through props follow only the usage chain `via`.
     */
    private forInstance<T>(expr: ts.Expression, via: Loc[] | undefined, fn: () => T): T {
        const comp = via?.length && !this.instance ? this.instanceComponent(expr) : null;
        if (!comp) {
            return fn();
        }
        this.instance = {comp, via: via!};
        try {
            return fn();
        } finally {
            this.instance = null;
        }
    }

    /** Effects of a handler expression (an `on*` attribute value). With `via`, prop callbacks only follow that instance's usages. */
    effectsOfHandler(expr: ts.Expression, via?: Loc[]): Effects {
        const acc = emptyEffects();
        const srcs: Source[] = this.R.propsPath(expr) ? this.R.sources(expr) : [{expr, via: []}];
        let any = false;
        for (const src of srcs) {
            if ('marker' in src) {
                continue;
            }
            if (via && !compatible({k: 'absent', via: src.via}, via)) {
                continue;
            }
            const ts0 = this.nodesFromValue(src.expr);
            for (const f of ts0) {
                any = true;

                // the source belongs to the component its usage chain reaches; the rest of the chain is that component's instance
                mergeEffects(acc, this.isLibTarget(f) ? emptyEffects() : this.forInstance(src.expr, via?.slice(src.via.length), () => this.effectsOf(f)));
            }
        }
        if (!any) {
            if (this.R.propsPath(expr)) {
                acc.delegated.push(this.ix.where(expr) + ' ' + shortText(expr, 40));
            } else {
                acc.unresolved.push('handler:' + this.ix.where(expr) + ' ' + shortText(expr, 40));
            }
        }
        return acc;
    }
}

function isLetDecl(d: ts.VariableDeclaration): boolean {
    return ts.isVariableDeclarationList(d.parent) && (d.parent.flags & ts.NodeFlags.Let) !== 0;
}

/** A function value inside the `dialogProps` of an object that also has `dialogType` (an openModal descriptor). */
function isDialogCallback(n: ts.Node): boolean {
    if (!isFunctionLike(n) || !ts.isPropertyAssignment(n.parent) || !ts.isObjectLiteralExpression(n.parent.parent)) {
        return false;
    }
    const props = n.parent.parent;
    const holder = props.parent;
    if (!holder || !ts.isPropertyAssignment(holder) || propName(holder.name) !== 'dialogProps' || !ts.isObjectLiteralExpression(holder.parent)) {
        return false;
    }
    return holder.parent.properties.some((p) => propName(p.name) === 'dialogType');
}

function findClass(n: ts.Node): ts.ClassLikeDeclaration | null {
    for (let p = n.parent; p; p = p.parent) {
        if (ts.isClassLike(p)) {
            return p;
        }
    }
    return null;
}

export function componentName(node: CodeNode): string {
    if (ts.isClassLike(node)) {
        return node.name?.text ?? nameOfFunction(node);
    }
    return nameOfFunction(node);
}

/** Whether `n` runs only on some paths through `root`: inside an if/else arm, a ternary arm, the right of && || ??, or a switch case. */
function inBranch(n: ts.Node, root: ts.Node): boolean {
    for (let c = n; c !== root && c.parent; c = c.parent) {
        const p = c.parent;
        if ((ts.isIfStatement(p) || ts.isConditionalExpression(p)) && c !== (ts.isIfStatement(p) ? p.expression : p.condition)) {
            return true;
        }
        if (ts.isBinaryExpression(p) && c === p.right && [ts.SyntaxKind.AmpersandAmpersandToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(p.operatorToken.kind)) {
            return true;
        }
        if (ts.isCaseClause(p) || ts.isDefaultClause(p)) {
            return true;
        }
    }
    return false;
}

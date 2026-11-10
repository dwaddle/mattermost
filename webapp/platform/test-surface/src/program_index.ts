// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import ts from 'typescript';

import {exprName, isFunctionLike, isIntrinsic, isJsxTag, strip, type FunctionLike, type JsxTag} from './ast.ts';
import type {Config} from './config.ts';
import type {LoadedProgram} from './program.ts';

/** A component or function the index can point at: a function-like node or a class. */
export type CodeNode = FunctionLike | ts.ClassLikeDeclaration;

/** Where a component is referenced as a modal: `{dialogType: X, dialogProps}` or `<ToggleModalButton dialogType={X} dialogProps={...}>`. */
export type DialogRef = {kind: 'object'; node: ts.ObjectLiteralExpression} | {kind: 'jsx'; node: JsxTag};

export type Loc = string;

/** Where something is, as the manifest names it: `channels/src/…/file.tsx#Component`, or the file alone. */
export type SourceRef = string;

/** `React.createElement(Comp, props)`: a usage whose attributes are an object. */
export type CallUsage = {kind: 'call'; call: ts.CallExpression; props: ts.Expression | undefined};

/** A place a component is rendered: a JSX tag, or a createElement call. */
export type Usage = JsxTag | CallUsage;

export type UsageAttr = {name: string; value: ts.Expression | undefined} | {spread: ts.Expression};

export function isCallUsage(u: Usage): u is CallUsage {
    return (u as CallUsage).kind === 'call';
}

/** The node a usage is located at (for locations and render conditions). */
export function usageNode(u: Usage): ts.Node {
    return isCallUsage(u) ? u.call : u;
}

/** A usage's attributes in source order; a bare JSX attribute has no value. */
export function usageAttrs(u: Usage): UsageAttr[] {
    if (!isCallUsage(u)) {
        return u.attributes.properties.map((p) => {
            if (ts.isJsxSpreadAttribute(p)) {
                return {spread: p.expression};
            }
            const init = p.initializer;
            const value = init && ts.isJsxExpression(init) ? init.expression : init as ts.Expression | undefined;
            return {name: p.name.getText(), value};
        });
    }
    const props = strip(u.props) as ts.Expression | undefined;
    if (!props) {
        return [];
    }
    if (!ts.isObjectLiteralExpression(props)) {
        return [{spread: props}];
    }
    const out: UsageAttr[] = [];
    for (const p of props.properties) {
        if (ts.isSpreadAssignment(p)) {
            out.push({spread: p.expression});
        } else if (ts.isPropertyAssignment(p)) {
            const name = propNameText(p.name);
            if (name) {
                out.push({name, value: p.initializer});
            }
        } else if (ts.isShorthandPropertyAssignment(p)) {
            out.push({name: p.name.text, value: p.name});
        }
    }
    return out;
}

function propNameText(n: ts.PropertyName): string | null {
    if (ts.isIdentifier(n) || ts.isStringLiteral(n) || ts.isNumericLiteral(n)) {
        return n.text;
    }
    return null;
}

/** What one file contributes to the index, plus every file its symbol resolution looked at. */
type FileEntries = {
    sf: ts.SourceFile;
    usages: Array<[ts.Node, JsxTag]>;
    calls: Array<[ts.Node, ts.CallExpression]>;
    dialogRefs: Array<[ts.Node, DialogRef]>;
    connects: Array<[ts.Node, ts.Expression | null]>;
    connectCalls: Array<[ts.Node, ts.CallExpression]>;

    /** Tags whose component isn't a plain reference, and `createElement` calls: what the dynamic-usage pass resolves. */
    dynamic: ts.Node[];
    deps: Set<ts.SourceFile>;
};

/**
 * One pass over every in-scope file of the program:
 * component usages (JSX tag -> component node, through aliases, HOCs and React.lazy),
 * call sites per function, dialogType references, and connect() wrappers.
 */
export class ProgramIndex {
    readonly program: ts.Program;
    readonly checker: ts.TypeChecker;
    readonly config: Config;
    readonly files: ts.SourceFile[];

    readonly usages = new Map<ts.Node, Usage[]>();
    readonly calls = new Map<ts.Node, ts.CallExpression[]>();
    readonly dialogRefs = new Map<ts.Node, DialogRef[]>();
    readonly connects = new Map<ts.Node, ts.Expression | null>();

    /** The `connect(mapStateToProps, mapDispatchToProps)` call that wraps a component. */
    readonly connectCalls = new Map<ts.Node, ts.CallExpression>();
    readonly stats: Record<string, number> = {};

    /** Dynamic usages: the usage chains (innermost first) of the sources that supplied the component. */
    readonly dynamicVia = new Map<ts.Node, Map<Usage, Loc[][]>>();

    /** Per-file entries, reused by the next index (watch mode) when nothing they depend on changed. */
    readonly entries = new Map<string, FileEntries>();

    /** The first symbol the checker failed to resolve, and why (`stats.resolverErrors` counts them). */
    resolverError: string | null = null;

    private readonly includeDirs: string[];
    private deps: Set<ts.SourceFile> | null = null;

    constructor(loaded: LoadedProgram, config: Config, previous?: ProgramIndex) {
        this.program = loaded.program;
        this.checker = loaded.checker;
        this.config = config;
        this.includeDirs = config.include.map((d) => (d.endsWith(path.sep) ? d : d + path.sep));
        this.files = this.program.getSourceFiles().filter((sf) => this.inScope(sf.fileName));
        const t0 = Date.now();
        let reused = 0;
        for (const sf of this.files) {
            const prev = previous?.entries.get(sf.fileName);
            const fresh = prev && prev.sf === sf && [...prev.deps].every((d) => this.program.getSourceFile(d.fileName) === d);
            const e = fresh ? prev : this.indexFile(sf);
            if (fresh) {
                reused++;
            }
            this.entries.set(sf.fileName, e);
            for (const [k, v] of e.usages) {
                this.push(this.usages, k, v);
            }
            for (const [k, v] of e.calls) {
                this.push(this.calls, k, v);
            }
            for (const [k, v] of e.dialogRefs) {
                this.push(this.dialogRefs, k, v);
            }
            for (const [k, v] of e.connects) {
                this.connects.set(k, v);
            }
            for (const [k, v] of e.connectCalls) {
                this.connectCalls.set(k, v);
            }
        }
        Object.assign(this.stats, {
            indexMs: Date.now() - t0,
            reusedFiles: reused,
            files: this.files.length,
            components: this.usages.size,
            functions: this.calls.size,
            connected: this.connects.size,
            dialogTargets: this.dialogRefs.size,
        });
    }

    inScope(fileName: string): boolean {
        const f = path.resolve(fileName);
        if (f.includes(`${path.sep}node_modules${path.sep}`) || f.endsWith('.d.ts')) {
            return false;
        }
        if (!this.includeDirs.some((d) => f.startsWith(d))) {
            return false;
        }
        const rel = this.rel(f);
        return !this.config.exclude.some((r) => r.test('/' + rel));
    }

    isLibraryNode(n: ts.Node | null | undefined): boolean {
        return !n || !this.inScope(n.getSourceFile().fileName);
    }

    rel(file: string): string {
        return path.relative(this.config.root, file).split(path.sep).join('/');
    }

    /**
     * Where a node is, exactly: `file:line:column`. Used inside the scan only (keys, usage chains, diagnostics);
     * the manifest names places by `ref()`, which doesn't change when a line is added above.
     */
    where(n: ts.Node): Loc {
        const sf = n.getSourceFile();
        const {line, character} = sf.getLineAndCharacterOfPosition(n.getStart(sf));
        const loc = `${this.rel(sf.fileName)}:${line + 1}:${character + 1}`;
        if (!this.refs.has(loc)) {
            this.refs.set(loc, this.ref(n));
        }
        return loc;
    }

    private readonly refs = new Map<Loc, SourceRef>();

    /** The `file#Component` a location `where()` returned is in (the file alone for a location not in the program). */
    refOf(loc: Loc): SourceRef {
        return this.refs.get(loc) ?? fileOfLoc(loc);
    }

    /**
     * Where a node is, as the manifest names it: `file#Name`, the top-level component, class or function it is in
     * (the declaration's name, through HOC wrappers: `const X = memo(() => …)` is `X`), or the file alone for module-level
     * code that isn't in one.
     */
    ref(n: ts.Node): SourceRef {
        const sf = n.getSourceFile();
        const file = this.rel(sf.fileName);
        let top: ts.Node = n;
        while (top.parent && !ts.isSourceFile(top.parent)) {
            top = top.parent;
        }
        const name = topLevelName(top);
        return name ? `${file}#${name}` : file;
    }

    /** `export const <name> = {…}` (possibly `as const` / `satisfies`) in a file. */
    constObject(file: string, name: string): ts.ObjectLiteralExpression | undefined {
        const sf = this.program.getSourceFile(file);
        for (const st of sf?.statements ?? []) {
            if (ts.isVariableStatement(st)) {
                for (const d of st.declarationList.declarations) {
                    const init = d.initializer && strip(d.initializer);
                    if (ts.isIdentifier(d.name) && d.name.text === name && init && ts.isObjectLiteralExpression(init)) {
                        return init;
                    }
                }
            }
        }
        return undefined;
    }

    // ---- symbol -> code node --------------------------------------------------------

    private readonly symbolMemo = new Map<ts.Symbol, {node: CodeNode | null; deps: ts.SourceFile[]}>();

    /** Resolves a symbol to the function/class it denotes, unwrapping aliases and HOCs. */
    resolveSymbolToNode(sym: ts.Symbol | undefined, seen = new Set<ts.Symbol>()): CodeNode | null {
        if (!sym || seen.has(sym)) {
            return null;
        }
        const hit = this.symbolMemo.get(sym);
        if (hit) {
            hit.deps.forEach((d) => this.deps?.add(d));
            return hit.node;
        }
        seen.add(sym);
        const outer = this.deps;
        const mine = new Set<ts.SourceFile>();
        this.deps = mine;
        let r: CodeNode | null = null;
        try {
            let s = sym;
            if (s.flags & ts.SymbolFlags.Alias) {
                s = this.checker.getAliasedSymbol(s);
            }
            for (const decl of [...(sym.declarations ?? []), ...(s.declarations ?? [])]) {
                mine.add(decl.getSourceFile());
            }
            const d = s.declarations?.[0];
            r = d ? this.resolveDeclToNode(d, seen) : null;
        } catch (e) {
            // the checker can throw on a symbol it can't resolve: counted, and the first one kept to report
            this.stats.resolverErrors = (this.stats.resolverErrors ?? 0) + 1;
            this.resolverError ??= `${sym.getName()}: ${(e as Error).message.split('\n')[0]}`;
            r = null;
        } finally {
            this.deps = outer;
            mine.forEach((d) => outer?.add(d));
        }
        this.symbolMemo.set(sym, {node: r, deps: [...mine]});
        return r;
    }

    /** The component/function an expression denotes: arrows, identifiers, HOC calls, React.lazy. */
    unwrapExpr(e: ts.Expression | undefined, seen = new Set<ts.Symbol>()): CodeNode | null {
        const x = strip(e);
        if (!x) {
            return null;
        }
        if (ts.isArrowFunction(x) || ts.isFunctionExpression(x) || ts.isClassExpression(x)) {
            return x;
        }

        // styled(X)`…`: renders X (see the call case below)
        if (ts.isTaggedTemplateExpression(x)) {
            const wrapped = styledTarget(x.tag);
            return wrapped ? this.unwrapExpr(wrapped, seen) : null;
        }
        if (ts.isIdentifier(x) || ts.isPropertyAccessExpression(x)) {
            return this.resolveSymbolToNode(this.checker.getSymbolAtLocation(x), seen);
        }
        if (ts.isCallExpression(x)) {
            const callee = strip(x.expression);
            const cn = exprName(callee);

            // styled(X, opts)(styles) / styled(X)`...`: a styling wrapper; with a component of ours as X, it
            // renders X with the usage's props (`styled.div`, `styled('div')` and library components stay null)
            if (isStyledCall(x)) {
                const wrapped = styledTarget(x);
                return wrapped ? this.unwrapExpr(wrapped, seen) : null;
            }

            // React.lazy(() => import('x')): the module's default export
            if (cn === 'lazy' || cn === 'makeAsyncComponent') {
                const imp = findDynamicImport(x);
                if (imp && imp.arguments[0]) {
                    const mod = this.checker.getSymbolAtLocation(imp.arguments[0]);
                    const def = mod && this.checker.getExportsOfModule(mod).find((m) => m.getName() === 'default');
                    if (def) {
                        return this.resolveSymbolToNode(def, seen);
                    }
                }
            }

            // memo(X, areEqual): the component is the first argument (the comparator is a function too)
            if (cn === 'memo' && x.arguments.length > 1) {
                return this.unwrapExpr(x.arguments[0], seen);
            }

            // HOCs: memo(X), forwardRef(fn), connect(a, b)(X), injectIntl(X), withRouter(X), compose(...)(X): the last argument that is a component
            for (let i = x.arguments.length - 1; i >= 0; i--) {
                const r = this.unwrapExpr(x.arguments[i], seen);
                if (r) {
                    return r;
                }
            }
        }
        return null;
    }

    private resolveDeclToNode(d: ts.Declaration, seen: Set<ts.Symbol>): CodeNode | null {
        if (ts.isFunctionDeclaration(d) || ts.isClassDeclaration(d) || ts.isMethodDeclaration(d)) {
            return d;
        }
        if (ts.isVariableDeclaration(d)) {
            return this.unwrapExpr(d.initializer, seen);
        }
        if (ts.isExportAssignment(d)) {
            return this.unwrapExpr(d.expression, seen);
        }
        if (ts.isPropertyAssignment(d)) {
            return this.unwrapExpr(d.initializer, seen);
        }

        // a class field that holds a component (`static ItemSubMenu = SubMenuItem`), a function or a class
        if (ts.isPropertyDeclaration(d) && d.initializer) {
            const r = this.unwrapExpr(d.initializer, seen);
            return r && (isFunctionLike(r) || ts.isClassLike(r)) ? r : null;
        }
        if (ts.isShorthandPropertyAssignment(d)) {
            return this.resolveSymbolToNode(this.checker.getShorthandAssignmentValueSymbol(d), seen);
        }
        if (ts.isExportSpecifier(d) || ts.isImportSpecifier(d) || ts.isImportClause(d)) {
            const s = this.checker.getSymbolAtLocation(d.name ?? d);
            return s ? this.resolveSymbolToNode(s, seen) : null;
        }
        return null;
    }

    /** The component a JSX tag renders, or null for intrinsic/unknown tags. */
    componentOfTag(tag: JsxTag): CodeNode | null {
        if (isIntrinsic(tag)) {
            return null;
        }
        return this.resolveSymbolToNode(this.checker.getSymbolAtLocation(tag.tagName));
    }

    // ---- dynamic usages ---------------------------------------------------------------

    /**
     * Tags whose name is a value (`const Input = props.inputComponent; <Input/>`, `<props.as/>`) and
     * `React.createElement(X, props)` calls: the components they can render, found through value
     * sources (which needs the resolver, so this runs after the index is built).
     */
    addDynamicUsages(sourcesOf: (e: ts.Expression) => Array<{expr: ts.Expression; via: Loc[]}>): number {
        let added = 0;
        const add = (target: CodeNode, u: Usage, via: Loc[]) => {
            if (this.isLibraryNode(target)) {
                return;
            }
            const byUsage = this.dynamicVia.get(target) ?? new Map<Usage, Loc[][]>();
            this.dynamicVia.set(target, byUsage);
            const vias = byUsage.get(u);
            if (vias) {
                vias.push(via);
                return;
            }
            byUsage.set(u, [via]);
            this.push(this.usages, target, u);
            added++;
        };
        const targetsOf = (e: ts.Expression): Array<[CodeNode, Loc[]]> => {
            const out: Array<[CodeNode, Loc[]]> = [];
            for (const src of sourcesOf(e)) {
                const s = strip(src.expr) as ts.Expression;
                if (ts.isStringLiteralLike(s)) {
                    continue;
                }
                const n = this.unwrapExpr(s);
                if (n) {
                    out.push([n, src.via]);
                }
            }
            return out;
        };

        // the candidates come from the (incremental) index: unchanged files aren't walked again
        for (const entry of this.entries.values()) {
            for (const n of entry.dynamic) {
                if (isJsxTag(n)) {
                    for (const [t, via] of targetsOf(n.tagName as ts.Expression)) {
                        add(t, n, via);
                    }
                } else if (ts.isCallExpression(n)) {
                    const u: CallUsage = {kind: 'call', call: n, props: n.arguments[1]};
                    for (const [t, via] of targetsOf(n.arguments[0])) {
                        add(t, u, via);
                    }
                }
            }
        }
        this.stats.dynamicUsages = added;
        return added;
    }

    // ---- indexing ---------------------------------------------------------------------

    private push<K, V>(m: Map<K, V[]>, k: K, v: V) {
        const arr = m.get(k);
        if (arr) {
            arr.push(v);
        } else {
            m.set(k, [v]);
        }
    }

    private indexFile(sf: ts.SourceFile): FileEntries {
        const e: FileEntries = {sf, usages: [], calls: [], dialogRefs: [], connects: [], connectCalls: [], dynamic: [], deps: new Set([sf])};
        this.deps = e.deps;
        const visit = (n: ts.Node) => {
            if (isJsxTag(n)) {
                const node = this.componentOfTag(n);
                if (node) {
                    e.usages.push([node, n]);
                } else if (!isIntrinsic(n)) {
                    e.dynamic.push(n);
                }
                const dt = n.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === 'dialogType');
                if (dt && dt.initializer && ts.isJsxExpression(dt.initializer)) {
                    const target = this.unwrapExpr(dt.initializer.expression);
                    if (target) {
                        e.dialogRefs.push([target, {kind: 'jsx', node: n}]);
                    }
                }
            } else if (ts.isCallExpression(n)) {
                const callee = strip(n.expression);
                if (ts.isIdentifier(callee) || ts.isPropertyAccessExpression(callee)) {
                    const node = this.resolveSymbolToNode(this.checker.getSymbolAtLocation(callee));
                    if (node && isFunctionLike(node)) {
                        e.calls.push([node, n]);
                    }
                }
                if (exprName(strip(n.expression) as ts.Expression) === 'createElement' && n.arguments[0]) {
                    e.dynamic.push(n);
                }
                const conn = this.indexConnect(n);
                if (conn) {
                    e.connects.push([conn.comp, conn.dispatch]);
                    e.connectCalls.push([conn.comp, conn.call]);
                }
            } else if (ts.isPropertyAssignment(n) && n.name.getText() === 'dialogType' && ts.isObjectLiteralExpression(n.parent)) {
                const target = this.unwrapExpr(n.initializer);
                if (target) {
                    e.dialogRefs.push([target, {kind: 'object', node: n.parent}]);
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(sf);
        this.deps = null;
        for (const list of [e.usages, e.calls, e.dialogRefs, e.connects] as Array<Array<[ts.Node, unknown]>>) {
            for (const [target, v] of list) {
                e.deps.add(target.getSourceFile());
                if (v && typeof v === 'object' && 'getSourceFile' in v) {
                    e.deps.add((v as ts.Node).getSourceFile());
                }
            }
        }
        return e;
    }

    /** connect(mapState, mapDispatch)(X), compose(connect(..), ..)(X), const connector = connect(..); connector(X) */
    private indexConnect(n: ts.CallExpression): {comp: CodeNode; dispatch: ts.Expression | null; call: ts.CallExpression} | null {
        const nameOf = (c: ts.CallExpression) => {
            const e = strip(c.expression);
            return exprName(e);
        };
        const target = n.arguments[0];
        if (!target) {
            return null;
        }
        const inner = strip(n.expression);
        let conn: ts.CallExpression | null = null;
        if (ts.isCallExpression(inner)) {
            if (nameOf(inner) === 'connect') {
                conn = inner;
            } else if (['compose', 'flowRight'].includes(nameOf(inner))) {
                conn = inner.arguments.find((a): a is ts.CallExpression => ts.isCallExpression(a) && nameOf(a) === 'connect') ?? null;
            }
        } else if (ts.isIdentifier(inner)) {
            const d = this.checker.getSymbolAtLocation(inner)?.valueDeclaration;
            if (d && ts.isVariableDeclaration(d) && d.initializer && ts.isCallExpression(d.initializer) && nameOf(d.initializer) === 'connect') {
                conn = d.initializer;
                this.deps?.add(d.getSourceFile());
            }
        }
        if (!conn) {
            return null;
        }
        const comp = this.unwrapExpr(target);
        return comp ? {comp, dispatch: conn.arguments[1] ?? null, call: conn} : null;
    }
}

/** `channels/src/a.tsx:12:5` -> `channels/src/a.tsx`. */
export function fileOfLoc(loc: Loc): string {
    return loc.replace(/(:\d+)+$/, '');
}

/**
 * The name of a top-level statement that declares code: a function, a class, or a variable holding one (directly or
 * through a call such as `memo(…)` or `connect(…)(…)`); `default` for an anonymous default export. Null for anything
 * else (a constant list, an import).
 */
function topLevelName(st: ts.Node): string | null {
    if ((ts.isFunctionDeclaration(st) || ts.isClassDeclaration(st))) {
        return st.name?.text ?? 'default';
    }
    if (ts.isVariableStatement(st)) {
        const d = st.declarationList.declarations[0];
        const holdsCode = (e: ts.Node | undefined): boolean => Boolean(e) && (isFunctionLike(e) || ts.isClassExpression(e!) || (ts.isCallExpression(e!) && (e!.arguments.some(holdsCode) || holdsCode(e!.expression))) || ((ts.isParenthesizedExpression(e!) || ts.isAsExpression(e!)) && holdsCode(e!.expression)));
        return d && ts.isIdentifier(d.name) && holdsCode(d.initializer) ? d.name.text : null;
    }
    if (ts.isExportAssignment(st)) {
        return 'default';
    }
    return null;
}

/** `styled(X)(...)`, `styled(X, opts)(...)`, `styled.div(...)`: the root of the callee chain is `styled`. */
function isStyledCall(call: ts.CallExpression): boolean {
    let c: ts.Expression = strip(call.expression) as ts.Expression;
    while (ts.isCallExpression(c) || ts.isPropertyAccessExpression(c)) {
        c = strip(c.expression) as ts.Expression;
    }
    return ts.isIdentifier(c) && c.text === 'styled';
}

/** The X of `styled(X)…` when X is an expression (a component), not a tag name. */
export function styledTarget(e: ts.Expression): ts.Expression | null {
    let c: ts.Expression = strip(e) as ts.Expression;
    while (ts.isCallExpression(c) || ts.isPropertyAccessExpression(c)) {
        if (ts.isCallExpression(c)) {
            const callee = strip(c.expression) as ts.Expression;
            if (ts.isIdentifier(callee) && callee.text === 'styled') {
                const a = c.arguments[0];
                return a && !ts.isStringLiteralLike(a) ? a : null;
            }
        }
        c = strip(c.expression) as ts.Expression;
    }
    return null;
}

function findDynamicImport(n: ts.Node): ts.CallExpression | null {
    let found: ts.CallExpression | null = null;
    const visit = (m: ts.Node) => {
        if (found) {
            return;
        }
        if (ts.isCallExpression(m) && m.expression.kind === ts.SyntaxKind.ImportKeyword) {
            found = m;
            return;
        }
        ts.forEachChild(m, visit);
    };
    ts.forEachChild(n, visit);
    return found;
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import path from 'node:path';

import ts from 'typescript';

import {attrValue, isFunctionLike, isIntrinsic, isJsxTag, jsxAttr, strip, typeText, type JsxTag} from './ast.ts';
import {cmp} from './compare.ts';
import {relativeToRoot, type Config} from './config.ts';
import {isGrammarError, KEY_PLACEHOLDER, parseTestId} from './grammar.ts';
import {inputDiagnostic, readVersioned} from './input.ts';
import type {Diagnostic, Loc, TestPart, TestParts} from './manifest_types.ts';
import type {CodeNode, ProgramIndex} from './program_index.ts';
import type {Roles} from './roles.ts';
import type {Resolver} from './values.ts';

type Part = Omit<TestPart, 'at'> & {at: Loc};

/**
 * Library mode: reads a component library (compass-ui) and publishes, per exported component, the testids
 * its `testId` prop derives (`testIdPart(testId, '.close--button')`), each part's role, the prop that
 * gates it and the callback prop its click calls, plus the role `data-testid` lands on when passed
 * through. The webapp's scan reads the published `test-parts.json` instead of the library's source.
 */
export class LibraryParts {
    private readonly memo = new Map<CodeNode, Part[]>();
    private readonly roleMemo = new Map<CodeNode, string | null>();
    readonly diagnostics: Diagnostic[] = [];
    private readonly ix: ProgramIndex;
    private readonly R: Resolver;
    private readonly roles: Roles;
    private readonly helper: string;
    private readonly testIdProp: string;

    constructor(ix: ProgramIndex, R: Resolver, roles: Roles, opts: {helper: string; testIdProp: string}) {
        this.ix = ix;
        this.R = R;
        this.roles = roles;
        this.helper = opts.helper;
        this.testIdProp = opts.testIdProp;
    }

    /** Every component the entry module exports, by export name. */
    exports(entry: string): Array<{name: string; node: CodeNode}> {
        const sf = this.ix.program.getSourceFile(entry);
        const mod = sf && this.ix.checker.getSymbolAtLocation(sf);
        if (!mod) {
            throw new Error(`library entry ${entry} is not in the program`);
        }
        const out: Array<{name: string; node: CodeNode}> = [];
        for (const sym of this.ix.checker.getExportsOfModule(mod)) {
            const node = this.ix.resolveSymbolToNode(sym);
            if (node && this.rendersJsx(node)) {
                out.push({name: sym.getName(), node});
            }
        }
        return out.sort((a, b) => cmp(a.name, b.name));
    }

    build(entry: string, pkg: {name: string; version: string}): TestParts {
        const components: TestParts['components'] = {};
        for (const {name, node} of this.exports(entry)) {
            const parts = this.partsOf(node);
            const role = this.rootRole(node);
            if (parts.length || role) {
                components[name] = {at: this.ix.where(node), role, parts};
            }
        }
        return {version: TEST_PARTS_VERSION, package: pkg.name, packageVersion: pkg.version, testIdProp: this.testIdProp, components};
    }

    private rendersJsx(n: CodeNode): boolean {
        let found = false;
        const visit = (x: ts.Node) => {
            if (found) {
                return;
            }
            if (isJsxTag(x) || ts.isJsxFragment(x)) {
                found = true;
                return;
            }
            ts.forEachChild(x, visit);
        };
        visit(n);
        return found;
    }

    /** Whether `e` reads this component's `testId` prop. */
    private isTestId(e: ts.Expression | undefined, comp: CodeNode): boolean {
        const pp = e && this.R.propsPath(e);
        return Boolean(pp && pp.comp === comp && pp.path.length === 1 && pp.path[0] === this.testIdProp);
    }

    /** `testIdPart(testId, suffix)` -> the suffix as a template (`.tab:{key}--tab`) and the key's type. */
    private partCall(e: ts.Expression | undefined, comp: CodeNode): {suffix: string; key?: string} | null {
        const x = e && strip(e) as ts.Expression;
        if (!x || !ts.isCallExpression(x) || x.expression.getText() !== this.helper || !this.isTestId(x.arguments[0], comp)) {
            return null;
        }
        const s = strip(x.arguments[1]) as ts.Expression | undefined;
        if (s && ts.isStringLiteralLike(s)) {
            return {suffix: s.text};
        }
        if (s && ts.isTemplateExpression(s) && s.templateSpans.length === 1) {
            const span = s.templateSpans[0];
            const t = this.ix.checker.getTypeAtLocation(span.expression);
            return {suffix: s.head.text + KEY_PLACEHOLDER + span.literal.text, key: typeText(this.ix.checker, t)};
        }
        this.diagnostics.push({rule: 'parts', severity: 'error', at: this.ix.where(x), message: `${this.helper}() needs a literal suffix (or one template span for a key).`});
        return null;
    }

    /** The parts a component derives from its `testId`, including those of the children it forwards `testId` to. */
    partsOf(comp: CodeNode, stack = new Set<CodeNode>()): Part[] {
        const memo = this.memo.get(comp);
        if (memo) {
            return memo;
        }
        if (stack.has(comp)) {
            return [];
        }
        stack.add(comp);
        const out: Part[] = [];
        const visit = (n: ts.Node) => {
            if (isJsxTag(n)) {
                out.push(...this.partsAtTag(n, comp, stack));
            }
            ts.forEachChild(n, visit);
        };
        visit(isFunctionLike(comp) && comp.body ? comp.body : comp);
        stack.delete(comp);
        const unique = [...new Map(out.map((p) => [`${p.suffix}|${p.when?.prop ?? ''}|${p.when?.set ?? ''}`, p])).values()].
            sort((a, b) => cmp(a.suffix, b.suffix) || cmp(a.when?.prop ?? '', b.when?.prop ?? ''));
        this.memo.set(comp, unique);
        return unique;
    }

    private partsAtTag(tag: JsxTag, comp: CodeNode, stack: Set<CodeNode>): Part[] {
        const out: Part[] = [];

        // data-testid={testIdPart(testId, '.close--button')} (or a conditional between such calls)
        const dt = attrValue(jsxAttr(tag, 'data-testid'));
        for (const {expr, when} of this.branches(dt, comp)) {
            const call = this.partCall(expr, comp);
            if (call) {
                out.push(this.part(call, tag, comp, when));
            }
        }

        // a child component with parts of its own: testId={testId} / testId={testIdPart(testId, '.checkbox')} / {...props}
        const child = isIntrinsic(tag) ? null : this.ix.componentOfTag(tag);
        if (child && child !== comp && !this.ix.isLibraryNode(child)) {
            const tv = attrValue(jsxAttr(tag, this.testIdProp));
            let prefix: string | null = null;
            if (tv && this.isTestId(tv, comp)) {
                prefix = '';
            } else if (tv) {
                const call = this.partCall(tv, comp);
                prefix = call && !call.key ? call.suffix : null;
            } else if (this.spreadsTestId(tag, comp)) {
                prefix = '';
            }
            if (prefix !== null) {
                for (const p of this.partsOf(child, stack)) {
                    out.push({...p, suffix: prefix + p.suffix, ...this.translateHandlers(p, tag, comp)});
                }
            }
        }
        return out;
    }

    /** A child's part calls the child's callback props; in this component that is what the usage passes for them. */
    private translateHandlers(p: Part, tag: JsxTag, comp: CodeNode): Partial<Part> {
        if (!p.handlers) {
            return {};
        }
        const out = new Set<string>();
        for (const h of p.handlers) {
            const v = attrValue(jsxAttr(tag, h));
            if (v) {
                this.calledProps(v, comp, 0, out, new Set());
            } else if (this.propsSpread(tag, comp).length) {
                out.add(h);
            }
        }
        return {handlers: [...out].sort()};
    }

    /** `{...props}` / `{...rest}` of this component on the tag. */
    private propsSpread(tag: JsxTag, comp: CodeNode): ts.JsxSpreadAttribute[] {
        return tag.attributes.properties.filter((a): a is ts.JsxSpreadAttribute => {
            if (!ts.isJsxSpreadAttribute(a)) {
                return false;
            }
            const pp = this.R.restPropsOf(a.expression) ?? this.R.propsPath(a.expression);
            return Boolean(pp && pp.comp === comp && !pp.path.length);
        });
    }

    /** `{...props}` / `{...rest}` of this component, when `testId` wasn't destructured out of it. */
    private spreadsTestId(tag: JsxTag, comp: CodeNode): boolean {
        return this.propsSpread(tag, comp).some((a) => {
            const d = ts.isIdentifier(a.expression) ? this.ix.checker.getSymbolAtLocation(a.expression)?.valueDeclaration : undefined;
            const pattern = d && ts.isBindingElement(d) && ts.isObjectBindingPattern(d.parent) ? d.parent : null;
            return !pattern || !pattern.elements.some((el) => !el.dotDotDotToken && (el.propertyName ?? el.name).getText() === this.testIdProp);
        });
    }

    /** `cond ? a : b` -> each arm with the prop condition it needs (`toggled === undefined`). */
    private branches(e: ts.Expression | undefined, comp: CodeNode): Array<{expr: ts.Expression; when?: TestPart['when']}> {
        const x = e && strip(e) as ts.Expression;
        if (!x) {
            return [];
        }
        if (ts.isConditionalExpression(x)) {
            const c = this.propTest(x.condition, comp);
            return [
                ...this.branches(x.whenTrue, comp).map((b) => ({...b, when: b.when ?? c ?? undefined})),
                ...this.branches(x.whenFalse, comp).map((b) => ({...b, when: b.when ?? (c ? {prop: c.prop, set: !c.set} : undefined)})),
            ];
        }
        return [{expr: x}];
    }

    /** `x === undefined`, `x != null`, `x`, `!x` on a prop -> {prop, set}. */
    private propTest(e: ts.Expression, comp: CodeNode): TestPart['when'] | null {
        const x = strip(e) as ts.Expression;
        const propOf = (y: ts.Expression) => {
            const pp = this.R.propsPath(y);
            return pp && pp.comp === comp && pp.path.length === 1 ? pp.path[0] : null;
        };
        if (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.ExclamationToken) {
            const inner = this.propTest(x.operand, comp);
            return inner && {prop: inner.prop, set: !inner.set};
        }
        if (ts.isBinaryExpression(x) && ['undefined', 'null'].includes(x.right.getText())) {
            const prop = propOf(x.left);
            const k = x.operatorToken.kind;
            const eq = k === ts.SyntaxKind.EqualsEqualsEqualsToken || k === ts.SyntaxKind.EqualsEqualsToken;
            const ne = k === ts.SyntaxKind.ExclamationEqualsEqualsToken || k === ts.SyntaxKind.ExclamationEqualsToken;
            return prop && (eq || ne) ? {prop, set: ne} : null;
        }
        const prop = propOf(x);
        return prop ? {prop, set: true} : null;
    }

    private part(call: {suffix: string; key?: string}, tag: JsxTag, comp: CodeNode, when?: TestPart['when']): Part {
        const parsed = parseTestId(`lib.part${call.suffix.replace(KEY_PLACEHOLDER, 'k')}`);
        const role = isGrammarError(parsed) ? null : parsed.role;
        const at = this.ix.where(tag);
        if (isGrammarError(parsed)) {
            this.diagnostics.push({rule: 'parts', severity: 'error', at, message: `Part "${call.suffix}" doesn't follow the testid grammar: ${parsed.message}`});
        } else if (isIntrinsic(tag)) {
            const actual = this.roles.ofIntrinsic(tag).role;
            const pressable = (r: string | null) => r === 'button' || r === 'togglebutton';
            const ok = role === null ? !actual || ['banner', 'region', 'group', 'main', 'none', 'presentation'].includes(actual) : actual === role || (pressable(role) && pressable(actual));
            if (!ok) {
                this.diagnostics.push({rule: 'parts', severity: 'error', at, message: `Part "${call.suffix}" is on a <${tag.tagName.getText()}> with role ${actual ?? 'none'}.`});
            }
        }

        // the root part takes the usage's handlers; a built-in part only the props its click calls
        const handlers = call.suffix.startsWith('--') || call.suffix === '' ? [] : [...this.handlersOf(tag, comp)].sort();
        return {suffix: call.suffix, role, ...(call.key ? {key: call.key} : {}), ...(when ? {when} : {}), ...(handlers.length ? {handlers} : {}), at};
    }

    /** The callback props the element's click calls: `onClick={onClose}`, `onClick={() => onDismiss?.()}`, through local functions. */
    private handlersOf(tag: JsxTag, comp: CodeNode): Set<string> {
        const out = new Set<string>();
        for (const name of ['onClick', 'onPointerUp']) {
            const h = attrValue(jsxAttr(tag, name));
            if (h) {
                this.calledProps(h, comp, 0, out, new Set());
            }
        }
        return out;
    }

    private calledProps(e: ts.Node, comp: CodeNode, depth: number, out: Set<string>, seen: Set<ts.Node>) {
        const x = strip(e as ts.Expression) as ts.Expression;
        if (seen.has(x) || depth > 8) {
            return;
        }
        seen.add(x);
        const pp = ts.isIdentifier(x) || ts.isPropertyAccessExpression(x) ? this.R.propsPath(x) : null;
        if (pp && pp.comp === comp && pp.path.length === 1 && (/^on[A-Z]/).test(pp.path[0])) {
            out.add(pp.path[0]);
            return;
        }
        if (ts.isIdentifier(x)) {
            const d = this.ix.checker.getSymbolAtLocation(x)?.valueDeclaration;

            // a setter from a hook given the callback: `const [v, setV] = useControllable(value, initial, onChange)`
            const holder = d && ts.isBindingElement(d) && ts.isArrayBindingPattern(d.parent) ? d.parent.parent : null;
            const hook = holder && ts.isVariableDeclaration(holder) && holder.initializer && strip(holder.initializer);
            if (hook && ts.isCallExpression(hook)) {
                for (const a of hook.arguments) {
                    this.calledProps(a, comp, depth + 1, out, seen);
                }
                return;
            }
            const fn = localFunction(d);
            if (fn) {
                this.calledProps(fn, comp, depth + 1, out, seen);
            }
            return;
        }
        const visit = (n: ts.Node) => {
            if (ts.isCallExpression(n)) {
                this.calledProps(n.expression, comp, depth + 1, out, seen);
            }
            ts.forEachChild(n, visit);
        };
        visit(x);
    }

    /** The role `data-testid` (passed through `{...rest}`) lands on. */
    rootRole(comp: CodeNode, stack = new Set<CodeNode>()): string | null {
        if (this.roleMemo.has(comp)) {
            return this.roleMemo.get(comp)!;
        }
        if (stack.has(comp)) {
            return null;
        }
        stack.add(comp);
        let role: string | null = null;
        const visit = (n: ts.Node) => {
            if (role !== null) {
                return;
            }
            if (isJsxTag(n) && this.propsSpread(n, comp).length) {
                if (isIntrinsic(n)) {
                    role = this.roles.ofIntrinsic(n).role;

                    // `aria-pressed={toggled === undefined ? undefined : toggled}`: a toggle only when the prop is set
                    const pressed = attrValue(jsxAttr(n, 'aria-pressed'));
                    if (role === 'togglebutton' && pressed && (/\bundefined\b/).test(pressed.getText())) {
                        role = 'button';
                    }
                } else {
                    const explicit = this.roles.attrLiterals(n, 'role');
                    const child = this.ix.componentOfTag(n);
                    role = explicit?.[0] ?? (child ? this.rootRole(child, stack) : null);
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(isFunctionLike(comp) && comp.body ? comp.body : comp);
        stack.delete(comp);
        this.roleMemo.set(comp, role);
        return role;
    }
}

/** A local function (`function f`, `const f = () => …`, `const f = useCallback(() => …)`) from its declaration. */
function localFunction(d: ts.Declaration | undefined): ts.Node | null {
    const init = d && ts.isVariableDeclaration(d) ? d.initializer : d;
    if (!init) {
        return null;
    }
    if (isFunctionLike(init)) {
        return init;
    }
    const arg = ts.isCallExpression(init) ? init.arguments[0] : undefined;
    return arg && isFunctionLike(arg) ? arg : null;
}

/** Reads the library's package.json next to the config root. */
export function packageOf(config: Config): {name: string; version: string} {
    const pkg = JSON.parse(fs.readFileSync(path.join(config.root, 'package.json'), 'utf8')) as {name: string; version: string};
    return {name: pkg.name, version: pkg.version};
}

/** A library's published `test-parts.json`, and the directory its declarations live in. */
export type PublishedParts = {package: string; dir: string; parts: TestParts};

/** The `test-parts.json` format this version reads (`TestParts.version`). */
export const TEST_PARTS_VERSION = 1;

/**
 * Loads `test-parts.json` for each configured library: `"@mattermost/compass-ui"` (from the installed
 * package) or `{"package": …, "parts": "path/to/test-parts.json"}`. A configured library that isn't installed, or
 * whose file is corrupt or of another format version, is an `input` error; an installed version that publishes no
 * file is a warning (its roles come from the built-in table).
 */
export function loadPublishedParts(config: Config, problems: Diagnostic[] = []): PublishedParts[] {
    const out: PublishedParts[] = [];
    const at = relativeToRoot(config, config.configPath);
    for (const lib of config.libraries) {
        let file: string;
        let dir: string;
        const name = typeof lib === 'string' ? lib : lib.package;
        if (typeof lib === 'string') {
            // node_modules lookup by directory: a package's `exports` may not expose package.json
            const found = packageDir(config.root, lib);
            if (!found) {
                problems.push(inputDiagnostic(at, `Library ${lib} (config \`libraries\`) isn't installed.`, 'Install the webapp\'s dependencies (npm ci), or remove it from `libraries`.'));
                continue;
            }
            dir = found;
            file = path.join(dir, 'test-parts.json');
            if (!fs.existsSync(file)) {
                problems.push(inputDiagnostic(at, `Library ${lib}@${installedVersion(dir)} publishes no test-parts.json: its components' roles come from the built-in table, and their parts aren't scanned.`, 'Upgrade to a version that ships test-parts.json.', 'warning'));
                continue;
            }
        } else {
            file = path.resolve(config.root, lib.parts);
            dir = path.dirname(file);
        }
        const read = readVersioned<TestParts>(file, TEST_PARTS_VERSION, `${name}'s test-parts.json`, relativeToRoot(config, file));
        if ('diagnostic' in read) {
            problems.push(read.diagnostic);
            continue;
        }
        out.push({package: name, dir: path.resolve(dir), parts: read.value});
    }
    return out;
}

/** The version in an installed package's package.json. */
export function installedVersion(dir: string): string {
    try {
        return (JSON.parse(fs.readFileSync(path.join(dir, 'package.json'), 'utf8')) as {version?: string}).version ?? '?';
    } catch {
        return '?';
    }
}

function packageDir(from: string, pkg: string): string | null {
    for (let d = path.resolve(from); ; d = path.dirname(d)) {
        const candidate = path.join(d, 'node_modules', pkg);
        if (fs.existsSync(path.join(candidate, 'package.json'))) {
            return fs.realpathSync(candidate);
        }
        if (path.dirname(d) === d) {
            return null;
        }
    }
}

/** The published library component a JSX tag renders: matched on the declaring file's package and the export name. */
export function publishedComponent(ix: ProgramIndex, tag: JsxTag, published: PublishedParts[]): {lib: PublishedParts; name: string; component: TestParts['components'][string] | null} | null {
    if (!published.length) {
        return null;
    }
    let sym = ix.checker.getSymbolAtLocation(ts.isPropertyAccessExpression(tag.tagName) ? tag.tagName.name : tag.tagName);
    const local = sym?.getName();
    if (sym && (sym.flags & ts.SymbolFlags.Alias)) {
        try {
            sym = ix.checker.getAliasedSymbol(sym);
        } catch {
            return null;
        }
    }
    const file = sym?.declarations?.[0]?.getSourceFile().fileName;
    const lib = file && published.find((l) => path.resolve(file).startsWith(l.dir + path.sep));
    if (!lib || !sym) {
        return null;
    }
    const names = [sym.getName(), local, tag.tagName.getText().split('.').pop()].filter((n): n is string => Boolean(n) && n !== 'default');
    const name = names.find((n) => lib.parts.components[n]) ?? names[0] ?? '';
    return {lib, name, component: lib.parts.components[name] ?? null};
}

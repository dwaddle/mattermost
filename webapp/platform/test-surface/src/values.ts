// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import ts from 'typescript';

import {calleeName, isFunctionLike, propName, returnsOf, shortText, strip, typeText, type FunctionLike} from './ast.ts';
import {usageAttrs, usageNode, type CodeNode, type Loc, type ProgramIndex, type Usage} from './program_index.ts';

/** Runtime data that fills a slot of a testid. */
export type Gap = {

    /**
     * number; set = a union of string literals; entity = a field of a type from the entity dirs;
     * plugin = a plugin id as a key (`PluginTestKey`); string = anything else
     */
    kind: 'number' | 'set' | 'entity' | 'plugin' | 'setting' | 'suggestion' | 'string';
    type: string;
    expr: string;
    entity?: string;
    field?: string;

    /** Module the entity type is imported from (`@mattermost/types/channels`). */
    module?: string;
    values?: string[];

    /** A setting key: ids made of a literal and runtime data (`custom_profile_attribute-${name}`), as TS template types. */
    templates?: string[];
};
export type Part = string | {gap: Gap};

/** A pattern as a TS template literal type: its literal parts kept, its runtime parts any string. */
function templateType(parts: Part[]): string {
    // a TS type, not a template: this string is meant to read `${string}`
    // eslint-disable-next-line no-template-curly-in-string
    const anyString = '${string}';
    return '`' + parts.map((q) => (typeof q === 'string' ? q.replace(/[`\\$]/g, (c) => `\\${c}`) : anyString)).join('') + '`';
}

/**
 * `via`: the usage chain a value came through. `arms`: the ternary arms it was chosen in, by the
 * condition's identity (`isScheduledPost ? a : b` twice in one template: an `a` with the other's `b`
 * can't happen).
 */
type Via = {via?: Loc[]; arms?: Arm[]};
type Arm = {key: string; when: boolean};
export type Value =
    | ({k: 'lit'; s: string} & Via) |
    ({k: 'pat'; parts: Part[]; libraryRendered?: boolean; recursive?: boolean} & Via) |
    ({k: 'absent'; at?: Loc} & Via) |
    ({k: 'computed'; at: Loc; truthy?: true} & Via) |
    ({k: 'unres'; why: string; at: Loc; truthy?: true} & Via);

/** A source expression a value can come from, with the usage chain it flowed through. */
export type Source = {expr: ts.Expression; via: Loc[]} | {marker: true; src: ts.Expression; via: Loc[]};

type Env = Map<ts.Symbol, {expr: ts.Expression; env: Env | null}>;
type PropsRef = {path: string[]; comp: CodeNode | null};

/** Where a prop comes from at one usage of a component. */
type PropAt =
    | {kind: 'value'; expr: ts.Expression; rest: string[]} |
    {kind: 'true'} |
    {kind: 'up'; comp: CodeNode; path: string[]} |
    {kind: 'object'; expr: ts.Expression; path: string[]} |
    {kind: 'unknown'; node: ts.Node} |
    {kind: 'default'; expr: ts.Expression} |
    {kind: 'connect'} |
    {kind: 'absent'};

// Each prop hop costs a few steps (a conditional, a template, a prop read). A post's scope reaches a file tile in a
// spillage report's post preview through about ten components, which needs more than 32.
const MAX_DEPTH = 48;
export const MAX_VALUES = 256;

/** Values gathered across a component's usages: linear in the number of usages, so the bound is much higher. */
const MAX_USAGE_VALUES = 8192;
const LIST_METHODS = ['map', 'forEach', 'filter', 'flatMap', 'find', 'some', 'every'];

export const lit = (s: string, via?: Loc[]): Value => (via ? {k: 'lit', s, via} : {k: 'lit', s});

/** Why a value stands for the ones left out past a cap: what was kept is only part of what the expression can be. */
export const TOO_MANY_VALUES = 'too-many-values';

type Unresolved = Value & {k: 'unres'};

/** The values past a cap, which `concat` leaves out: never silently, so checks can say the set is incomplete. */
const truncated = (at = ''): Unresolved => ({k: 'unres', why: TOO_MANY_VALUES, at});

export const isTruncated = (v: Value): boolean => v.k === 'unres' && v.why === TOO_MANY_VALUES;

/**
 * Resolves expressions to the strings they can produce, following props to every usage
 * (with provenance), spreads, rest props, local objects, constants (incl. namespace imports),
 * useMemo, helper-function returns, and fixed lists behind .map callbacks.
 */
export class Resolver {
    private readonly ix: ProgramIndex;
    private readonly checker: ts.TypeChecker;
    private readonly entityDirs: string[];

    constructor(ix: ProgramIndex) {
        this.ix = ix;
        this.checker = ix.checker;
        this.entityDirs = ix.config.entityTypeDirs.map((d) => (d.endsWith(path.sep) ? d : d + path.sep));
    }

    private propertyIndex: Map<string, ts.PropertyAssignment[]> | null = null;

    /**
     * Where a member of a typed parameter is set, when no call site can say (a method stored in a lookup table and
     * called through it): the object literals of the parameter's declared type that set the member. System Console
     * custom settings are rendered this way, `setting.component` from `{type: 'custom', component: PolicyList}`.
     */
    typedMemberSources(x: ts.PropertyAccessExpression, inUnion = false): ts.Expression[] {
        const obj = strip(x.expression) as ts.Expression;
        const declared = this.declaredType(obj);
        if (!declared) {
            return [];
        }
        const alias = declared.aliasSymbol ?? declared.getSymbol();
        if (!alias) {
            return [];
        }
        if (!this.propertyIndex) {
            this.propertyIndex = new Map();
            const index = this.propertyIndex;
            const walk = (n: ts.Node) => {
                if (ts.isPropertyAssignment(n)) {
                    const name = propName(n.name);
                    if (name) {
                        index.set(name, [...(index.get(name) ?? []), n]);
                    }
                }
                ts.forEachChild(n, walk);
            };
            this.ix.files.forEach((sf) => walk(sf));
        }

        // with inUnion, also literals typed by a union that includes the parameter's type (a list of definitions, each
        // entry one kind of the union): every kind's member, which over-approximates but never misses one. A kind
        // extended where it's used (`LDAPDefinitionSettingButton`, a button kind & its action) matches the union's kind
        // of the same `type` it can be assigned to: the union is flattened, so its kinds no longer carry their aliases.
        const kind = (t: ts.Type) => {
            const p = t.getProperty('type');
            return p ? this.checker.typeToString(this.checker.getTypeOfSymbol(p)) : undefined;
        };
        const declaredKind = inUnion ? kind(declared) : undefined;
        const matches = (t: ts.Type) => (t.aliasSymbol ?? t.getSymbol()) === alias ||
            Boolean(declaredKind && kind(t) === declaredKind && this.checker.isTypeAssignableTo(declared, t));
        return (this.propertyIndex.get(x.name.text) ?? []).filter((p) => {
            const t = this.checker.getContextualType(p.parent);
            return Boolean(t && (matches(t) || (inUnion && t.isUnion() && t.types.some(matches))));
        }).map((p) => p.initializer);
    }

    /**
     * The declared type of a typed parameter (`setting`) or of a member of one (`props.setting`, the member's own
     * declared type): what a definition literal is written against, not what control flow narrowed it to.
     */
    private declaredType(obj: ts.Expression): ts.Type | undefined {
        if (ts.isIdentifier(obj)) {
            const d = this.valueDecl(obj);
            return d && ts.isParameter(d) && d.type ? this.checker.getTypeFromTypeNode(d.type) : undefined;
        }
        if (ts.isPropertyAccessExpression(obj) && this.declaredType(strip(obj.expression) as ts.Expression)) {
            const member = this.checker.getSymbolAtLocation(obj.name)?.valueDeclaration;
            return member && ts.isPropertySignature(member) && member.type ? this.checker.getTypeFromTypeNode(member.type) : undefined;
        }
        return undefined;
    }

    /** The symbol an identifier refers to; for a shorthand property `{x}`, the variable `x`, not the property. */
    private symbolOf(n: ts.Node): ts.Symbol | undefined {
        if (n.parent && ts.isShorthandPropertyAssignment(n.parent) && n.parent.name === n) {
            return this.checker.getShorthandAssignmentValueSymbol(n.parent);
        }
        return this.checker.getSymbolAtLocation(n);
    }

    private unres(why: string, n?: ts.Node): Value {
        const v: Value = {k: 'unres', why, at: n ? this.ix.where(n) : ''};
        return n && this.alwaysTruthy(n) ? {...v, truthy: true} : v;
    }

    /** A value the program can't know but whose type is always truthy: a function or object that is never null or undefined. */
    private alwaysTruthy(n: ts.Node): boolean {
        let t: ts.Type;
        try {
            t = this.checker.getTypeAtLocation(n);
        } catch {
            return false;
        }
        const parts = t.isUnion() ? t.types : [t];
        return parts.every((p) => (p.flags & ts.TypeFlags.Object) !== 0 && !(p.flags & (ts.TypeFlags.Any | ts.TypeFlags.Unknown)));
    }

    // ---- gaps: typed {key} slots --------------------------------------------------------

    private isEntityDecl(decl: ts.Declaration | undefined): boolean {
        if (!decl) {
            return false;
        }
        const f = path.resolve(decl.getSourceFile().fileName);
        return this.entityDirs.some((d) => f.startsWith(d));
    }

    /**
     * The entity type a field belongs to: the owner itself (`Channel`), or else the named entity type
     * that declares the field (`FileInfo & UploadInfo` -> `FileInfo`).
     */
    private entityOwner(owner: ts.Type, field: string): {name: string; decl: ts.Declaration} | null {
        const os = owner.aliasSymbol ?? owner.getSymbol();
        const decl = os?.declarations?.[0];
        if (os && decl && this.isEntityDecl(decl)) {
            return {name: os.getName(), decl};
        }

        // declarations from local types (a multiselect's `Value`, an upload's progress) add no identity;
        // the entity types that declare it must agree (`Channel & UserProfile` is ambiguous)
        const decls = owner.getProperty(field)?.declarations ?? [];
        const entities = decls.map(namedTypeOf).filter((n): n is {name: string; decl: ts.Declaration} => Boolean(n && this.isEntityDecl(n.decl)));
        const first = entities[0];
        if (first && entities.every((n) => n.name === first.name && n.decl.getSourceFile() === first.decl.getSourceFile())) {
            return first;
        }
        return null;
    }

    private classify(info: Gap, t: ts.Type | null, owner: ts.Type | null, field: string | null) {
        if (isPluginKey(t)) {
            info.kind = 'plugin';
            return;
        }
        if (t?.aliasSymbol?.getName() === 'SettingTestKey') {
            info.kind = 'setting';
            return;
        }
        if (t?.aliasSymbol?.getName() === 'SuggestionTestKey') {
            info.kind = 'suggestion';
            return;
        }
        if (t && (t.flags & ts.TypeFlags.NumberLike)) {
            info.kind = 'number';
        }
        const lits = t ? stringLiteralsOf(t) : null;
        if (lits) {
            info.kind = 'set';
            info.values = lits;
        }
        const ent = owner && field ? this.entityOwner(owner, field) : null;
        if (ent && field) {
            const {name, decl} = ent;
            info.kind = 'entity';
            info.entity = name;
            info.field = field;
            const file = path.resolve(decl.getSourceFile().fileName);
            const dir = this.entityDirs.find((d) => file.startsWith(d))!;
            info.module = '@mattermost/types/' + path.relative(dir, file).replace(/\.tsx?$/, '').split(path.sep).join('/').replace(/\/index$/, '');
        }
    }

    gapFor(e: ts.Expression): Value {
        const t = this.checker.getTypeAtLocation(e);
        const info: Gap = {kind: 'string', type: typeText(this.checker, t), expr: shortText(e)};
        let owner: ts.Type | null = null;
        let field: string | null = null;
        if (ts.isPropertyAccessExpression(e)) {
            owner = this.checker.getNonNullableType(this.checker.getTypeAtLocation(e.expression));
            field = e.name.text;
        }
        this.classify(info, t, owner, field);
        return {k: 'pat', parts: [{gap: info}]};
    }

    /**
     * `settingTestKey(id)`: a config path, or a page's own setting id (`classificationEnabled`, `GitLabSettings.Url`).
     * The literal ids that reach it, less the config paths, are kept on the gap, so the key's type can name them
     * beside the config paths.
     */
    private settingGap(x: ts.CallExpression, depth: number, seen: Set<ts.Node>, env: Env | null): Value {
        const g = this.gapFor(x);
        const arg = x.arguments[0];
        const part = g.k === 'pat' ? g.parts[0] : null;
        if (arg && part && typeof part !== 'string') {
            const resolved = this.resolveOrGap(arg, depth + 1, seen, env);
            const local = resolved.flatMap((v) => (v.k === 'lit' && v.s && !v.s.includes(':') && !this.isConfigPath(v.s) ? [v.s] : []));

            // an id made of a literal and runtime data (`custom_profile_attribute-${attr.name}`): any id that shape
            const templates = resolved.flatMap((v) => (v.k === 'pat' && v.parts.some((q) => typeof q === 'string' && q) ? [templateType(v.parts)] : []));
            if (templates.length) {
                part.gap.templates = [...new Set(templates)].sort();
            }

            // a renderer can get both: literal ids from hand-built pages and definition keys (`RequestButton`)
            const defined = this.definedSettingKeys(arg);
            if (local.length || defined.length) {
                part.gap.values = [...new Set([...local, ...defined])].sort();
            }
        }
        return g;
    }

    /**
     * The keys a settings renderer gets from the System Console's definitions (`setting.key`, `setting` a parameter of
     * one setting kind): the `key` literals of every definition, less the config paths `AdminSettingPath` already
     * names. What's left are a page's own keys (`openidType`, `GitLabSettings.Url`).
     */
    private definedSettingKeys(arg: ts.Expression): string[] {
        const keys = this.sources(arg).flatMap((src) => {
            if ('marker' in src) {
                return [];
            }
            const x = strip(src.expr) as ts.Expression;
            return ts.isPropertyAccessExpression(x) ? this.typedMemberSources(x, true) : [];
        }).flatMap((init) => (ts.isStringLiteralLike(init) && init.text ? [init.text] : []));
        return [...new Set(keys)].filter((k) => !this.isConfigPath(k));
    }

    private adminConfig: ts.Type | null | undefined;

    /** A two-level config path (`ServiceSettings.SiteURL`): a member of a member of `AdminConfig`. */
    private isConfigPath(key: string): boolean {
        if (this.adminConfig === undefined) {
            // the webapp's `@mattermost/types/config` declares it (scanned or not, so look through the whole program)
            const decl = this.ix.program.getSourceFiles().
                filter((f) => (/\/config(\.d)?\.ts$/).test(f.fileName)).
                flatMap((f) => f.statements).
                find((st): st is ts.TypeAliasDeclaration => ts.isTypeAliasDeclaration(st) && st.name.text === 'AdminConfig');
            this.adminConfig = decl ? this.checker.getTypeAtLocation(decl.name) : null;
        }
        const parts = key.split('.');
        if (!this.adminConfig || parts.length !== 2) {
            return false;
        }
        const section = this.adminConfig.getProperty(parts[0]);
        const sectionType = section && this.checker.getTypeOfSymbol(section);
        return Boolean(sectionType?.getProperty(parts[1]));
    }

    /**
     * A condition's identity across expressions: the declaration of the value it tests (`isX`,
     * `!isX`, `props.isX`), and whether it's negated. Null for anything else.
     */
    private armKey(e: ts.Expression): {key: string; negate: boolean} | null {
        let x = strip(e) as ts.Expression;
        let negate = false;
        while (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.ExclamationToken) {
            negate = !negate;
            x = strip(x.operand) as ts.Expression;
        }
        if (!ts.isIdentifier(x) && !ts.isPropertyAccessExpression(x)) {
            return null;
        }
        const decl = this.checker.getSymbolAtLocation(ts.isIdentifier(x) ? x : x.name)?.declarations?.[0];
        if (!decl) {
            return null;
        }

        // a property is one value only within one component's render: key it by the enclosing function too
        const fn = ts.isPropertyAccessExpression(x) ? enclosingFunction(x) : null;
        return {key: `${decl.getSourceFile().fileName}:${decl.pos}${fn ? `@${fn.pos}` : ''}`, negate};
    }

    /**
     * Runtime data whose type upstream says less than the type where it's read (the list passes
     * `PostDraft | ScheduledPost`, the row reads `(item as ScheduledPost).id`): the reading here
     * types the key, and the value keeps the usage chain it came through.
     */
    private typedHere(v: Value, x: ts.Expression): Value {
        const g = v.k === 'pat' && v.parts.length === 1 ? v.parts[0] : null;
        if (!g || typeof g === 'string' || g.gap.kind !== 'string') {
            return v;
        }
        const here = this.gapFor(x);
        const hg = here.k === 'pat' ? here.parts[0] : null;
        return hg && typeof hg !== 'string' && hg.gap.kind !== 'string' ? {...here, ...(v.via ? {via: v.via} : {})} : v;
    }

    /** Runtime data reached through a props path: the type of `expr.rest...`. */
    private dataGap(expr: ts.Expression, rest: string[], elementOf = false): Value {
        let t: ts.Type | null = this.checker.getTypeAtLocation(expr);
        if (elementOf && t) {
            t = this.checker.getIndexTypeOfType(t, ts.IndexKind.Number) ?? t;
        }
        let owner: ts.Type | null = null;
        let field: string | null = null;
        for (const k of rest) {
            if (!t) {
                break;
            }

            // `teams.find(…).name`: the property of the value when there is one (`Team | undefined` -> `Team`)
            t = this.checker.getNonNullableType(t);
            owner = t;
            field = k;
            const prop = t.getProperty(k);
            t = prop ? this.checker.getTypeOfSymbolAtLocation(prop, expr) : null;
        }
        const info: Gap = {kind: 'string', type: t ? typeText(this.checker, t) : '?', expr: shortText(expr, 40) + (elementOf ? '[]' : '') + (rest.length ? '.' + rest.join('.') : '')};
        this.classify(info, t, owner, field);
        return {k: 'pat', parts: [{gap: info}]};
    }

    private literalsFromType(e: ts.Expression): Value[] | null {
        const t = this.checker.getTypeAtLocation(e);
        if (t.isStringLiteral()) {
            return [lit(t.value)];
        }
        const ls = stringLiteralsOf(t);
        return ls ? ls.map((s) => lit(s)) : null;
    }

    // ---- value sources ------------------------------------------------------------------

    /** Source expressions that can flow into `e`, each with its usage chain. */
    sources(e: ts.Expression | Source, depth = 0, seen = new Set<ts.Node>(), via: Loc[] = []): Source[] {
        if ('marker' in e) {
            return [e];
        }
        if ('expr' in e && 'via' in e) {
            return this.sources(e.expr, depth, seen, e.via);
        }
        const x = strip(e) as ts.Expression;
        if (!x || depth > MAX_DEPTH) {
            return [];
        }
        const pp = this.propsPath(x);
        if (pp && pp.comp && pp.path.length && !seen.has(pp.comp)) {
            const out: Source[] = [];
            const s2 = new Set([...seen, pp.comp]);
            out.push(...this.propSources(pp.comp, pp.path, depth, s2, via));

            // modals opened with {dialogType: X, dialogProps: {...}} or <ToggleModalButton dialogType={X} dialogProps={...}>
            for (const ref of this.ix.dialogRefs.get(pp.comp) ?? []) {
                let v: ts.Expression | undefined = this.dialogPropsOf(ref);
                for (const k of pp.path) {
                    v = this.memberOfLiteral(this.literalOf(v), k);
                    if (!v) {
                        break;
                    }
                }
                if (v) {
                    out.push(...this.sources(v, depth + 1, s2, [...via, this.ix.where(ref.node)]));
                }
            }

            // no usage provides it (connect(), library-rendered): the props expression itself is the source
            return out.length ? out : [{expr: x, via}];
        }
        if (ts.isIdentifier(x)) {
            const d = this.valueDecl(x);
            if (d && ts.isVariableDeclaration(d) && (d.initializer || isLet(d))) {
                if (seen.has(d)) {
                    return [];
                }
                const sym = this.symbolOf(x)!;
                const exprs = [...(d.initializer ? [d.initializer] : []), ...assignmentsOf(d, sym, this.checker)];
                const s2 = isLet(d) ? new Set([...seen, d]) : seen;
                return exprs.flatMap((ex) => this.sources(ex, depth + 1, s2, via));
            }
            if (d && ts.isParameter(d)) {
                const items = this.callbackItems(d);
                if (items) {
                    return items.flatMap((it) => ('marker' in it ? [{...it, via: [...via, ...it.via]}] : this.sources(it.expr, depth + 1, seen, [...via, ...it.via])));
                }
                const fn = d.parent as FunctionLike;
                const idx = fn.parameters.indexOf(d);
                const cs = this.ix.calls.get(fn);
                if (cs && cs.length && !seen.has(fn)) {
                    const s2 = new Set([...seen, fn]);
                    return cs.flatMap((c) => (c.arguments[idx] ? this.sources(c.arguments[idx], depth + 1, s2, via) : []));
                }
            }
            return [{expr: x, via}];
        }
        if (ts.isCallExpression(x)) {
            const n = calleeName(x);
            if (n === 'useMemo') {
                const f = strip(x.arguments[0]);
                return f && isFunctionLike(f) ? returnsOf(f).flatMap((r) => this.sources(r, depth + 1, seen, via)) : [];
            }
            if (n === 'useCallback' && x.arguments[0]) {
                return this.sources(x.arguments[0], depth + 1, seen, via);
            }

            // a plugin key is the key itself, not what the normalizing helper does to a string
            if (isPluginKey(this.checker.getTypeAtLocation(x))) {
                return [{expr: x, via}];
            }
            const callee = strip(x.expression);
            const csym = (ts.isIdentifier(callee) || ts.isPropertyAccessExpression(callee)) ? this.checker.getSymbolAtLocation(callee) : undefined;
            const cfn = csym && this.ix.resolveSymbolToNode(csym);
            if (cfn && isFunctionLike(cfn) && cfn.body && !seen.has(cfn) && !this.ix.isLibraryNode(cfn)) {
                const s2 = new Set([...seen, cfn]);
                return returnsOf(cfn).flatMap((r) => this.sources(r, depth + 1, s2, via));
            }
            if (ts.isPropertyAccessExpression(callee) && ['filter', 'slice', 'sort', 'concat', 'reverse', 'toSorted'].includes(n)) {
                return [
                    ...this.sources(callee.expression, depth + 1, seen, via),
                    ...(n === 'concat' ? x.arguments.flatMap((a) => this.sources(a, depth + 1, seen, via)) : []),
                ];
            }
        }
        if (ts.isConditionalExpression(x)) {
            return [...this.sources(x.whenTrue, depth + 1, seen, via), ...this.sources(x.whenFalse, depth + 1, seen, via)];
        }
        if (ts.isBinaryExpression(x) && [ts.SyntaxKind.BarBarToken, ts.SyntaxKind.QuestionQuestionToken].includes(x.operatorToken.kind)) {
            return [...this.sources(x.left, depth + 1, seen, via), ...this.sources(x.right, depth + 1, seen, via)];
        }
        return [{expr: x, via}];
    }

    /** An identifier bound to an object literal -> that literal. */
    private literalOf(v: ts.Expression | undefined): ts.Expression | undefined {
        const x = strip(v) as ts.Expression | undefined;
        if (x && ts.isIdentifier(x)) {
            const d = this.valueDecl(x);
            if (d && ts.isVariableDeclaration(d) && d.initializer) {
                return d.initializer;
            }
        }
        return x;
    }

    /** The objects an expression can be: itself, a variable's initializer, or a parameter's argument at each call. */
    private literalsOf(v: ts.Expression, depth = 0): ts.Expression[] {
        const x = strip(v) as ts.Expression;
        if (depth > 3 || !ts.isIdentifier(x)) {
            return [x];
        }
        const d = this.valueDecl(x);
        if (d && ts.isVariableDeclaration(d) && d.initializer) {
            return [d.initializer];
        }
        if (d && ts.isParameter(d)) {
            const fn = d.parent as FunctionLike;
            const idx = fn.parameters.indexOf(d);
            const args = (this.ix.calls.get(fn) ?? []).map((c) => c.arguments[idx]).filter((a): a is ts.Expression => Boolean(a));
            if (args.length) {
                return args.flatMap((a) => this.literalsOf(a, depth + 1));
            }
        }
        return [x];
    }

    private memberOfLiteral(v: ts.Expression | undefined, k: string): ts.Expression | undefined {
        const o = strip(v);
        if (!o || !ts.isObjectLiteralExpression(o)) {
            return undefined;
        }
        const q = o.properties.find((p) => propName(p.name) === k);
        if (q && ts.isPropertyAssignment(q)) {
            return q.initializer;
        }
        if (q && ts.isShorthandPropertyAssignment(q)) {
            return q.name;
        }
        return undefined;
    }

    /**
     * Elements of an array that may come from several sources. A source that isn't an
     * array literal becomes a marker, so known elements are kept and the rest is a typed gap.
     */
    arrayElements(e: ts.Expression | Source, depth = 0): Source[] | null {
        if (depth > 4) {
            return null;
        }
        const out: Source[] = [];
        for (const src of this.sources(e)) {
            if ('marker' in src) {
                out.push(src);
                continue;
            }
            const arr = strip(src.expr);
            if (!ts.isArrayLiteralExpression(arr)) {
                out.push({marker: true, src: src.expr, via: src.via});
                continue;
            }
            const before = out.length;
            for (const el of arr.elements) {
                if (ts.isSpreadElement(el)) {
                    out.push(...(this.arrayElements({expr: el.expression, via: src.via}, depth + 1) ?? [{marker: true as const, src: el.expression, via: src.via}]));
                } else {
                    out.push({expr: el, via: src.via});
                }
            }

            // a list started empty and filled with push() (`const rows = []; rows.push({…})`): what it pushes are
            // its items; a list with no items known at all is unknown, not empty, or its usage's instances vanish
            const decl = arr.parent;
            if (ts.isVariableDeclaration(decl) && decl.initializer && strip(decl.initializer) === arr && ts.isIdentifier(decl.name)) {
                const sym = this.checker.getSymbolAtLocation(decl.name);
                for (const pushed of sym ? pushesOf(decl, sym, this.checker) : []) {
                    out.push({expr: pushed, via: src.via});
                }
            }
            if (out.length === before) {
                out.push({marker: true, src: src.expr, via: src.via});
            }
        }
        return out.some((x) => !('marker' in x)) ? out : null;
    }

    /** The arrays a `const f = (x) => …` is passed to by name, as `arr.map(f)` (or forEach, filter, ...), in its file. */
    private listsPassedTo(fn: FunctionLike): ts.Expression[] {
        const decl = fn.parent;
        if (!decl || !ts.isVariableDeclaration(decl) || !ts.isIdentifier(decl.name)) {
            return [];
        }
        const sym = this.checker.getSymbolAtLocation(decl.name);
        const lists: ts.Expression[] = [];
        const visit = (n: ts.Node) => {
            if (ts.isCallExpression(n) && n.arguments.length && ts.isIdentifier(n.arguments[0]) && this.checker.getSymbolAtLocation(n.arguments[0]) === sym) {
                const callee = strip(n.expression);
                if (ts.isPropertyAccessExpression(callee) && LIST_METHODS.includes(callee.name.text)) {
                    lists.push(callee.expression);
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(decl.getSourceFile());
        return lists;
    }

    /** A parameter of a callback passed to arr.map/forEach/filter/...: the array's elements, if it is a fixed list. */
    callbackItems(param: ts.ParameterDeclaration | undefined): Source[] | null {
        if (!param) {
            return null;
        }
        const fn = param.parent;
        if (!fn.parent || !ts.isCallExpression(fn.parent) || (fn as FunctionLike).parameters?.[0] !== param) {
            return null;
        }
        const callee = strip(fn.parent.expression);
        if (!ts.isPropertyAccessExpression(callee) || !LIST_METHODS.includes(callee.name.text)) {
            return null;
        }
        return this.arrayElements(callee.expression);
    }

    private valueDecl(id: ts.Identifier): ts.Declaration | undefined {
        const sym = this.symbolOf(id);
        if (!sym) {
            return undefined;
        }
        if (sym.flags & ts.SymbolFlags.Alias) {
            try {
                return this.checker.getAliasedSymbol(sym).valueDeclaration;
            } catch {
                return undefined;
            }
        }
        return sym.valueDeclaration;
    }

    /** Module-level constants reached by a property chain, incl. namespace imports (utils.X.y). */
    private constantChain(e: ts.Expression): {init?: ts.Expression; items?: Source[]; rest: string[]} | null {
        const names: string[] = [];
        let cur = strip(e) as ts.Expression;
        while (ts.isPropertyAccessExpression(cur)) {
            names.unshift(cur.name.text);
            cur = strip(cur.expression) as ts.Expression;
        }
        if (!ts.isIdentifier(cur) || !names.length) {
            return null;
        }
        let sym = this.symbolOf(cur);
        if (!sym) {
            return null;
        }
        if (sym.flags & ts.SymbolFlags.Alias) {
            sym = this.checker.getAliasedSymbol(sym);
        }
        if (sym.flags & ts.SymbolFlags.ValueModule) {
            let ex = this.checker.getExportsOfModule(sym).find((x) => x.getName() === names[0]);
            if (!ex) {
                return null;
            }
            if (ex.flags & ts.SymbolFlags.Alias) {
                ex = this.checker.getAliasedSymbol(ex);
            }
            const d = ex.valueDeclaration;
            if (d && ts.isVariableDeclaration(d) && d.initializer) {
                return {init: d.initializer, rest: names.slice(1)};
            }
            return null;
        }
        const d = sym.valueDeclaration ?? sym.declarations?.[0];
        if (d && ts.isVariableDeclaration(d) && d.initializer) {
            return {init: d.initializer, rest: names};
        }

        // `import utils from './utils'` of `export default {MuteChannel, ...}`: the exported object
        if (d && ts.isExportAssignment(d)) {
            return {init: d.expression, rest: names};
        }
        if (d && ts.isParameter(d) && !this.propsPath(cur)) {
            const srcs = this.sources(cur);
            if (srcs.length && !(srcs.length === 1 && 'expr' in srcs[0] && srcs[0].expr === cur)) {
                return {items: srcs, rest: names};
            }
        }
        if (d && ts.isBindingElement(d)) {
            const bp = this.bindingPath(d);
            if (bp && bp.root.kind === 'param') {
                const items = this.callbackItems(bp.root.fn.parameters[0]);
                if (items) {
                    return {items, rest: [...bp.path, ...names]};
                }
            }

            // `const {first} = opts; first.value`: the path from the destructured value
            if (bp && bp.root.kind === 'expr') {
                return {init: bp.root.expr, rest: [...bp.path, ...names]};
            }
        }
        return null;
    }

    // ---- components and props paths ----------------------------------------------------

    /** The component that owns a node: the nearest class, or function that isn't an inline callback. */
    componentOf(node: ts.Node): CodeNode | null {
        for (let n = node.parent; n; n = n.parent) {
            if (ts.isClassDeclaration(n) || ts.isClassExpression(n)) {
                return n;
            }
            if (isFunctionLike(n) && !ts.isMethodDeclaration(n)) {
                if (n.parent && ts.isCallExpression(n.parent) && n.parent.arguments.includes(n as ts.Expression) && !isHocCall(n.parent)) {
                    continue;
                }
                if (n.parent && ts.isJsxExpression(n.parent)) {
                    continue;
                }
                return n;
            }
        }
        return null;
    }

    /** The props path an expression reads: props.a.b, this.props.a, or identifiers bound from props. */
    propsPath(e: ts.Node): PropsRef | null {
        const x = strip(e as ts.Expression) as ts.Expression;
        const chain: string[] = [];
        let cur: ts.Expression = x;
        while (ts.isPropertyAccessExpression(cur) || (ts.isElementAccessExpression(cur) && ts.isStringLiteralLike(cur.argumentExpression))) {
            chain.unshift(ts.isPropertyAccessExpression(cur) ? cur.name.text : (cur.argumentExpression as ts.StringLiteralLike).text);
            cur = strip(cur.expression) as ts.Expression;
        }
        if (chain.length && chain[0] === 'props' && cur.kind === ts.SyntaxKind.ThisKeyword) {
            return {path: chain.slice(1), comp: classOfThis(x)};
        }
        if (!ts.isIdentifier(cur)) {
            return null;
        }
        const d = this.symbolOf(cur)?.valueDeclaration;
        if (!d) {
            return null;
        }
        if (ts.isParameter(d)) {
            const fn = d.parent as FunctionLike;
            if (fn.parameters?.[0] !== d) {
                return null;
            }
            return this.isComponentFn(fn) ? {path: chain, comp: fn} : null;
        }
        if (ts.isBindingElement(d) && d.dotDotDotToken) {
            const rp = this.restPropsOf(cur);
            return rp ? {path: [...rp.path, ...chain], comp: rp.comp} : null;
        }
        if (ts.isBindingElement(d)) {
            const bp = this.bindingPath(d);
            if (!bp) {
                return null;
            }
            if (bp.root.kind === 'param') {
                return this.isComponentFn(bp.root.fn) ? {path: [...bp.path, ...chain], comp: bp.root.fn} : null;
            }
            const inner = this.propsPath(bp.root.expr);
            if (inner) {
                return {path: [...inner.path, ...bp.path, ...chain], comp: inner.comp};
            }
            const re = strip(bp.root.expr) as ts.Expression;
            if (ts.isPropertyAccessExpression(re) && re.name.text === 'props' && re.expression.kind === ts.SyntaxKind.ThisKeyword) {
                return {path: [...bp.path, ...chain], comp: classOfThis(re)};
            }
        }
        return null;
    }

    /** `...rest` destructured from props: a pass-through of the same props. */
    restPropsOf(e: ts.Expression): PropsRef | null {
        if (!ts.isIdentifier(e)) {
            return null;
        }
        const d = this.symbolOf(e)?.valueDeclaration;
        if (!d || !ts.isBindingElement(d) || !d.dotDotDotToken) {
            return null;
        }
        const holder = d.parent.parent;
        if (ts.isParameter(holder) && this.isComponentFn(holder.parent as FunctionLike)) {
            return {path: [], comp: holder.parent as FunctionLike};
        }
        if (ts.isBindingElement(holder)) {
            const bp = this.bindingPath(holder);
            if (bp && bp.root.kind === 'param' && this.isComponentFn(bp.root.fn)) {
                return {path: bp.path, comp: bp.root.fn};
            }
        }
        if (ts.isVariableDeclaration(holder) && holder.initializer) {
            const pp = this.propsPath(holder.initializer);
            if (pp) {
                return pp;
            }
            const re = strip(holder.initializer) as ts.Expression;
            if (ts.isPropertyAccessExpression(re) && re.name.text === 'props' && re.expression.kind === ts.SyntaxKind.ThisKeyword) {
                return {path: [], comp: classOfThis(re)};
            }
        }
        return null;
    }

    bindingPath(be: ts.BindingElement): {path: string[]; root: {kind: 'param'; fn: FunctionLike} | {kind: 'expr'; expr: ts.Expression}} | null {
        const p: string[] = [];
        let n: ts.Node = be;
        while (ts.isBindingElement(n)) {
            if (n.dotDotDotToken) {
                return null;
            }
            const key = n.propertyName ? propName(n.propertyName) : propName(n.name);
            if (key === null) {
                return null;
            }
            p.unshift(key);
            n = n.parent.parent;
        }
        if (ts.isParameter(n)) {
            return {path: p, root: {kind: 'param', fn: n.parent as FunctionLike}};
        }
        if (ts.isVariableDeclaration(n) && n.initializer) {
            return {path: p, root: {kind: 'expr', expr: n.initializer}};
        }
        return null;
    }

    isComponentFn(fn: FunctionLike | undefined): boolean {
        if (!fn) {
            return false;
        }
        if (this.ix.usages.has(fn) || this.ix.dialogRefs.has(fn)) {
            return true;
        }
        let name = fn.name?.getText();
        if (!name && fn.parent && ts.isVariableDeclaration(fn.parent)) {
            name = fn.parent.name.getText();
        }
        if (!name && fn.parent && ts.isCallExpression(fn.parent)) {
            const vd = fn.parent.parent;
            if (vd && ts.isVariableDeclaration(vd)) {
                name = vd.name.getText();
            }
        }
        return Boolean(name) && (/^[A-Z]/).test(name!);
    }

    private readonly defaultMemo = new Map<CodeNode, Map<string, ts.Expression>>();

    /** A component's default for a prop: `({key = 'x'})`, `const {key = 'x'} = props`, or `static defaultProps = {key: 'x'}`. */
    private defaultFor(comp: CodeNode, key: string): ts.Expression | null {
        let defaults = this.defaultMemo.get(comp);
        if (!defaults) {
            defaults = new Map();
            this.defaultMemo.set(comp, defaults);
            const fromPattern = (pat: ts.ObjectBindingPattern) => {
                for (const el of pat.elements) {
                    const k = el.propertyName ? propName(el.propertyName) : propName(el.name);
                    if (k && el.initializer && !defaults!.has(k)) {
                        defaults!.set(k, el.initializer);
                    }
                }
            };
            const p = (comp as FunctionLike).parameters?.[0];
            if (p && ts.isObjectBindingPattern(p.name)) {
                fromPattern(p.name);
            }
            const visit = (n: ts.Node) => {
                if (ts.isVariableDeclaration(n) && ts.isObjectBindingPattern(n.name) && n.initializer) {
                    const init = strip(n.initializer) as ts.Expression;
                    const pp = this.propsPath(init);
                    const isThisProps = ts.isPropertyAccessExpression(init) && init.name.text === 'props' && init.expression.kind === ts.SyntaxKind.ThisKeyword;
                    if ((pp && pp.comp === comp && !pp.path.length) || isThisProps) {
                        fromPattern(n.name);
                    }
                }
                if (ts.isPropertyDeclaration(n) && propName(n.name) === 'defaultProps' && n.initializer && ts.isObjectLiteralExpression(n.initializer)) {
                    for (const q of n.initializer.properties) {
                        const k = propName(q.name);
                        if (k && ts.isPropertyAssignment(q) && !defaults!.has(k)) {
                            defaults!.set(k, q.initializer);
                        }
                    }
                }
                if (n === comp || (!isFunctionLike(n) && !ts.isClassLike(n)) || ts.isMethodDeclaration(n) || (ts.isArrowFunction(n) && ts.isClassLike(comp))) {
                    ts.forEachChild(n, visit);
                }
            };
            visit(comp);
        }
        return defaults.get(key) ?? null;
    }

    /** Where `propPath` comes from at one usage: the last matching attribute or spread wins, as in JSX. */
    private propAt(comp: CodeNode, u: Usage, propPath: string[], seen: Set<ts.Node>): PropAt {
        const attrs = usageAttrs(u);
        for (let i = attrs.length - 1; i >= 0; i--) {
            const a = attrs[i];
            if ('name' in a) {
                if (a.name !== propPath[0]) {
                    continue;
                }
                return a.value ? {kind: 'value', expr: a.value, rest: propPath.slice(1)} : {kind: 'true'};
            }
            const r = this.throughSpread(a.spread, propPath, seen);
            if (r) {
                return r;
            }
        }
        const dflt = propPath.length === 1 ? this.defaultFor(comp, propPath[0]) : null;
        if (dflt) {
            return {kind: 'default', expr: dflt};
        }

        // connect(mapStateToProps) can supply it: runtime data, not a missing value (unless its maps visibly don't)
        return this.ix.connects.has(comp) && this.connectMaySupply(comp, propPath[0]) ? {kind: 'connect'} : {kind: 'absent'};
    }

    private readonly narrowed = new Set<string>();

    /** A reference a condition can narrow: an identifier or a props path, keyed by where it is declared. */
    private narrowKey(e: ts.Expression): string | null {
        if (ts.isIdentifier(e)) {
            const d = this.symbolOf(e)?.valueDeclaration;
            return d ? `${d.getSourceFile().fileName}:${d.pos}:${e.text}` : null;
        }
        if (ts.isPropertyAccessExpression(e)) {
            const comp = this.componentOf(e);
            return comp ? `${comp.getSourceFile().fileName}:${comp.pos}:${e.getText()}` : null;
        }
        return null;
    }

    /** Resolves a branch with the condition's reference narrowed: truthy in the `when` branch (`x ?`), or falsy-free under `!x` in the other. */
    private narrowing<T>(cond: ts.Expression, whenTrue: boolean, fn: () => T): T {
        let c = strip(cond) as ts.Expression;
        let positive = whenTrue;
        while (ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken) {
            positive = !positive;
            c = strip(c.operand) as ts.Expression;
        }

        // `x === undefined ? … : <x is set here>`, `x != null && <x is set here>` (numbers: `0` is set)
        const nullish = (e: ts.Expression) => e.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(e) && e.text === 'undefined');
        if (ts.isBinaryExpression(c) && (nullish(strip(c.right) as ts.Expression) || nullish(strip(c.left) as ts.Expression))) {
            const op = c.operatorToken.kind;
            const eq = op === ts.SyntaxKind.EqualsEqualsEqualsToken || op === ts.SyntaxKind.EqualsEqualsToken;
            const ne = op === ts.SyntaxKind.ExclamationEqualsEqualsToken || op === ts.SyntaxKind.ExclamationEqualsToken;
            if (eq || ne) {
                positive = eq ? !positive : positive;
                c = strip(nullish(strip(c.right) as ts.Expression) ? c.left : c.right) as ts.Expression;
            }
        }

        // `a && b ? <both set here> : …`
        if (positive && ts.isBinaryExpression(c) && c.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
            const {left, right} = c;
            return this.narrowing(left, true, () => this.narrowing(right, true, fn));
        }
        const key = positive ? this.narrowKey(c) : null;
        if (!key || this.narrowed.has(key)) {
            return fn();
        }
        this.narrowed.add(key);
        try {
            return fn();
        } finally {
            this.narrowed.delete(key);
        }
    }

    /** Whether `connect(mapState, mapDispatch)` can supply a prop: false only when both maps' returned keys are known and lack it. */
    private connectMaySupply(comp: CodeNode, prop: string): boolean {
        const call = this.ix.connectCalls.get(comp);
        if (!call) {
            return true;
        }
        for (const arg of call.arguments.slice(0, 2)) {
            const keys = this.objectKeys(arg, 0, new Set());
            if (!keys || keys.has(prop)) {
                return true;
            }
        }
        return false;
    }

    /** Keys of the object a map function (or object, or factory) produces; null when not statically known. */
    private objectKeys(e: ts.Node | undefined, depth: number, seen: Set<ts.Node>): Set<string> | null {
        const x = strip(e as ts.Expression) as ts.Expression | undefined;
        if (!x || x.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(x) && x.text === 'undefined')) {
            return new Set();
        }
        if (depth > 4 || seen.has(x)) {
            return null;
        }
        seen.add(x);
        if (ts.isObjectLiteralExpression(x)) {
            const keys = new Set<string>();
            for (const p of x.properties) {
                const name = ts.isSpreadAssignment(p) ? null : propName(p.name);
                if (!name) {
                    return null;
                }
                keys.add(name);
            }
            return keys;
        }
        if (isFunctionLike(x)) {
            const out = new Set<string>();
            for (const r of returnsOf(x)) {
                const ks = this.objectKeys(r, depth + 1, seen);
                if (!ks) {
                    return null;
                }
                ks.forEach((k) => out.add(k));
            }
            return out;
        }
        if (ts.isIdentifier(x) || ts.isCallExpression(x)) {
            const target = ts.isIdentifier(x) ? x : x.expression;
            const sym = this.ix.checker.getSymbolAtLocation(target);
            const node = this.ix.resolveSymbolToNode(sym);
            const d = sym?.valueDeclaration;
            const def = node ?? (d && ts.isVariableDeclaration(d) ? d.initializer : undefined);
            if (!def || this.ix.isLibraryNode(def)) {
                return null;
            }

            // a factory (`makeMapStateToProps()`) returns the map function
            if (ts.isCallExpression(x) && isFunctionLike(def)) {
                const out = new Set<string>();
                for (const r of returnsOf(def)) {
                    const ks = this.objectKeys(r, depth + 1, seen);
                    if (!ks) {
                        return null;
                    }
                    ks.forEach((k) => out.add(k));
                }
                return out;
            }
            return this.objectKeys(def, depth + 1, seen);
        }
        return null;
    }

    /** `{...props}` / `{...rest}` / `{...{a: 1}}` / `{...local}`. Null if the spread can't carry the prop. */
    private throughSpread(spread: ts.Expression, propPath: string[], seen: Set<ts.Node>): PropAt | null {
        const pp = this.propsPath(spread);
        if (pp && pp.comp && !seen.has(pp.comp)) {
            return {kind: 'up', comp: pp.comp, path: [...pp.path, ...propPath]};
        }
        const obj = strip(spread) as ts.Expression;
        const carries = (o: ts.ObjectLiteralExpression) => o.properties.some((q) => ts.isSpreadAssignment(q) || propName(q.name) === propPath[0]);
        if (ts.isObjectLiteralExpression(obj)) {
            return carries(obj) ? {kind: 'object', expr: obj, path: propPath} : null;
        }
        const rp = this.restPropsOf(obj);
        if (rp && rp.comp && !seen.has(rp.comp)) {
            return {kind: 'up', comp: rp.comp, path: [...rp.path, ...propPath]};
        }
        if (ts.isIdentifier(obj)) {
            const dd = this.symbolOf(obj)?.valueDeclaration;
            if (dd && ts.isVariableDeclaration(dd) && dd.initializer) {
                const init = strip(dd.initializer) as ts.Expression;
                if (ts.isObjectLiteralExpression(init) && !carries(init)) {
                    return null;
                }
                return {kind: 'object', expr: dd.initializer, path: propPath};
            }

            // a local helper's parameter (`renderRoutes(extraProps)`): the objects its calls pass (propSources follows them)
            if (dd && ts.isParameter(dd) && (this.ix.calls.get(dd.parent as FunctionLike) ?? []).length) {
                return {kind: 'object', expr: obj, path: propPath};
            }
        }

        // a spread of a typed object that has no such property can't carry it
        const t = this.checker.getTypeAtLocation(spread);
        if (!(t.flags & ts.TypeFlags.Any) && !t.getProperty(propPath[0]) && !this.checker.getIndexInfoOfType(t, ts.IndexKind.String)) {
            return null;
        }
        return {kind: 'unknown', node: spread};
    }

    /** The `dialogProps` expression of a modal reference. */
    private dialogPropsOf(ref: {kind: 'object'; node: ts.ObjectLiteralExpression} | {kind: 'jsx'; node: ts.JsxOpeningElement | ts.JsxSelfClosingElement}): ts.Expression | undefined {
        if (ref.kind === 'object') {
            const p = ref.node.properties.find((q) => propName(q.name) === 'dialogProps');
            return p && ts.isPropertyAssignment(p) ? p.initializer : undefined;
        }
        return attrValueOf(ref.node, 'dialogProps');
    }

    /** Source expressions of a props path across every usage (and modal reference) of a component. */
    private propSources(comp: CodeNode, propPath: string[], depth: number, seen: Set<ts.Node>, via: Loc[]): Source[] {
        const out: Source[] = [];
        for (const u of this.ix.usages.get(comp) ?? []) {
            const at = [...via, this.ix.where(usageNode(u))];
            const r = this.propAt(comp, u, propPath, seen);
            if (r.kind === 'value' || r.kind === 'object') {
                const rest = r.kind === 'value' ? r.rest : r.path;

                // `actions={actions}` with `.editName` still to pick: the value is the parent's own prop, so the
                // member comes from the parent's usages (an actions object passed down through several components)
                const up = rest.length ? this.propsPath(r.expr) : null;
                if (up && up.comp && up.path.length && !seen.has(up.comp)) {
                    out.push(...this.propSources(up.comp, [...up.path, ...rest], depth + 1, new Set([...seen, up.comp]), at));
                    continue;
                }

                // the object may be a local helper's parameter (`renderRoutes(extraProps)` -> `<Page {...extraProps}/>`):
                // follow it to each call's argument
                for (const obj of rest.length ? this.literalsOf(r.expr) : [r.expr]) {
                    let v: ts.Expression | undefined = obj;
                    for (const k of rest) {
                        v = this.memberOfLiteral(this.literalOf(v), k);
                        if (!v) {
                            break;
                        }
                    }
                    if (v) {
                        out.push(...this.sources(v, depth + 1, seen, at));
                    }
                }
            } else if (r.kind === 'up') {
                out.push(...this.onlyFromSources(comp, u, via.length, this.propSources(r.comp, r.path, depth + 1, new Set([...seen, r.comp]), at)));
            } else if (r.kind === 'default') {
                out.push(...this.sources(r.expr, depth + 1, seen, at));
            }
            if (out.length > MAX_USAGE_VALUES) {
                break;
            }
        }
        if (!(this.ix.usages.get(comp) ?? []).length) {
            const dflt = propPath.length === 1 ? this.defaultFor(comp, propPath[0]) : null;
            if (dflt) {
                out.push(...this.sources(dflt, depth + 1, seen, via));
            }
        }
        return out;
    }

    /**
     * A dynamic usage (`<props.as/>`, `createElement(props.inputComponent)`) renders this component only for
     * the instances whose usage chain supplied it: drop values that came through other instances.
     */
    private onlyFrom(comp: CodeNode, u: Usage, vals: Value[]): Value[] {
        const allowed = this.ix.dynamicVia.get(comp)?.get(u);
        if (!allowed) {
            return vals;
        }
        return vals.filter((v) => allowed.some((a) => prefixCompatible(a, v.via ?? [])));
    }

    private onlyFromSources(comp: CodeNode, u: Usage, skip: number, srcs: Source[]): Source[] {
        const allowed = this.ix.dynamicVia.get(comp)?.get(u);
        if (!allowed) {
            return srcs;
        }
        return srcs.filter((s) => allowed.some((a) => prefixCompatible(a, s.via.slice(skip + 1))));
    }

    /** Resolves a props path at every place the component is used. Each value records the usage it came from. */
    resolveProps(comp: CodeNode, propPath: string[], depth: number, seen: Set<ts.Node>): Value[] {
        const sites = this.ix.usages.get(comp) ?? [];
        const dialogs = this.ix.dialogRefs.get(comp) ?? [];
        if (!sites.length && !dialogs.length) {
            const dflt = propPath.length === 1 ? this.defaultFor(comp, propPath[0]) : null;
            if (dflt) {
                return this.resolve(dflt, depth + 1, seen);
            }
            return [this.unres('component-has-no-static-usage', comp)];
        }
        const out: Value[] = [];
        const tagged = (vals: Value[], at: Loc) => vals.map((v) => ({...v, via: [at, ...(v.via ?? [])]}));
        for (const u of sites) {
            const node = usageNode(u);
            const vals = this.onlyFrom(comp, u, this.atUsage(comp, u, propPath, depth, seen));
            out.push(...tagged(vals, this.ix.where(node)));
            if (out.length > MAX_USAGE_VALUES) {
                out.push(truncated(this.ix.where(comp)));
                break;
            }
        }
        for (const ref of dialogs) {
            const at = this.ix.where(ref.node);
            const dp = this.dialogPropsOf(ref);
            out.push(...tagged(dp ? this.descend(dp, propPath, depth, seen) : [{k: 'absent', at}], at));
        }
        return out;
    }

    private atUsage(comp: CodeNode, u: Usage, propPath: string[], depth: number, seen: Set<ts.Node>): Value[] {
        const r = this.propAt(comp, u, propPath, seen);
        const at = this.ix.where(usageNode(u));
        switch (r.kind) {
        case 'value':
            return this.descend(r.expr, r.rest, depth, seen);
        case 'true':
            return [lit('true')];
        case 'up':
        case 'object': {
            const vals = r.kind === 'up' ? this.resolveProps(r.comp, r.path, depth + 1, new Set([...seen, r.comp])) : this.descend(r.expr, r.path, depth, seen);

            // a spread that may carry the prop but doesn't: the component's default applies
            const dflt = propPath.length === 1 ? this.defaultFor(comp, propPath[0]) : null;
            if (!dflt || !vals.some((v) => v.k === 'absent')) {
                return vals;
            }
            const fallback = this.resolve(dflt, depth + 1, seen);
            return vals.flatMap((v): Value[] => (v.k === 'absent' ? fallback.map((d) => ({...d, via: v.via ?? d.via}) as Value) : [v]));
        }
        case 'unknown':
            return [this.unres('spread-unknown', r.node)];
        case 'default':
            return this.resolve(r.expr, depth + 1, seen);
        case 'connect':
            return [{k: 'unres', why: 'from-connect', at}];
        default:
            return [{k: 'absent', at}];
        }
    }

    private descend(expr: ts.Expression | undefined, rest: string[], depth: number, seen: Set<ts.Node>): Value[] {
        const x = strip(expr) as ts.Expression;
        if (!x) {
            return [{k: 'absent'}];
        }
        if (!rest.length) {
            return this.resolve(x, depth + 1, seen);
        }
        if (ts.isObjectLiteralExpression(x)) {
            for (let i = x.properties.length - 1; i >= 0; i--) {
                const p = x.properties[i];
                if (ts.isSpreadAssignment(p)) {
                    const inner = this.descend(p.expression, rest, depth, seen);
                    if (!inner.every((v) => v.k === 'absent')) {
                        return inner;
                    }
                    continue;
                }
                if (propName(p.name) !== rest[0]) {
                    continue;
                }
                if (ts.isShorthandPropertyAssignment(p)) {
                    return this.descend(p.name, rest.slice(1), depth, seen);
                }
                if (ts.isPropertyAssignment(p)) {
                    return this.descend(p.initializer, rest.slice(1), depth, seen);
                }
                return [this.unres('object-member-kind', p)];
            }
            return [{k: 'absent', at: this.ix.where(x)}];
        }
        if (ts.isCallExpression(x) && calleeName(x) === 'useMemo') {
            const f = strip(x.arguments[0]);
            if (f && isFunctionLike(f)) {
                return returnsOf(f).flatMap((r) => this.descend(r, rest, depth + 1, seen));
            }
        }
        if (ts.isPropertyAccessExpression(x)) {
            const cc = this.constantChain(x);
            if (cc && cc.init) {
                return this.descend(cc.init, [...cc.rest, ...rest], depth + 1, seen);
            }
        }
        if (ts.isIdentifier(x)) {
            const d = this.symbolOf(x)?.valueDeclaration;
            if (d && ts.isVariableDeclaration(d) && d.initializer) {
                return this.descend(d.initializer, rest, depth + 1, seen);
            }

            // a helper's parameter (`createSection({firstOption: {value: 'a'}})`): the path into each call's argument
            if (d && ts.isParameter(d) && !this.propsPath(x)) {
                const fn = d.parent as FunctionLike;
                const cs = this.ix.calls.get(fn) ?? [];
                if (cs.length && !(fn.parent && ts.isCallExpression(fn.parent)) && !seen.has(fn)) {
                    const idx = fn.parameters.indexOf(d);
                    const s2 = new Set([...seen, fn]);

                    // a call whose argument lacks the path can't render a testid read from it (`if (third) {... third.value}`)
                    const vals = cs.flatMap((c) => (c.arguments[idx] ? this.descend(c.arguments[idx], rest, depth + 1, s2) : []));
                    const present = vals.filter((v) => v.k !== 'absent');
                    return present.length ? present : vals;
                }
            }
        }
        return [this.dataGap(x, rest)];
    }

    private descendSource(src: Source, rest: string[], depth: number, seen: Set<ts.Node>): Value[] {
        const vals = 'marker' in src ? [this.dataGap(src.src, rest, true)] : this.descend(src.expr, rest, depth + 1, seen);
        return src.via.length ? vals.map((v) => ({...v, via: [...src.via, ...(v.via ?? [])]})) : vals;
    }

    // ---- resolve ------------------------------------------------------------------------

    private reentries = new WeakMap<ts.Node, ts.Node>();

    /** A stand-in for "this component, entered a second time" in a resolution's `seen` set. */
    private reentryMarker(comp: ts.Node): ts.Node {
        let m = this.reentries.get(comp);
        if (!m) {
            m = {kind: comp.kind} as ts.Node;
            this.reentries.set(comp, m);
        }
        return m;
    }

    /** Resolves `e` where `cond` is known truthy (`whenTrue`) or falsy: a value guarded by an enclosing condition. */
    resolveUnder(cond: ts.Expression, whenTrue: boolean, e: ts.Expression): Value[] {
        return this.narrowing(cond, whenTrue, () => this.resolve(e));
    }

    resolve(e: ts.Expression | undefined, depth = 0, seen = new Set<ts.Node>(), env: Env | null = null): Value[] {
        const x = strip(e) as ts.Expression;
        if (!x) {
            return [{k: 'absent'}];
        }

        // inside `testId ? \`${testId}--button\` : …`, testId is known to be set
        const nk = this.narrowed.size ? this.narrowKey(x) : null;
        if (nk && this.narrowed.has(nk)) {
            this.narrowed.delete(nk);
            try {
                return this.resolve(x, depth, seen, env).filter((v) => !isFalsy(v));
            } finally {
                this.narrowed.add(nk);
            }
        }
        if (ts.isStringLiteral(x) || ts.isNoSubstitutionTemplateLiteral(x)) {
            return [lit(x.text)];
        }
        if (depth > MAX_DEPTH) {
            return [{...this.gapFor(x), recursive: true} as Value];
        }
        if (x.kind === ts.SyntaxKind.UndefinedKeyword || x.kind === ts.SyntaxKind.NullKeyword || (ts.isIdentifier(x) && x.text === 'undefined')) {
            return [{k: 'absent', at: this.ix.where(x)}];
        }
        if (ts.isNumericLiteral(x)) {
            return [lit(x.text)];
        }
        if (ts.isTemplateExpression(x)) {
            let acc: Value[] = [lit(x.head.text)];
            for (const span of x.templateSpans) {
                acc = concat(acc, this.resolveOrGap(span.expression, depth, seen, env));
                acc = concat(acc, [lit(span.literal.text)]);
            }
            return this.locateTruncation(acc, x);
        }
        if (ts.isBinaryExpression(x)) {
            const op = x.operatorToken.kind;
            if (op === ts.SyntaxKind.PlusToken) {
                return this.locateTruncation(concat(this.resolveOrGap(x.left, depth, seen, env), this.resolveOrGap(x.right, depth, seen, env)), x);
            }
            if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
                let left = this.resolve(x.left, depth + 1, seen, env);
                const right = this.resolve(x.right, depth + 1, seen, env);

                // `a || b`: where a is an empty string, b is used instead
                if (op === ts.SyntaxKind.BarBarToken && left.some((v) => withoutEmptyMember(v) !== v)) {
                    left = left.map(withoutEmptyMember);
                    return [...left.filter((v) => v.k !== 'absent'), ...right];
                }

                // per instance: the fallback is only taken where the left side can be missing
                const cond = {vals: left, negate: false};
                return [...left.filter((v) => v.k !== 'absent'), ...distribute(right, cond, false)];
            }
            if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
                const cond = this.condition(x.left, depth, seen, env);
                const right = this.narrowing(x.left, true, () => this.resolve(x.right, depth + 1, seen, env));
                return cond ? [...distribute(right, cond, true), ...distribute([{k: 'absent'}], cond, false)] : [...right, {k: 'absent'}];
            }
        }
        if (ts.isConditionalExpression(x)) {
            const cond = this.condition(x.condition, depth, seen, env);
            const arm = this.armKey(x.condition);
            const t = withArm(this.narrowing(x.condition, true, () => this.resolve(x.whenTrue, depth + 1, seen, env)), arm, true);
            const f = withArm(this.narrowing(x.condition, false, () => this.resolve(x.whenFalse, depth + 1, seen, env)), arm, false);
            const test = strip(x.condition) as ts.Expression;
            if (!cond && ts.isBinaryExpression(test)) {
                // `a && b ? t : f`: t can't be taken where `a` or `b` is false; `a || b ? t : f`: f can't be taken where either is true
                const left = this.condition(test.left, depth, seen, env);
                const right = this.condition(test.right, depth, seen, env);
                const sides = [left, right].filter((c): c is NonNullable<typeof left> => Boolean(c));
                if (sides.length && test.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken) {
                    // f is taken where either side can be false
                    const fs = left && right ? union(distribute(f, left, false), distribute(f, right, false)) : perInstance(f, sides[0]);
                    return [...sides.reduce((vs, c) => distribute(vs, c, true), t), ...fs];
                }
                if (sides.length && test.operatorToken.kind === ts.SyntaxKind.BarBarToken) {
                    const ts2 = left && right ? union(distribute(t, left, true), distribute(t, right, true)) : perInstance(t, sides[0]);
                    return [...ts2, ...sides.reduce((vs, c) => distribute(vs, c, false), f)];
                }
            }
            if (!cond) {
                return [...t, ...f];
            }

            // per instance, an arm whose condition is known to be false there can't be taken
            return [...distribute(t, cond, true), ...distribute(f, cond, false)];
        }

        const pp = this.propsPath(x);
        if (pp && pp.comp) {
            // A component that renders itself (a post preview inside a post) is unrolled once: the inner instance's
            // prop resolves through the outer instance's real callers, and only a second re-entry is a gap. The
            // gap's `{key}` template is then dropped where the unrolled one accounts for it (scan.ts).
            const again = this.reentryMarker(pp.comp);
            if (seen.has(pp.comp) && seen.has(again)) {
                return [{...this.gapFor(x), recursive: true} as Value];
            }
            if (!pp.path.length) {
                return [this.unres('whole-props-object', x)];
            }
            const r = this.resolveProps(pp.comp, pp.path, depth + 1, new Set([...seen, seen.has(pp.comp) ? again : pp.comp]));
            return r.flatMap((v) => {
                if (v.k === 'unres' && v.why === 'component-has-no-static-usage') {
                    return this.literalsFromType(x) ?? [{...this.gapFor(x), libraryRendered: true, via: v.via} as Value];
                }
                return v.k === 'unres' && v.why === 'from-connect' ? {...this.gapFor(x), via: v.via} as Value : this.typedHere(v, x);
            });
        }

        if (ts.isIdentifier(x)) {
            const r = this.resolveIdentifier(x, depth, seen, env);
            if (r) {
                return r;
            }
        }
        if (ts.isPropertyAccessExpression(x)) {
            const cc = this.constantChain(x);
            if (cc && cc.init) {
                return this.descend(cc.init, cc.rest, depth + 1, seen);
            }
            if (cc && cc.items) {
                return cc.items.flatMap((it) => this.descendSource(it, cc.rest, depth, seen));
            }
        }
        if (ts.isCallExpression(x)) {
            // a normalized key (`pluginTestKey(id)`, `settingTestKey(path)`) is the key itself: a typed, never-empty gap
            const brand = this.checker.getTypeAtLocation(x).aliasSymbol?.getName();
            if (brand === 'SettingTestKey') {
                return [this.settingGap(x, depth, seen, env)];
            }
            if (brand === PLUGIN_KEY_TYPE || brand === 'SuggestionTestKey') {
                return [this.gapFor(x)];
            }
            const r = this.resolveCall(x, depth, seen, env);
            if (!r.every((v) => v.k === 'computed')) {
                return r;
            }
            return this.literalsFromType(x) ?? r;
        }

        // `true` / `false` (a prop passed `={true}`, a default `= false`), as a valueless attribute is 'true'
        if (x.kind === ts.SyntaxKind.TrueKeyword || x.kind === ts.SyntaxKind.FalseKeyword) {
            return [lit(x.kind === ts.SyntaxKind.TrueKeyword ? 'true' : 'false')];
        }

        // nothing more precise: the declared type's literals (as const members, literal unions)
        return this.literalsFromType(x) ?? [this.unres('runtime-value', x)];
    }

    /** Where the expression whose values were cut at a cap is (`concat` doesn't know), counted once per place. */
    private locateTruncation(vals: Value[], x: ts.Expression): Value[] {
        if (!vals.some((v) => v.k === 'unres' && v.why === TOO_MANY_VALUES && !v.at)) {
            return vals;
        }
        const at = this.ix.where(x);
        this.truncatedAt.add(at);
        return vals.map((v) => (v.k === 'unres' && v.why === TOO_MANY_VALUES && !v.at ? truncated(at) : v));
    }

    /** Expressions whose values were cut at a cap. */
    readonly truncatedAt = new Set<Loc>();

    private resolveIdentifier(x: ts.Identifier, depth: number, seen: Set<ts.Node>, env: Env | null): Value[] | null {
        const sym = this.symbolOf(x);
        let d = sym?.valueDeclaration;
        if (sym && (sym.flags & ts.SymbolFlags.Alias)) {
            d = this.checker.getAliasedSymbol(sym).valueDeclaration;
        }
        if (!d) {
            return null;
        }
        if (ts.isVariableDeclaration(d) && (d.initializer || isLet(d))) {
            if (seen.has(d)) {
                return [{...this.gapFor(x), recursive: true} as Value];
            }

            // let x = ...; if (...) x = ...  (or `let x: T;` assigned later)
            const s2 = isLet(d) ? new Set([...seen, d]) : seen;
            const vals = d.initializer ? this.resolve(d.initializer, depth + 1, s2) : [];
            for (const rhs of assignmentsOf(d, sym!, this.checker)) {
                vals.push(...this.resolve(rhs, depth + 1, s2));
            }
            return vals.length ? vals : [{k: 'absent', at: this.ix.where(d)}];
        }
        if (ts.isParameter(d) && env && sym && env.has(sym)) {
            const b = env.get(sym)!;
            return this.resolve(b.expr, depth + 1, seen, b.env);
        }
        if (ts.isParameter(d)) {
            const fn = d.parent as FunctionLike;
            const idx = fn.parameters.indexOf(d);
            const items = this.callbackItems(d);
            if (items) {
                return items.flatMap((it) => this.descendSource(it, [], depth, seen));
            }
            if (fn.parent && ts.isCallExpression(fn.parent)) {
                return [this.gapFor(x)];
            }
            const cs = this.ix.calls.get(fn) ?? [];
            if (!cs.length) {
                // `const render = (x) => …` passed by name, `list.map(render)`: the list's elements, or key data
                const lists = idx === 0 ? this.listsPassedTo(fn) : [];
                if (lists.length) {
                    const items = lists.map((l) => this.arrayElements(l));
                    return items.every(Boolean) ? items.flatMap((it) => it!).flatMap((it) => this.descendSource(it, [], depth, seen)) : [this.gapFor(x)];
                }
                return [this.unres('param-no-calls', x)];
            }
            const out: Value[] = [];
            for (const c of cs) {
                const arg = c.arguments[idx];
                out.push(...(arg ? this.resolve(arg, depth + 1, seen) : [{k: 'absent'} as Value]));
            }
            return out;
        }
        if (ts.isBindingElement(d)) {
            const bp = this.bindingPath(d);
            if (bp && bp.root.kind === 'expr') {
                return this.descend(bp.root.expr, bp.path, depth + 1, seen);
            }

            // `options.map(({option}) => ...)` over a fixed list: the field of each item
            if (bp && bp.root.kind === 'param' && !this.isComponentFn(bp.root.fn)) {
                const items = this.callbackItems(bp.root.fn.parameters[0]);
                if (items) {
                    return items.flatMap((it) => this.descendSource(it, bp.path, depth, seen));
                }
            }
        }
        return null;
    }

    private resolveCall(x: ts.CallExpression, depth: number, seen: Set<ts.Node>, env: Env | null): Value[] {
        if (calleeName(x) === 'useMemo') {
            const f = strip(x.arguments[0]);
            if (f && isFunctionLike(f)) {
                return returnsOf(f).flatMap((r) => this.resolve(r, depth + 1, seen, env));
            }
        }

        // small local helpers: their return expressions with parameters bound to this call's arguments
        const callee = strip(x.expression);
        const sym = (ts.isIdentifier(callee) || ts.isPropertyAccessExpression(callee)) ? this.checker.getSymbolAtLocation(callee) : undefined;
        const fn = sym && this.ix.resolveSymbolToNode(sym);
        if (fn && isFunctionLike(fn) && fn.body && !seen.has(fn)) {
            const benv: Env = new Map(env ?? []);
            fn.parameters.forEach((p, i) => {
                const ps = this.checker.getSymbolAtLocation(p.name);
                if (ps && x.arguments[i]) {
                    benv.set(ps, {expr: x.arguments[i], env});
                }
            });
            const rets = returnsOf(fn);
            if (rets.length && rets.length <= 8) {
                return rets.flatMap((r) => this.resolve(r, depth + 1, new Set([...seen, fn]), benv));
            }
        }
        return [this.alwaysTruthy(x) ? {k: 'computed', at: this.ix.where(x), truthy: true} : {k: 'computed', at: this.ix.where(x)}];
    }

    /** Values of a simple condition (a prop, a variable, or its negation), or null when the condition is computed. */
    private condition(c: ts.Expression, depth: number, seen: Set<ts.Node>, env: Env | null): {vals: Value[]; negate: boolean} | null {
        let e = strip(c) as ts.Expression;
        let negate = false;
        while (ts.isPrefixUnaryExpression(e) && e.operator === ts.SyntaxKind.ExclamationToken) {
            negate = !negate;
            e = strip(e.operand) as ts.Expression;
        }
        if (!ts.isIdentifier(e) && !ts.isPropertyAccessExpression(e) && !ts.isElementAccessExpression(e)) {
            return null;
        }
        if (!this.propsPath(e) && !ts.isIdentifier(e)) {
            return null;
        }
        return {vals: this.resolve(e, depth + 1, seen, env), negate};
    }

    /**
     * Resolves an expression for one instance: when it reads a prop and the instance's innermost usage is
     * known, only that usage is consulted (no need to walk every usage of a widely used component).
     */
    resolveIn(e: ts.Expression | undefined, via: Loc[] | undefined): Value[] {
        const x = strip(e) as ts.Expression | undefined;
        const pp = x ? this.propsPath(x) : null;
        if (x && pp && pp.comp && pp.path.length && via?.length) {
            const u = (this.ix.usages.get(pp.comp) ?? []).find((us) => this.ix.where(usageNode(us)) === via[0]);
            if (u) {
                return this.atUsage(pp.comp, u, pp.path, 0, new Set([pp.comp])).map((v) => ({...v, via: [via[0], ...(v.via ?? [])]}));
            }
        }
        return this.resolve(e);
    }

    /** Inside templates: data that can't be resolved becomes a typed {key} gap; `undefined` stays visible. */
    resolveOrGap(e: ts.Expression, depth: number, seen: Set<ts.Node>, env: Env | null): Value[] {
        const vals = this.resolve(e, depth + 1, seen, env);
        return vals.
            map((v) => ((v.k === 'unres' && v.why === 'runtime-value') || v.k === 'computed' ? {...this.gapFor(strip(e) as ts.Expression), via: v.via} as Value : v)).
            map((v) => (v.k === 'absent' ? lit('undefined', v.via) : v));
    }
}

/** The class `this` refers to: arrows don't rebind it, function declarations/expressions do. */
function classOfThis(node: ts.Node): ts.ClassLikeDeclaration | null {
    for (let n = node.parent; n; n = n.parent) {
        if (ts.isClassLike(n)) {
            return n;
        }
        if (ts.isFunctionDeclaration(n) || ts.isFunctionExpression(n)) {
            return null;
        }
    }
    return null;
}

/** Truthiness of a condition for one instance: false when every compatible value is absent/empty, true when every one is a non-empty value. */
function truth(cond: {vals: Value[]; negate: boolean}, via: Loc[] | undefined): boolean | null {
    const vals = cond.vals.filter((v) => !via || !v.via || prefixCompatible(v.via, via));
    if (!vals.length) {
        return null;
    }
    const isFalse = (v: Value) => v.k === 'absent' || (v.k === 'lit' && (v.s === '' || v.s === 'false'));
    const isTrue = isTruthy;
    let r: boolean | null = null;
    if (vals.every(isFalse)) {
        r = false;
    } else if (vals.every(isTrue)) {
        r = true;
    }
    return r === null || !cond.negate ? r : !r;
}

/** Values with no provenance, attached to each instance the condition's values belong to (when they all belong to one). */
function perInstance(vals: Value[], cond: {vals: Value[]}): Value[] {
    if (!cond.vals.length || !cond.vals.every((c) => c.via?.length)) {
        return vals;
    }
    const vias = [...new Map(cond.vals.map((c) => [c.via!.join('<'), c.via!])).values()];
    return vals.flatMap((v) => (v.via?.length ? [v] : vias.map((via) => ({...v, via}) as Value)));
}

const isFalsy = (v: Value) => v.k === 'absent' || (v.k === 'lit' && (v.s === '' || v.s === 'false'));

// a type with a falsy member; a gap of any other type (a callback, an object, a non-empty literal union) can't be empty
const FALSY_TYPE = /\b(undefined|null|false|boolean|string|number|bigint|any|unknown)\b|''|""/;
const neverFalsy = (p: Value & {k: 'pat'}) => p.parts.some((q) => (typeof q === 'string' ? q !== '' : q.gap.type !== '' && !FALSY_TYPE.test(q.gap.type)));

// a pattern is truthy when some part can't be empty: literal text, or a gap of a type with no falsy member
const isTruthy = (v: Value) => (v.k === 'lit' && v.s !== '' && v.s !== 'false') ||
    (v.k === 'pat' && neverFalsy(v)) ||
    ((v.k === 'unres' || v.k === 'computed') && v.truthy === true);

/**
 * Values of a branch taken when the condition is `want`. A value that came through usages is kept unless
 * the condition is known to be the opposite for that instance; a value with no provenance (a literal in
 * the branch) is attached to each instance where the condition is `want`.
 */
function distribute(vals: Value[], cond: {vals: Value[]; negate: boolean}, want: boolean): Value[] {
    const out: Value[] = [];
    const matches = (v: Value) => (want === cond.negate ? isFalsy(v) : isTruthy(v));
    const instances = cond.vals.filter((c) => c.via?.length && matches(c));
    const unknown = cond.vals.some((c) => !c.via?.length || (!isTruthy(c) && !isFalsy(c)));
    for (const v of vals) {
        if (v.via?.length) {
            if (truth(cond, v.via) !== !want) {
                out.push(v);
            }
            continue;
        }
        const all = truth(cond, undefined);
        if (all === !want) {
            continue;
        }

        // every condition value belongs to an instance: the branch is that instance's wherever it isn't known to be the other one
        if (cond.vals.length && cond.vals.every((c) => c.via?.length)) {
            const opposite = (c: Value) => (want === cond.negate ? isTruthy(c) : isFalsy(c));
            const seenVia = new Set<string>();
            for (const c of cond.vals) {
                const k = c.via!.join('<');
                if (!opposite(c) && !seenVia.has(k)) {
                    seenVia.add(k);
                    out.push({...v, via: c.via} as Value);
                }
            }
            continue;
        }
        if (!instances.length || unknown) {
            out.push(v);
        }
        for (const c of instances) {
            out.push({...v, via: c.via} as Value);
        }
    }
    return out;
}

function prefixCompatible(a: Loc[], b: Loc[]): boolean {
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
        if (a[i] !== b[i]) {
            return false;
        }
    }
    return true;
}

function isLet(d: ts.VariableDeclaration): boolean {
    return Boolean(d.parent && (d.parent.flags & ts.NodeFlags.Let));
}

const assignmentMemo = new WeakMap<ts.VariableDeclaration, ts.Expression[]>();

/** Right-hand sides assigned to a `let` in its scope. */
export function assignmentsOf(d: ts.VariableDeclaration, sym: ts.Symbol, checker: ts.TypeChecker): ts.Expression[] {
    const scope = d.parent?.parent?.parent;
    if (!scope || !isLet(d)) {
        return [];
    }
    const memo = assignmentMemo.get(d);
    if (memo) {
        return memo;
    }
    const out: ts.Expression[] = [];
    assignmentMemo.set(d, out);
    const visit = (n: ts.Node) => {
        if (ts.isBinaryExpression(n) && n.operatorToken.kind === ts.SyntaxKind.EqualsToken && ts.isIdentifier(n.left) && checker.getSymbolAtLocation(n.left) === sym) {
            out.push(n.right);
        }
        ts.forEachChild(n, visit);
    };
    visit(scope);
    return out;
}

/** The values pushed onto a local array (`const items = []; items.push(<Menu.Item …/>)`), in the declaring scope. */
export function pushesOf(d: ts.VariableDeclaration, sym: ts.Symbol, checker: ts.TypeChecker): ts.Expression[] {
    const scope = d.parent?.parent?.parent;
    if (!scope) {
        return [];
    }
    const out: ts.Expression[] = [];
    const visit = (n: ts.Node) => {
        if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression) && n.expression.name.text === 'push' &&
            ts.isIdentifier(n.expression.expression) && checker.getSymbolAtLocation(n.expression.expression) === sym) {
            out.push(...n.arguments);
        }
        ts.forEachChild(n, visit);
    };
    visit(scope);
    return out;
}

function attrValueOf(tag: ts.JsxOpeningElement | ts.JsxSelfClosingElement, name: string): ts.Expression | undefined {
    const a = tag.attributes.properties.find((p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name);
    return a?.initializer && ts.isJsxExpression(a.initializer) ? a.initializer.expression : undefined;
}

function isHocCall(call: ts.CallExpression): boolean {
    const t = call.expression.getText();
    return (/(^|\.)(memo|forwardRef|connect|injectIntl|withRouter|observer)$/).test(t) || ts.isCallExpression(call.expression);
}

/** The string literals of a literal union type (undefined/null members ignored), or null. */
export function stringLiteralsOf(t: ts.Type): string[] | null {
    if (t.isStringLiteral()) {
        return [t.value];
    }
    if (t.isUnion() && t.types.every((m) => m.isStringLiteral() || (m.flags & (ts.TypeFlags.Undefined | ts.TypeFlags.Null)))) {
        const ls = t.types.filter((m): m is ts.StringLiteralType => m.isStringLiteral()).map((m) => m.value);
        return ls.length ? ls : null;
    }
    return null;
}

function joinParts(px: Part[], py: Part[]): Part[] {
    const parts: Part[] = [];
    for (const p of [...px, ...py]) {
        const last = parts[parts.length - 1];
        if (typeof p === 'string' && typeof last === 'string') {
            parts[parts.length - 1] = last + p;
        } else if (p !== '') {
            parts.push(p);
        }
    }
    return parts;
}

function longer(a: Loc[] | undefined, b: Loc[] | undefined): Loc[] | undefined {
    if (!a?.length) {
        return b?.length ? b : undefined;
    }
    return b && b.length > a.length ? b : a;
}

function partsOf(v: Value): Part[] {
    if (v.k === 'lit') {
        return [v.s];
    }
    return v.k === 'pat' ? v.parts : [];
}

/**
 * Cartesian concatenation; provenance of both sides is kept (left first). Past the cap the rest are left out, and a
 * `too-many-values` value stands for them.
 */
export function concat(a: Value[], b: Value[]): Value[] {
    const out: Value[] = [];

    // a side with a single value makes this linear; only true cross products are bounded tightly
    const cap = a.length === 1 || b.length === 1 ? MAX_USAGE_VALUES : MAX_VALUES;
    for (const x of a) {
        for (const y of b) {
            if (x.k !== 'lit' && x.k !== 'pat') {
                out.push(x);
                continue;
            }
            if (y.k !== 'lit' && y.k !== 'pat') {
                out.push(y);
                continue;
            }

            // both sides came through usages: only the same instance's values combine
            if (x.via?.length && y.via?.length && !prefixCompatible(x.via, y.via)) {
                continue;
            }

            // opposite arms of one condition never render together
            const arms = mergeArms(x.arms, y.arms);
            if (arms === false) {
                continue;
            }
            const parts = joinParts(partsOf(x), partsOf(y));
            const via = longer(x.via, y.via);
            const v: Value = parts.every((p) => typeof p === 'string') ? lit((parts as string[]).join(''), via) : {k: 'pat', parts, ...(via ? {via} : {})};

            // a recursive component's own prop stays marked through what's built from it
            if (v.k === 'pat' && ((x.k === 'pat' && x.recursive) || (y.k === 'pat' && y.recursive))) {
                v.recursive = true;
            }
            if (arms) {
                v.arms = arms;
            }
            out.push(v);
            if (out.length > cap) {
                out.push(truncated());
                return out;
            }
        }
    }
    return out;
}

/** A value as a template string, with each gap written `{key}`. */
export function templateOf(v: Value): string | null {
    if (v.k === 'lit') {
        return v.s;
    }
    if (v.k === 'pat') {
        return v.parts.map((p) => (typeof p === 'string' ? p : '{key}')).join('');
    }
    return null;
}

export function gapsOf(v: Value): Gap[] {
    return v.k === 'pat' ? v.parts.filter((p): p is {gap: Gap} => typeof p !== 'string').map((p) => p.gap) : [];
}

/** `PluginTestKey` from `@mattermost/shared/utils/test_id`: a plugin id normalized for a testid key. */
export const PLUGIN_KEY_TYPE = 'PluginTestKey';

function isPluginKey(t: ts.Type | null): boolean {
    return t?.aliasSymbol?.getName() === PLUGIN_KEY_TYPE;
}

/** The interface or type alias a property is declared in (`type FileInfo = {id: string}` -> `FileInfo`). */
function namedTypeOf(d: ts.Declaration): {name: string; decl: ts.Declaration} | null {
    const parent = d.parent;
    if (ts.isInterfaceDeclaration(parent)) {
        return {name: parent.name.text, decl: parent};
    }
    if (ts.isTypeLiteralNode(parent) && ts.isTypeAliasDeclaration(parent.parent)) {
        return {name: parent.parent.name.text, decl: parent.parent};
    }
    return null;
}

function withArm(vals: Value[], arm: {key: string; negate: boolean} | null, when: boolean): Value[] {
    if (!arm) {
        return vals;
    }
    const a: Arm = {key: arm.key, when: when !== arm.negate};
    return vals.map((v) => {
        const merged = mergeArms(v.arms, [a]);
        return merged ? {...v, arms: merged} as Value : v;
    });
}

/** The arms of both sides, or false when one condition is taken both ways. */
function mergeArms(a: Arm[] | undefined, b: Arm[] | undefined): Arm[] | undefined | false {
    if (!a?.length) {
        return b?.length ? b : undefined;
    }
    if (!b?.length) {
        return a;
    }
    const out = [...a];
    for (const y of b) {
        const x = out.find((o) => o.key === y.key);
        if (!x) {
            out.push(y);
        } else if (x.when !== y.when) {
            return false;
        }
    }
    return out;
}

function enclosingFunction(n: ts.Node): ts.Node | null {
    for (let p = n.parent; p; p = p.parent) {
        if (isFunctionLike(p)) {
            return p;
        }
    }
    return null;
}

/** Values in either list, each once (by value and usage chain). */
function union(a: Value[], b: Value[]): Value[] {
    const seen = new Set<string>();
    const out: Value[] = [];
    for (const v of [...a, ...b]) {
        const k = JSON.stringify(v);
        if (!seen.has(k)) {
            seen.add(k);
            out.push(v);
        }
    }
    return out;
}

/** A value with the empty string taken out of its set-typed gaps (`a || 'fallback'`: '' takes the fallback). */
function withoutEmptyMember(v: Value): Value {
    if (v.k !== 'pat') {
        return v;
    }
    const parts = v.parts.map((p): Part => {
        if (typeof p === 'string' || p.gap.kind !== 'set' || !p.gap.values?.includes('')) {
            return p;
        }
        const values = p.gap.values.filter((x) => x !== '');
        return {gap: {...p.gap, values, type: values.map((x) => JSON.stringify(x)).join(' | ')}};
    });
    return {...v, parts};
}

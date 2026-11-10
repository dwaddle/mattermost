// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- this module writes TypeScript that uses template literals */

import type {ClassModel, Model, ScopeNode} from './model.ts';
import {camel, memberName, pageGetter, pascal, propKey, roleWord, splitAtKey} from './names.ts';

import {cmp} from '../compare.ts';
import {isGrammarError, KEY_PLACEHOLDER, parseTestId, type ParsedTestId} from '../grammar.ts';
import type {Diagnostic, Element, KeyInfo, Manifest, Page} from '../manifest_types.ts';
import {driverFor, ROLE_TABLE} from '../role_table.ts';

/** What every generated file shares: its header, and the module specifier it imports the runtime by. */
export type Output = {header: string; runtime: string};

/** Imports a generated file needs, collected while emitting. */
export class Imports {
    readonly classes = new Map<string, string>();
    readonly types = new Map<string, Set<string>>();
    aria = new Set<string>();
    ariaTypes = new Set<string>();
    api = false;
    sets = new Set<string>();
    locator = false;
    page = false;

    /** The module specifier the runtime (`Scope`, `drivers`) is imported from (`runtimeImport()`). */
    readonly runtime: string;

    constructor(runtime: string) {
        this.runtime = runtime;
    }

    useClass(cls: ClassModel, from: string) {
        if (cls.file !== from) {
            this.classes.set(cls.name, cls.file);
        }
    }

    useType(name: string, module: string) {
        const s = this.types.get(module) ?? new Set<string>();
        s.add(name);
        this.types.set(module, s);
    }

    render(): string {
        const lines: string[] = [];
        const pw = [...(this.page ? ['Page'] : []), ...(this.locator ? ['Locator'] : [])].sort();
        if (pw.length) {
            lines.push(`import type {${pw.join(', ')}} from '@playwright/test';`);
        }
        for (const [module, names] of [...this.types.entries()].sort((a, b) => cmp(a[0], b[0]))) {
            lines.push(`import type {${[...names].sort().join(', ')}} from '${module}';`);
        }
        if (pw.length || this.types.size) {
            lines.push('');
        }
        if (this.ariaTypes.size) {
            lines.push(`import type {${[...this.ariaTypes].sort().join(', ')}} from '${this.runtime}';`);
        }
        lines.push(`import {${[...this.aria].sort().join(', ')}} from '${this.runtime}';`);
        lines.push('');
        if (this.api) {
            lines.push("import {Api} from './api';");
        }
        const byFile = new Map<string, string[]>();
        for (const [name, file] of this.classes) {
            byFile.set(file, [...(byFile.get(file) ?? []), name]);
        }
        for (const [file, names] of [...byFile.entries()].sort((a, b) => cmp(a[0], b[0]))) {
            lines.push(`import {${names.sort().join(', ')}} from './${file}';`);
        }
        if (this.sets.size) {
            lines.push(`import type {${[...this.sets].sort().join(', ')}} from './sets';`);
        }
        return lines.join('\n') + '\n';
    }
}

type Ctx = {model: Model; manifest: Manifest; diagnostics: Diagnostic[]; file: string; imports: Imports; variants?: Map<string, Variant[]>};

/**
 * A shared modal as one opener opens it: its dialogProps callbacks are that opener's, so its elements fire
 * only those of the requests openers pass (`bookmark_modal` from Edit sends the update, never the create).
 */
export type Variant = {name: string; base: ClassModel; ops: string[]; dialog: Set<string>; openers: string[]};

const opsKey = (ops: string[]) => ops.join(',');

/** The same part of a shared class at each scope the class is mounted at (just `e` for a class of one scope). */
function atMounts(node: ScopeNode, e: Element): Element[] {
    const cls = node.cls;
    if (!cls?.shared) {
        return [e];
    }
    const rel = e.template.slice(node.path.join('.').length);
    const found = cls.mounts.map((n) => [...n.members, ...(n.item ? [n.item] : [])].find((x) => x.template.slice(n.path.join('.').length) === rel));
    return [...new Set([e, ...found.filter((x): x is Element => Boolean(x) && x!.template !== e.template)])];
}

/**
 * A part of a shared class keyed by a different named set at each mount (a menu whose actions differ where it's
 * used): the key is any of them, so the method takes their union.
 */
function sharedKeySets(ctx: Ctx, node: ScopeNode, e: Element, p: string): {kp: KeyParam; values: string[]} | null {
    const keys = atMounts(node, e).map((x) => x.key);
    if (keys.length < 2 || !keys.every((k) => k?.kind === 'set' && k.set && k.values)) {
        return null;
    }
    const sets = [...new Set(keys.map((k) => k!.set!))].sort(cmp);
    if (sets.length < 2) {
        return null;
    }
    sets.forEach((x) => ctx.imports.sets.add(x));
    const values = [...new Set(keys.flatMap((k) => k!.values!))].sort(cmp);
    return {kp: {decl: `${p}: ${sets.join(' | ')}`, expr: () => p}, values};
}

/** What acting on an element fires: for a part of a shared class, at any of its mounts. */
function opsOf(node: ScopeNode, e: Element): string[] {
    return [...new Set(atMounts(node, e).flatMap((x) => x.effects?.ops ?? []))].sort();
}

/** What an element of a modal fires when an opener passing `ops` opened it (`dialog`: what any opener passes). */
function narrowed(node: ScopeNode, e: Element, v: {ops: string[]; dialog: Set<string>}): string[] {
    return opsOf(node, e).filter((o) => !v.dialog.has(o) || v.ops.includes(o));
}

/**
 * A variant's name: by what its callbacks send when that is short (`BookmarkModalForCreateChannelBookmark`), else by the
 * element that opens it (`DateTimePickerModalFromCustomTime`), since a list of thirty requests names nothing.
 */
function variantName(base: string, ops: string[], openers: string[], used: Set<string>): string {
    const opener = openers.map((t) => parseTestId(t)).find((p): p is ParsedTestId => !isGrammarError(p));
    let name = ops.length <= 3 || !opener ? `${base}For${ops.join('And')}` : `${base}From${pascal(opener.name)}`;
    for (let i = 2; used.has(name); i++) {
        name = `${name.replace(/\d+$/, '')}${i}`;
    }
    used.add(name);
    return name;
}

/** The modal classes whose openers pass different callbacks, by class name: one variant per distinct set. */
export function modalVariants(manifest: Manifest, model: Model): Map<string, Variant[]> {
    const byClass = new Map<string, {cls: ClassModel; dialog: Set<string>; sets: Map<string, {ops: string[]; openers: string[]}>}>();
    for (const e of manifest.elements) {
        for (const o of e.opens ?? []) {
            const n = o.scope ? model.byScope.get(o.scope) : undefined;
            const cls = n && n.cls && !n.item ? n.cls : null;
            if (!o.dialogOps?.length || !cls) {
                continue;
            }
            const entry = byClass.get(cls.name) ?? {cls, dialog: new Set<string>(), sets: new Map()};
            o.dialogOps.forEach((op) => entry.dialog.add(op));
            const s = entry.sets.get(opsKey(o.dialogOps)) ?? {ops: o.dialogOps, openers: []};
            s.openers.push(e.template);
            entry.sets.set(opsKey(o.dialogOps), s);
            byClass.set(cls.name, entry);
        }
    }
    const out = new Map<string, Variant[]>();
    for (const [name, {cls, dialog, sets}] of [...byClass].sort((a, b) => cmp(a[0], b[0]))) {
        const used = new Set<string>();
        const variants = [...sets.values()].sort((a, b) => cmp(opsKey(a.ops), opsKey(b.ops))).map((s) => {
            const openers = s.openers.sort();
            return {name: variantName(name, s.ops, openers, used), base: cls, ops: s.ops, dialog, openers};
        });

        // a variant only when it narrows something the modal renders
        const useful = variants.filter((v) => cls.node.members.some((e) => narrowed(cls.node, e, v).length !== opsOf(cls.node, e).length));
        if (useful.length) {
            out.set(name, useful);
        }
    }
    return out;
}

/** The elements of a modal some variant narrows. */
function varying(ctx: Ctx, cls: ClassModel): Set<Element> {
    const vs = ctx.variants?.get(cls.name) ?? [];
    return new Set(cls.node.members.filter((e) => vs.some((v) => narrowed(cls.node, e, v).length !== opsOf(cls.node, e).length)));
}

/** The testid of an element relative to its class: `${this.scope}.save--button`, or a literal in the App root. */
function testIdExpr(node: ScopeNode, template: string, keyExpr?: string): string {
    const base = node.path.join('.');
    let rel = base ? template.slice(base.length) : template;
    if (keyExpr && rel.includes(KEY_PLACEHOLDER)) {
        const [before, after] = splitAtKey(rel);
        rel = before + '${' + keyExpr + '}' + after;
    }
    if (base) {
        return '`${this.scope}' + rel.replace(/`/g, '\\`') + '`';
    }
    return keyExpr ? '`' + rel + '`' : `'${rel}'`;
}

/** Where an element comes from, for a doc comment: `PostComponent (channels/src/…/post_component.tsx)`. */
export function sourceText(ref: string): string {
    const [file, name] = ref.split('#');
    return name ? `${name} (${file})` : file;
}

/**
 * An element's doc comment: where it comes from, when it renders (up to three conditions, on one line), what it opens,
 * and, when its handler calls through data, that `settle` needs a `wait`. What it fires is the `effects` list itself.
 */
function doc(e: Element, extra: string[] = []): string {
    const lines = [`\`${e.template}\` — ${sourceText(e.component.at)}`];
    const conditions = [...new Set((e.renderedWhen ?? []).map((c) => (c.explained.length > 110 ? c.explained.slice(0, 109) + '…' : c.explained)))].slice(0, 3);
    if (conditions.length) {
        lines.push(`Renders only when ${conditions.join(' and ').replace(/\*\//g, '*\\/')}.`);
    }
    lines.push(...extra);
    if (e.effects?.unknown) {
        lines.push('Calls through data (registries, plugin hooks): pass `wait` to settle.');
    }
    return `/**\n${lines.map((l) => ` * ${l}`).join('\n')}\n */`;
}

/**
 * `effects` lists what acting on the element fires. A modal element that fires different requests per opener
 * (`widen`) types them as an array, so a variant (`BookmarkModalForUpdateChannelBookmark`) can narrow it.
 */
function meta(ctx: Ctx, node: ScopeNode, e: Element, testId: string, opts: {ops?: string[]; widen?: boolean} = {}): string {
    const ops = opts.ops ?? opsOf(node, e);
    if (ops.length) {
        ctx.imports.api = true;
    }
    const list = `[${ops.map((o) => `Api.${o}`).join(', ')}]`;
    const effects = opts.widen ? `${list} as ReadonlyArray<${ops.map((o) => `typeof Api.${o}`).join(' | ')}>` : list;
    return `{testId: ${testId}, role: ${e.role ? `'${e.role}'` : 'null'}, effects: ${effects}, unknownEffects: ${Boolean(e.effects?.unknown)}, source: '${e.component.at}'}`;
}

/** The class a testid scope is generated as, if the scope has one. */
function classForScope(ctx: Ctx, scope: string | undefined): ClassModel | null {
    if (!scope) {
        return null;
    }
    const n = ctx.model.byScope.get(scope);
    return n && n.cls && !n.item ? n.cls : null;
}

type KeyParam = {decl: string; expr: (p: string) => string};

function keyParam(ctx: Ctx, k: KeyInfo | undefined, name: string): KeyParam {
    const p = camel(name) || 'key';
    if (!k) {
        return {decl: `${p}: string`, expr: () => p};
    }
    if (k.kind === 'entity' && k.entity && k.field) {
        if (k.module) {
            ctx.imports.useType(k.entity, k.module);
            return {decl: `${p}: Pick<${k.entity}, '${k.field}'>`, expr: () => `${p}.${k.field}`};
        }
        return {decl: `${p}: {${k.field}: string}`, expr: () => `${p}.${k.field}`};
    }
    if (k.kind === 'set' && k.set) {
        ctx.imports.sets.add(k.set);
        return {decl: `${p}: ${k.set}`, expr: () => p};
    }

    // known values plus runtime ones (plugin tabs): the known ones autocomplete, any string is accepted
    if (k.kind === 'string' && k.set) {
        ctx.imports.sets.add(k.set);
        return {decl: `${p}: ${k.set} | (string & {})`, expr: () => p};
    }
    if (k.kind === 'number') {
        return {decl: `${p}: number`, expr: () => p};
    }

    // a host plugin slot: keys of the installed plugin test packages
    if (k.kind === 'plugin') {
        // (`never` until a plugin test package adds a key: widen inside, so the body still compiles)
        ctx.imports.ariaTypes.add('PluginKey');
        return {decl: `${p}: PluginKey`, expr: () => `(${p} as string)`};
    }

    // a System Console setting: the config path, turned into its testid key at runtime
    // an autocomplete suggestion: the term (a username, a channel name), turned into its testid key at runtime
    if (k.kind === 'suggestion') {
        ctx.imports.aria.add('suggestionTestKey');
        return {decl: `${p}: string`, expr: () => `suggestionTestKey(${p})`};
    }

    // a text key (an option's name): the text, turned into its testid key at runtime
    if (k.kind === 'text') {
        ctx.imports.aria.add('textTestKey');
        return {decl: `${p}: string`, expr: () => `textTestKey(${p})`};
    }
    if (k.kind === 'setting') {
        ctx.imports.ariaTypes.add('AdminSettingPath');
        ctx.imports.aria.add('settingTestKey');
        return {decl: `${p}: ${k.type}`, expr: () => `settingTestKey(${p})`};
    }
    return {decl: `${p}: string`, expr: () => p};
}

class Members {
    private readonly names = new Map<string, string>();
    readonly out: string[] = [];
    private readonly ctx: Ctx;

    /** The class the members are emitted into (for collision messages). */
    private readonly className: string;

    constructor(ctx: Ctx, className: string) {
        this.ctx = ctx;
        this.className = className;
    }

    has(name: string): boolean {
        return this.names.has(name);
    }

    /** Adds a member unless its name is taken (collisions are errors, never silently renamed). */
    add(name: string, source: string, code: string): boolean {
        const prev = this.names.get(name);
        if (prev) {
            this.ctx.diagnostics.push({rule: 'collisions', severity: 'error', at: source, message: `${this.className}.${name} is generated for both ${prev} and ${source}.`, fix: 'Rename one of the testids.'});
            return false;
        }
        this.names.set(name, source);
        this.out.push(code);
        return true;
    }
}

function verbs(ctx: Ctx, node: ScopeNode, e: Element, getter: string, m: Members) {
    const Name = pascal(e.name) + roleWord(e.role);
    const role = e.role;
    const src = e.component.at;
    if (!role) {
        return;
    }
    if (ROLE_TABLE[role].click) {
        // the menu as a modal in mobile view is the menu's other form, not another destination: the menu stays the return
        const forms = (e.opens ?? []).filter((o) => o.menuForm).map((o) => ({o, cls: classForScope(ctx, o.scope)}));
        const all = (e.opens ?? []).filter((o) => o.kind !== 'page' && !o.menuForm).map((o) => ({o, cls: classForScope(ctx, o.scope)}));
        const targets = all.filter((t) => t.cls);
        const unique = [...new Map(targets.map((t) => [t.o.scope, t])).values()];
        if (unique.length === 1) {
            const {o} = unique[0];
            let cls = unique[0].cls!;

            // the opener passes its own callbacks: the modal as this opener opens it
            // (in a shared class, the same at every mount: one method serves them all)
            const sameEverywhere = atMounts(node, e).every((x) => x.opens?.some((y) => y.scope === o.scope && opsKey(y.dialogOps ?? []) === opsKey(o.dialogOps ?? [])));
            const variant = o.dialogOps && sameEverywhere && ctx.variants?.get(cls.name)?.find((v) => opsKey(v.ops) === opsKey(o.dialogOps!));
            if (variant) {
                cls = {...cls, name: variant.name};
            }
            ctx.imports.useClass(cls, ctx.file);

            // what else the click can open, with no page object yet (a menu's mobile modal, another channel type's
            // dialog): the returned object is the usual case, not the only one
            const others = [...new Set(all.filter((t) => !t.cls).map((t) => t.o.target))];
            const mobile = forms.map((t) => (t.cls ? `${t.o.target} (\`${t.o.scope}\`)` : t.o.target));
            const also = (others.length ? ` It can also open ${others.join(', ')} (no page object).` : '') +
                (mobile.length ? ` In mobile view the menu opens as ${mobile.join(', ')}.` : '');

            // a scope under this one (a menu at `<this>.menu`): relative, when every mount opens its own
            // (`search_box.team_selector` opens `search_box.team_selector.menu`, not the first mount's)
            // or the scope the button is part of (a shared menu whose own button opens it, at each mount)
            const here = node.path.join('.');
            const rest = o.scope === here || o.scope?.startsWith(`${here}.`) ? o.scope.slice(here.length) : null;
            const relative = rest !== null && atMounts(node, e).every((x) => x.opens?.some((y) => y.scope === `${x.scope.join('.')}${rest}`));
            let scopeArg = `'${o.scope}'`;
            if (relative) {
                scopeArg = rest ? `\`\${this.scope}${rest}\`` : 'this.scope';
            }
            m.add(`click${Name}`, src, `/** Clicks ${getter} and returns what it opens (${o.kind}); the page object is returned at once, with no wait.${also} */\nasync click${Name}(): Promise<${cls.name}> {\n    await this.${getter}.click();\n    return new ${cls.name}(this.page, ${scopeArg});\n}`);
        } else if (unique.length > 1) {
            // the click can open more than one dialog (Delete opens the delete dialog, or the burn-on-read one for a
            // burn-on-read post): one page object per dialog, and the test takes the one its case opens
            const here = node.path.join('.');
            const entries = unique.map(({o, cls}) => {
                ctx.imports.useClass(cls!, ctx.file);
                const rest = o.scope?.startsWith(`${here}.`) ? o.scope.slice(here.length) : null;
                const relative = rest !== null && atMounts(node, e).every((x) => x.opens?.some((y) => y.scope === `${x.scope.join('.')}${rest}`));
                const scopeArg = relative ? `\`\${this.scope}${rest}\`` : `'${o.scope}'`;

                // keyed by the dialog's scope, which is unique where one class serves several dialogs
                return {key: camel((o.scope ?? cls!.name).split('.').pop()!), cls: cls!.name, scopeArg};
            });
            const type = entries.map((x) => `${x.key}: ${x.cls}`).join('; ');
            const value = entries.map((x) => `${x.key}: new ${x.cls}(this.page, ${x.scopeArg})`).join(',\n        ');
            const kinds = [...new Set(unique.map((t) => t.o.kind))].join(' or ');
            m.add(`click${Name}`, src, `/** Clicks ${getter}, which opens one of several ${kinds}s depending on the case: a page object for each, returned at once with no wait; use the one this case opens. */\nasync click${Name}(): Promise<{${type}}> {\n    await this.${getter}.click();\n    return {\n        ${value},\n    };\n}`);
        } else if (!all.length && pageTarget(ctx, e)) {
            // a link or a click that navigates to one known page returns it
            const cls = pageTarget(ctx, e)!;
            ctx.imports.classes.set(cls, 'pages');
            m.add(`click${Name}`, src, `/** Clicks ${getter} and returns the page it goes to; the page object is returned at once, with no wait. */\nasync click${Name}(): Promise<${cls}> {\n    await this.${getter}.click();\n    return new ${cls}(this.page);\n}`);
        } else {
            m.add(`click${Name}`, src, `async click${Name}(): Promise<void> {\n    await this.${getter}.click();\n}`);
        }
        return;
    }
    switch (role) {
    case 'togglebutton':
        m.add(`set${Name}`, src, `async set${Name}(on: boolean): Promise<void> {\n    await this.${getter}.press(on);\n}`);
        return;
    case 'switch':
    case 'checkbox':
        m.add(`set${Name}`, src, `async set${Name}(on: boolean): Promise<void> {\n    await this.${getter}.set(on);\n}`);
        return;
    case 'radio':
        m.add(`choose${Name}`, src, `async choose${Name}(): Promise<void> {\n    await this.${getter}.check();\n}`);
        return;
    case 'textbox':
    case 'searchbox':
    case 'spinbutton':
        m.add(`fill${Name}`, src, `async fill${Name}(value: string): Promise<void> {\n    await this.${getter}.fill(value);\n}`);
        return;
    case 'tab':
        m.add(`select${Name}`, src, `async select${Name}(): Promise<void> {\n    await this.${getter}.select();\n}`);
        return;
    case 'combobox':
    case 'listbox':
    case 'radiogroup':
        m.add(`choose${Name}`, src, `async choose${Name}(option: string | RegExp): Promise<void> {\n    await this.${getter}.choose(option);\n}`);
        return;
    case 'text':
        m.add(`get${Name}`, src, `get${Name}(): Promise<string> {\n    return this.${getter}.text();\n}`);
    }
}

/** The one page all of an element's navigations go to (a page class the generator emits). */
function pageTarget(ctx: Ctx, e: Element): string | null {
    if (ctx.manifest.plugin) {
        return null;
    }
    const nav = (e.opens ?? []).filter((o) => o.kind === 'page');
    const known = new Set(ctx.manifest.pages.map((p) => p.class));
    const classes = [...new Set(nav.map((o) => o.page).filter((c): c is string => Boolean(c && known.has(c))))];

    // every navigation must go to that page, always: a click that navigates on one branch only (a reply that
    // opens the thread popout in a popout window and the thread panel otherwise) returns nothing
    if (classes.length !== 1 || nav.some((o) => !o.page || o.conditional)) {
        return null;
    }
    return classes[0];
}

/** A navigation target as the doc shows it: the manifest keeps the whole expression, the doc its first 60 characters. */
function shortTarget(target: string): string {
    return target.length > 60 ? target.slice(0, 59) + '…' : target;
}

function element(ctx: Ctx, node: ScopeNode, e: Element, m: Members, mt: {ops?: string[]; widen?: boolean} = {}) {
    const factory = driverFor(e.role);
    ctx.imports.aria.add('drivers');
    const getter = memberName(camel(e.name) + roleWord(e.role));
    const opensDoc = [...new Set((e.opens ?? []).map((o) => (o.kind === 'page' ? `Goes to ${shortTarget(o.target)}${o.page ? ` (${o.page})` : ''}.` : `Opens ${o.kind} ${o.target}${o.scope ? ` (\`${o.scope}\`)` : ''}.`)))].slice(0, 3);
    if (e.key) {
        const fn = memberName(camel(e.name));
        const shared = sharedKeySets(ctx, node, e, fn);
        const kp = shared?.kp ?? keyParam(ctx, e.key, e.name);
        const id = testIdExpr(node, e.template, kp.expr(fn));
        ctx.imports.locator = true;
        m.add(fn, e.component.at, `${doc(e, opensDoc)}\n${fn}(${kp.decl}) {\n    return drivers.${factory}(this.byTestId(${id}${popupArg(node, e)}), ${meta(ctx, node, e, id, mt)});\n}`);
        addItemsLocator(node, e, m);
        const values = shared?.values ?? ((e.key.kind === 'set' || e.key.kind === 'string') && e.key.set ? e.key.values : undefined);
        if (values) {
            for (const v of values) {
                const g = memberName(camel(v) + roleWord(e.role));
                m.add(g, e.component.at, `get ${g}() {\n    return this.${fn}('${v}');\n}`);
            }
        }
        return;
    }
    const id = testIdExpr(node, e.template);
    m.add(getter, e.component.at, `${doc(e, opensDoc)}\nget ${getter}() {\n    return drivers.${factory}(this.byTestId(${id}${popupArg(node, e)}), ${meta(ctx, node, e, id, mt)});\n}`);
    verbs(ctx, node, e, getter, m);
}

/** A modal variant: the base class with the elements it narrows overridden (they fire only the opener's requests). */
function emitVariant(ctx: Ctx, v: Variant): string {
    const node = v.base.node;
    const vary = varying(ctx, v.base);
    const out: string[] = [];
    for (const e of [...node.members].sort((a, b) => cmp(a.template, b.template)).filter((x) => vary.has(x))) {
        const factory = driverFor(e.role);
        const ops = narrowed(node, e, v);
        const d = `/** \`${e.template}\` opened this way: fires ${ops.length ? ops.join(', ') : 'nothing known'}. */`;
        if (e.key) {
            const kp = keyParam(ctx, e.key, e.name);
            const fn = memberName(camel(e.name));
            const id = testIdExpr(node, e.template, kp.expr(fn));
            out.push(`${d}\noverride ${fn}(${kp.decl}) {\n    return drivers.${factory}(this.byTestId(${id}${popupArg(node, e)}), ${meta(ctx, node, e, id, {ops})});\n}`);
        } else {
            const getter = memberName(camel(e.name) + roleWord(e.role));
            const id = testIdExpr(node, e.template);
            out.push(`${d}\noverride get ${getter}() {\n    return drivers.${factory}(this.byTestId(${id}${popupArg(node, e)}), ${meta(ctx, node, e, id, {ops})});\n}`);
        }
    }
    const openers = v.openers.slice(0, 3).map((t) => `\`${t}\``).join(', ') + (v.openers.length > 3 ? `, and ${v.openers.length - 3} more` : '');
    const body = out.map((c) => c.split('\n').map((l) => (l ? '    ' + l : l)).join('\n')).join('\n\n');
    return `/** ${v.base.name} as ${openers} open${v.openers.length === 1 ? 's' : ''} it: its callbacks send ${v.ops.join(', ')}. */\nexport class ${v.name} extends ${v.base.name} {\n${body}\n}\n`;
}

/**
 * `, true` for an element a popup renders in a portal outside its scope's element, so the generated code finds it
 * from the page (Scope.byTestId's `popup`): a combobox's options, i.e. options whose scope also has the combobox.
 * A listbox's options (a suggestion list's groups) render inside their own scope, and are found there: from the
 * page, one group's keys would also take every other group's.
 */
function popupArg(node: ScopeNode, e: Element): string {
    return e.role === 'option' && node.members.some((m) => m.role === 'combobox') ? ', true' : '';
}

function addItemsLocator(node: ScopeNode, e: Element, m: Members) {
    const base = node.path.join('.');
    const [before, after] = splitAtKey(e.template);
    const prefix = base ? '`${this.scope}' + before.slice(base.length) + '`' : `'${before}'`;
    const name = memberName(camel(e.name) + 'Items');
    m.add(name, e.component.at, `/** Every \`${e.template}\` in the scope. */\nget ${name}(): Locator {\n    return this.byTestIdPattern(${prefix}, '${after}'${popupArg(node, e)});\n}`);
    const keys = memberName(camel(e.name) + 'Keys');
    m.add(keys, e.component.at, `/** The keys of every \`${e.template}\` in the scope, in document order. */\n${keys}(): Promise<string[]> {\n    return this.keysOf(${prefix}, '${after}'${popupArg(node, e)});\n}`);
}

const menuScopesMemo = new WeakMap<Manifest, Set<string>>();

/** The scopes a trigger opens as a menu. */
function menuScopes(manifest: Manifest): Set<string> {
    let out = menuScopesMemo.get(manifest);
    if (!out) {
        out = new Set(manifest.elements.flatMap((e) => (e.opens ?? []).filter((o) => o.kind === 'menu' && o.scope).map((o) => o.scope!)));
        menuScopesMemo.set(manifest, out);
    }
    return out;
}

function childScope(ctx: Ctx, node: ScopeNode, word: string, child: ScopeNode, m: Members) {
    const cls = child.cls;
    if (!cls) {
        return;
    }
    ctx.imports.useClass(cls, ctx.file);
    const base = node.path.join('.');
    const scopeExpr = base ? '`${this.scope}.' + word + '`' : `'${word}'`;
    if (child.item) {
        const e = child.item;
        const kp = keyParam(ctx, e.key, word);
        const fn = memberName(camel(word));
        const id = testIdExpr(node, e.template, kp.expr(fn));
        ctx.imports.locator = true;
        const opensDoc = (e.opens ?? []).map((o) => `Opens ${o.kind} ${shortTarget(o.target)}.`).slice(0, 3);
        m.add(fn, e.component.at, `${doc(e, opensDoc)}\n${fn}(${kp.decl}): ${cls.name} {\n    return new ${cls.name}(this.page, ${scopeExpr}, this.byTestId(${id}${popupArg(node, e)}));\n}`);
        addItemsLocator(node, e, m);
        return;
    }
    const name = memberName(camel(word));
    const src = child.container?.component.at ?? child.path.join('.');
    const d = child.container ? `${doc(child.container)}\n` : '';

    // a menu renders in a portal, outside its trigger's item: found from the page (one menu is open at a time)
    const root = menuScopes(ctx.manifest).has(child.path.join('.')) ? '' : ', this.root';
    m.add(name, src, `${d}get ${name}(): ${cls.name} {\n    return new ${cls.name}(this.page, ${scopeExpr}${root});\n}`);
}

function itemSelf(ctx: Ctx, node: ScopeNode, m: Members) {
    const e = node.item!;
    const factory = driverFor(e.role);
    ctx.imports.aria.add('drivers');
    const getter = memberName(camel(roleWord(e.role) || 'element'));
    m.add(getter, e.component.at, `${doc(e)}\nget ${getter}() {\n    return drivers.${factory}(this.root, ${meta(ctx, node, e, `'${e.template}'`)});\n}`);
    verbs(ctx, node, {...e, name: ''}, getter, m);
    ctx.imports.locator = true;
    m.add('locator', e.component.at, '/** The item\'s element (matchers take the item: `expect(item).toContainMessage(…)`). */\noverride get locator(): Locator {\n    return this.root;\n}');
}

function form(node: ScopeNode, cls: ClassModel, m: Members, extraTypes: string[]) {
    const fill = (e: Element) => (e.role ? ROLE_TABLE[e.role].fill : undefined);
    const read = (e: Element) => (e.role ? ROLE_TABLE[e.role].read : undefined);
    const fields = node.members.filter((e) => e.form && fill(e));
    if (fields.length < 2) {
        return;
    }

    // `FormValues`, not `Values`: a scope named `values` already takes `<Class>Values` for its own class
    const type = `${cls.name}FormValues`;
    const tsType = (e: Element) => (e.form!.valueType === 'boolean' ? 'boolean' : 'string');
    const key = (e: Element) => camel(e.form!.field);

    // a field that renders only under a condition may be absent: optional in the type, and read only when present
    const conditional = (e: Element) => Boolean(e.renderedWhen?.length);
    extraTypes.push(`/** The form fields of \`${node.path.join('.')}\`. */\nexport type ${type} = {\n${fields.map((e) => `    ${propKey(key(e))}${conditional(e) ? '?' : ''}: ${tsType(e)};`).join('\n')}\n};`);
    const getterOf = (e: Element) => memberName(camel(e.name) + roleWord(e.role));
    const fills = fields.map((e) => `    if (values.${key(e)} !== undefined) {\n        await this.${getterOf(e)}.${fill(e)}(values.${key(e)});\n    }`).join('\n');
    m.add('fill', node.path.join('.'), `/** Fills the given fields; others are left as they are. */\nasync fill(values: Partial<${type}>): Promise<void> {\n${fills}\n}`);

    // fields named by role too are alternatives (one renders): there is nothing to read them all from
    const readable = fields.filter(read);
    if (readable.length === fields.length && fields.every((e) => e.form!.field === e.name)) {
        // fields that always render first: their reads wait for the form, so by the time a conditional field is
        // checked (without waiting: it may never render) the form is up
        const ordered = [...readable.filter((e) => !conditional(e)), ...readable.filter(conditional)];
        const local = (e: Element) => `v${key(e).charAt(0).toUpperCase()}${key(e).slice(1)}`;
        const readOf = (e: Element) => (conditional(e) ? `(await this.${getterOf(e)}.locator.count()) ? await this.${getterOf(e)}.${read(e)}() : undefined` : `await this.${getterOf(e)}.${read(e)}()`);
        const reads = ordered.map((e) => `    const ${local(e)} = ${readOf(e)};`).join('\n');
        m.add('read', node.path.join('.'), `/** Reads every field (a field that isn't rendered reads as \`undefined\`). */\nasync read(): Promise<${type}> {\n${reads}\n    return {\n${readable.map((e) => `        ${propKey(key(e))}: ${local(e)},`).join('\n')}\n    };\n}`);
    }
}

/** A repeated item with read-only parts: `read()` returns them typed (`null` where a part isn't rendered). */
function row(node: ScopeNode, cls: ClassModel, m: Members, extraTypes: string[]) {
    const texts = node.members.filter((e) => e.role === 'text' && !e.key).sort((a, b) => cmp(a.name, b.name));
    if (!node.item || !texts.length || m.has('read')) {
        return;
    }
    const type = `${cls.name}Row`;
    const getterOf = (e: Element) => memberName(camel(e.name) + roleWord(e.role));
    extraTypes.push(`/** The read-only parts of a \`${node.path.join('.')}\` item. */\nexport type ${type} = {\n${texts.map((e) => `    ${propKey(camel(e.name))}: string | null;`).join('\n')}\n};`);
    m.add('read', node.path.join('.'), `/** Reads the item's read-only parts (\`null\` where one isn't rendered). */\nasync read(): Promise<${type}> {\n    return {\n${texts.map((e) => `        ${propKey(camel(e.name))}: await this.${getterOf(e)}.textIfPresent(),`).join('\n')}\n    };\n}`);
}

/** Source of one class. */
export function emitClass(ctx: Ctx, cls: ClassModel): {code: string; types: string[]} {
    const node = cls.node;
    const m = new Members(ctx, cls.name);
    const types: string[] = [];
    if (node.item) {
        itemSelf(ctx, node, m);
    } else if (cls.mounts.every((n) => !n.container && !n.item)) {
        // no element carries the scope's own testid, so `locator` would match nothing, and
        // `expect(x.locator).not.toBeVisible()` would pass without testing anything
        ctx.imports.locator = true;
        m.add('locator', node.path.join('.'), '/** This scope renders no element of its own (only its parts have testids): assert on a part. */\noverride get locator(): Locator {\n    throw new Error(`${this.scope} renders no element of its own; assert on one of its parts`);\n}');
    }
    const vary = varying(ctx, cls);
    for (const e of [...node.members].sort((a, b) => cmp(a.template, b.template))) {
        element(ctx, node, e, m, {widen: vary.has(e)});
    }
    for (const [word, child] of [...node.children.entries()].sort((a, b) => cmp(a[0], b[0]))) {
        childScope(ctx, node, word, child, m);
    }
    form(node, cls, m, types);
    row(node, cls, m, types);
    ctx.imports.aria.add('Scope');
    const scopes = cls.mounts.map((n) => `\`${n.path.join('.')}\``).join(', ');
    const what = cls.shared ? `Rendered at ${scopes}: one class, constructed with the scope it is mounted at.` : `Scope ${scopes}.`;
    const ctor = cls.shared ? '' : `\n    constructor(page: Page, scope = '${node.path.join('.')}', root?: Locator) {\n        super(page, scope, root);\n    }\n`;
    if (!cls.shared) {
        ctx.imports.locator = true;
        ctx.imports.page = true;
    }
    const body = m.out.map((c) => c.split('\n').map((l) => (l ? '    ' + l : l)).join('\n')).join('\n\n');
    const variants = (ctx.variants?.get(cls.name) ?? []).map((v) => emitVariant(ctx, v));
    return {code: [`/** ${what} */\nexport class ${cls.name} extends Scope {${ctor}\n${body}\n}\n`, ...variants].join('\n'), types};
}

/** The App root: top-level scopes, plus elements whose testid is a bare scope word. */
export function emitApp(ctx: Ctx, model: Model, pages: Page[]): string {
    const root = model.root;
    const m = new Members(ctx, 'App');
    for (const [word, child] of [...root.children.entries()].sort((a, b) => cmp(a[0], b[0]))) {
        childScope(ctx, root, word, child, m);
    }
    for (const page of pages) {
        const getter = pageGetter(page.class);
        if (m.add(getter, page.path, `/** \`${page.path}\` */\nget ${getter}(): ${page.class} {\n    return new ${page.class}(this.page);\n}`)) {
            ctx.imports.classes.set(page.class, 'pages');
        }
    }
    ctx.imports.aria.add('Scope');
    ctx.imports.page = true;
    m.add('plugins', 'plugins', '/** Surfaces of installed plugin test packages (see `Plugins`). */\nget plugins(): Plugins {\n    return pluginSurfaces(this.page) as Plugins;\n}');
    ctx.imports.aria.add('pluginSurfaces');
    const body = m.out.map((c) => c.split('\n').map((l) => (l ? '    ' + l : l)).join('\n')).join('\n\n');
    return `/**
 * Plugin test packages add their page objects here by declaration merging (types only):
 *
 *     declare module '@mattermost/playwright-lib' {
 *         interface Plugins {
 *             comMattermostCalls: ComMattermostCalls;
 *         }
 *     }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface Plugins {}

/** The webapp, as generated from its testids: \`new App(page).channelHeader.clickOpenMenuButton()\`. */
export class App extends Scope {
    constructor(page: Page) {
        super(page, '');
    }

${body}
}
`;
}

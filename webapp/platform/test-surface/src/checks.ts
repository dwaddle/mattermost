// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import ts from 'typescript';

import {cmp} from './compare.ts';
import type {AllowEntry, PluginConfig} from './config.ts';
import {isGrammarError, toWord} from './grammar.ts';
import type {Diagnostic, Element, Loc, Manifest} from './manifest_types.ts';
import {isUnscoped, readHostSlots, type Emission, type ScanResult, type Site} from './scan.ts';
import {MAX_VALUES, templateOf, TOO_MANY_VALUES} from './values.ts';

export type CheckOptions = {

    /** Template prefixes where grammar diagnostics are errors (the pilot slice). Elsewhere they are warnings. */
    strictScopes: string[];

    /** Files (repo-relative prefixes) where legacy testids are errors. */
    strictPaths: string[];

    /** Open-string keys are errors instead of warnings. */
    strictKeys: boolean;

    /** Reviewed exceptions: a rule's error on one testid becomes a warning that carries the reason. */
    allow?: AllowEntry[];

    /** Plugin mode: the plugin's key and the host versions it supports. */
    plugin?: PluginConfig | null;
};

const ROLE_EQUIV: Record<string, string[]> = {
    button: ['button'],
    togglebutton: ['togglebutton', 'button'],
    link: ['link'],
    textbox: ['textbox', 'searchbox'],
    searchbox: ['searchbox', 'textbox'],
    menuitem: ['menuitem', 'menuitemcheckbox', 'menuitemradio'],
};

const NON_INTERACTIVE = new Set([null, 'none', 'presentation', 'text', 'img', 'list', 'listitem', 'heading', 'grid', 'table', 'cell', 'columnheader', 'row', 'gridcell', 'status', 'alert', 'tooltip', 'separator', 'region', 'form', 'navigation', 'dialog', 'alertdialog', 'menu', 'tabpanel', 'progressbar', 'main', 'banner', 'complementary', 'contentinfo', 'log', 'feed', 'group', 'article']);

/** Runs every check over a scan and appends diagnostics to the manifest. Returns them sorted. */
export function runChecks(result: ScanResult, opts: CheckOptions): Diagnostic[] {
    const out: Diagnostic[] = [...result.manifest.diagnostics];
    const strictAt = (at: Loc, template?: string) => opts.strictPaths.some((p) => at.startsWith(p)) || (template !== undefined && opts.strictScopes.some((s) => template.startsWith(s)));
    const push = (rule: string, strict: boolean, at: Loc, message: string, fix?: string) => {
        out.push({rule, severity: strict ? 'error' : 'warning', at, message, ...(fix ? {fix} : {})});
    };

    checkSites(result.sites, push, strictAt);
    checkEmissions(result.emissions, push, strictAt, opts);
    checkDuplicates(result.emissions, push, strictAt, result.usageNodeAt);
    checkPluginSlots(result.manifest, push);
    for (const el of result.manifest.elements) {
        if (el.unreachable) {
            push('unreachable', strictAt(el.component.at, el.template), el.component.at, `"${el.template}" is in code the app never loads: no file on its path is imported from the entries (dead code, or used only by tests).`, 'Delete the code, or render it from the app.');
        }
    }
    if (opts.plugin) {
        checkPlugin(result.manifest, push, strictAt, opts.plugin);
    }
    applyAllow(out, opts.allow ?? []);

    const seen = new Set<string>();
    return out.
        filter((d) => {
            const k = `${d.at}|${d.rule}|${d.message}`;
            if (seen.has(k)) {
                return false;
            }
            seen.add(k);
            return true;
        }).
        sort((a, b) => cmp(a.at, b.at) || cmp(a.rule, b.rule) || cmp(a.message, b.message));
}

type Push = (rule: string, strict: boolean, at: Loc, message: string, fix?: string) => void;

/** `checks.allow`: matching errors become warnings with the reason; an entry that matches nothing is reported, so the list can't go stale. */
function applyAllow(out: Diagnostic[], allow: AllowEntry[]) {
    for (const a of allow) {
        let used = false;
        for (const d of out) {
            // a keyed template also covers its per-value variants (`"settings.section:{key}=email"`), and a
            // template starting with `*.` covers it under any scope (a shared component's part in every location)
            const matches = a.template.startsWith('*.') ? new RegExp(`"[^"]*${escapeRegExp(a.template.slice(1))}(=[^"]*)?"`).test(d.message) : d.message.includes(`"${a.template}"`) || d.message.includes(`"${a.template}=`);
            if (d.rule === a.rule && matches) {
                used = true;
                if (d.severity === 'error') {
                    d.severity = 'warning';
                    d.message += ` Allowed: ${a.reason}`;
                }
            }
        }
        if (!used) {
            out.push({rule: 'allow', severity: 'warning', at: 'test-surface.config.json', message: `checks.allow entry for "${a.template}" (${a.rule}) no longer matches anything.`, fix: 'Remove it.'});
        }
    }
}

/** The published plugin slot contract and what the webapp renders agree, both ways (always errors: plugins depend on it). */
/** Whether a slot's template (`*.` for any scope) names a rendered template. */
export function slotMatches(slotTemplate: string, template: string): boolean {
    return slotTemplate.startsWith('*.') ? template.endsWith(slotTemplate.slice(1)) : template === slotTemplate;
}

function checkPluginSlots(manifest: Manifest, push: Push) {
    if (!manifest.pluginSlots.length) {
        return;
    }
    for (const s of manifest.pluginSlots) {
        const rendered = manifest.elements.filter((e) => slotMatches(s.template, e.template));
        if (!rendered.length) {
            push('plugin-slots', true, s.at, `Plugin slot "${s.slot}" (${s.template}) is in the published contract, but the webapp no longer renders it.`, 'Render the slot\'s testid again, or remove it from the contract (a breaking change for plugin test packages).');
        }
        for (const e of rendered) {
            if (e.key?.kind !== 'plugin') {
                push('plugin-slots', true, e.component.at, `Plugin slot "${s.slot}" (${e.template}) must be keyed by pluginTestKey(pluginId), but its key is ${e.key ? `a ${e.key.kind} (${e.key.type})` : 'missing'}.`, 'Render the key with pluginTestKey() from @mattermost/shared/utils/test_id.');
            }
        }
    }
    for (const e of manifest.elements) {
        if (e.key?.kind === 'plugin' && !manifest.pluginSlots.some((s) => slotMatches(s.template, e.template))) {
            push('plugin-slots', true, e.component.at, `"${e.template}" is keyed by plugin but isn't in the published plugin slot contract.`, 'Add it to PLUGIN_SLOT_TEST_IDS in @mattermost/shared/utils/test_id.');
        }
    }
}

/**
 * Plugin mode: the plugin's testids live under `plugins.<key>` (host slots carry the host's testids), and
 * every host version it supports still renders the slots its registry calls fill (always errors).
 */
function checkPlugin(manifest: Manifest, push: Push, strictAt: (at: Loc, t?: string) => boolean, plugin: PluginConfig) {
    const scope = `plugins.${plugin.key}`;
    for (const e of manifest.elements) {
        if (e.grammar && e.template !== scope && !e.template.startsWith(scope + '.')) {
            push('plugin-scope', strictAt(e.component.at, e.template), e.component.at, `"${e.template}" is outside the plugin's scope "${scope}".`, `Prefix it: "${scope}.${e.template}".`);
        }
    }
    for (const host of plugin.hosts) {
        const read = readHostSlots(host.appMap);
        if ('diagnostic' in read) {
            push('input', true, read.diagnostic.at, read.diagnostic.message, read.diagnostic.fix);
            continue;
        }
        const slots = new Set(read.slots.map((s) => s.slot));
        if (!slots.size) {
            push('plugin-compat', true, 'test-surface.config.json', `Host ${host.name}: no plugin slots in ${host.appMap}.`, 'Point plugin.hosts at the app-map.json the host version\'s generated page objects ship.');
            continue;
        }
        for (const used of manifest.plugin?.slotsUsed ?? []) {
            for (const slot of used.slots.filter((x) => !slots.has(x))) {
                push('plugin-compat', true, used.at, `${used.method}() fills the "${slot}" slot, which host ${host.name} doesn't render.`, `Drop ${host.name} from the supported hosts (raise min_server_version), or stop relying on the slot there.`);
            }
        }
    }
}

function checkSites(sites: Site[], push: Push, strictAt: (at: Loc, t?: string) => boolean) {
    for (const s of sites) {
        if (s.forwarded) {
            continue;
        }
        const shown = s.values.map(templateOf).find((t): t is string => t !== null) ?? s.expr?.getText() ?? '';
        for (const v of s.values) {
            const via = v.via?.length ? ` (via ${v.via[0]})` : '';
            if (v.k === 'unres' && v.why === TOO_MANY_VALUES) {
                // eslint-disable-next-line no-template-curly-in-string
                push('truncated', strictAt(s.at), s.at, `"${shown}" can take more than ${MAX_VALUES} values${via}; the rest are left out (${v.at}).`, 'Key the testid by one value (`:${id}`) instead of a product of lists, or split it into separate testids.');
            } else if (v.k === 'unres' || v.k === 'computed') {
                // eslint-disable-next-line no-template-curly-in-string
                push('unresolved', false, s.at, `testid value can't be read statically${via}: ${v.k === 'unres' ? v.why : 'computed'} at ${v.at}.`, 'Build the testid from literals and `:${key}` data, or pass a literal down.');
            } else if (isUnscoped(v)) {
                // eslint-disable-next-line no-template-curly-in-string
                push('unscoped', strictAt(s.at), s.at, `testid is made entirely of runtime data${via}.`, 'Write the scope and name as literals; runtime data may only fill the key: `scope.name:${value}`.');
            }
        }
    }
}

function checkEmissions(emissions: Emission[], push: Push, strictAt: (at: Loc, t?: string) => boolean, opts: CheckOptions) {
    for (const e of emissions) {
        const at = e.site.at;
        const strict = strictAt(at, e.template);
        if (isUnscoped(e.value)) {
            continue;
        }
        if ((/(^|[^A-Za-z])undefined([^A-Za-z]|$)/).test(e.template)) {
            push('undefined', strict, at, `"${e.template}" can render the text "undefined"${e.via.length ? ` (via ${e.via[0]})` : ''}.`, 'Make sure the value is always set, or render no testid when it is missing.');
        }
        if (isGrammarError(e.parsed)) {
            const suggestion = suggest(e.template, e.landing.aria.role);
            push(e.parsed.rule, strict, at, e.parsed.message, e.parsed.fix + (suggestion ? ` Suggested: "${suggestion}".` : ''));
            continue;
        }
        const role = e.landing.aria.role;
        const suffix = e.parsed.role;
        if (suffix && role && !fits(suffix, role)) {
            push('role-fit', strict, at, `"${e.template}" is on a${role ? ` ${role}` : 'n element with no role'} (<${tagText(e)}>).`, `Use --${roleSuffixFor(role) ?? 'text'}, or render an element with role ${suffix}.`);
        } else if (!suffix && role && !NON_INTERACTIVE.has(role)) {
            push('role-fit', strict, at, `"${e.template}" has no role suffix but is a ${role}.`, `Add --${roleSuffixFor(role) ?? role}.`);
        } else if (suffix && suffix !== 'text' && !role && e.landing.tag) {
            push('role-fit', strict, at, `"${e.template}" is on a <${tagText(e)}> with no ARIA role.`, `Render a native ${suffix} or add role='${suffix}' (and its state attributes); for read-only content use --text.`);
        }
        if (e.landing.interactive && !role) {
            push('aria', strict, at, `<${tagText(e)}> with testid "${e.template}" handles input but has no ARIA role.`, 'Render a native control (button, a[href], input) or add role= with its state attributes.');
        }
        for (const g of (e.value.k === 'pat' ? e.value.parts : [])) {
            if (typeof g !== 'string' && g.gap.kind === 'string') {
                push('key-origin', opts.strictKeys && strict, at, `key of "${e.template}" is an open string (${g.gap.expr}: ${g.gap.type}).`, 'Key from a fixed set (literal union / as const), an entity field (channel.name), or type it.');
            }
        }
    }
}

function tagText(e: Emission): string {
    const tag = e.landing.tag ?? e.site.tag;
    return tag ? tag.tagName.getText() : '?';
}

function fits(suffix: string, role: string): boolean {
    if (suffix === role) {
        return true;
    }
    if (suffix === 'text') {
        return NON_INTERACTIVE.has(role);
    }
    return (ROLE_EQUIV[suffix] ?? []).includes(role);
}

function roleSuffixFor(role: string | null): string | null {
    if (!role) {
        return null;
    }
    return role;
}

/** A grammar-conforming suggestion for a legacy testid. */
export function suggest(template: string, role: string | null): string | null {
    const [path] = template.split('{key}');
    const words = path.split(/[.\-:]+|__/).map(toWord).filter(Boolean);
    if (!words.length) {
        return null;
    }
    const hasKey = template.includes('{key}');
    const scope = words.length > 1 ? words.slice(0, -1).join('.') : '<scope>';
    const name = words[words.length - 1];
    const r = role && !NON_INTERACTIVE.has(role) ? `--${role}` : '';
    return `${scope}.${name}${hasKey ? ':{key}' : ''}${r}`;
}

/** Same template from two places: fine in mutually exclusive branches of one component with the same role; otherwise an error. */
/**
 * Two emissions are exclusive when, at the first file their usage chains share, the nodes they render
 * through sit in different branches (`flag ? <A/> : <B/>`, an early return before one of them).
 */
function exclusiveAlongChains(a: Emission, b: Emission, usageNodeAt: (loc: Loc) => ts.Node | undefined): boolean {
    const chain = (e: Emission) => [e.site.node, ...e.via.map(usageNodeAt).filter((n): n is ts.Node => Boolean(n))];
    const ca = chain(a);
    const cb = chain(b);
    for (const x of ca) {
        const y = cb.find((n) => n.getSourceFile() === x.getSourceFile());
        if (y) {
            if (x === y) {
                return false;
            }
            if (exclusive(x, y)) {
                return true;
            }

            // render helpers (`createDMIntro()` in one arm, `createGMIntro()` in another): compare the calls that lead to each, within one function
            const lx = helperCalls(x);
            const ly = helperCalls(y);
            return lx.some((p) => ly.some((q) => p !== q && enclosingFunction(p) === enclosingFunction(q) && exclusive(p, q)));
        }
    }
    return false;
}

function enclosingFunction(n: ts.Node): ts.Node | undefined {
    let p = n.parent;
    while (p && !ts.isFunctionLike(p)) {
        p = p.parent;
    }
    return p;
}

/** The name of a plain render helper declared by `fn` (`function intro()`, `const intro = () =>`, a class method), else undefined. */
function helperName(fn: ts.Node): ts.Identifier | undefined {
    if ((ts.isFunctionDeclaration(fn) || ts.isMethodDeclaration(fn)) && fn.name && ts.isIdentifier(fn.name)) {
        return fn.name;
    }
    if ((ts.isArrowFunction(fn) || ts.isFunctionExpression(fn)) && (ts.isVariableDeclaration(fn.parent) || ts.isPropertyDeclaration(fn.parent)) && ts.isIdentifier(fn.parent.name)) {
        return fn.parent.name;
    }
    return undefined;
}

const referencesByFile = new WeakMap<ts.SourceFile, Map<string, ts.Identifier[]>>();

function referencesTo(name: ts.Identifier): ts.Identifier[] {
    const sf = name.getSourceFile();
    let refs = referencesByFile.get(sf);
    if (!refs) {
        const m = new Map<string, ts.Identifier[]>();
        const v = (n: ts.Node) => {
            if (ts.isIdentifier(n)) {
                m.set(n.text, [...(m.get(n.text) ?? []), n]);
            }
            ts.forEachChild(n, v);
        };
        v(sf);
        refs = m;
        referencesByFile.set(sf, refs);
    }
    return (refs.get(name.text) ?? []).filter((r) => r !== name);
}

/**
 * `n`, then the call that runs the render helper it sits in, and that helper's caller, and so on: only while
 * the helper's one reference in its file is a call (`intro()` / `this.intro()`), so a helper used twice, or
 * passed along, stops the walk.
 */
function helperCalls(n: ts.Node): ts.Node[] {
    const out = [n];
    const seen = new Set<ts.Node>();
    for (let fn = enclosingFunction(n); fn && !seen.has(fn); fn = enclosingFunction(out[out.length - 1])) {
        seen.add(fn);
        const name = helperName(fn);
        const refs = name ? referencesTo(name) : [];
        if (refs.length !== 1) {
            break;
        }
        const ref = refs[0];
        const callee = ts.isPropertyAccessExpression(ref.parent) && ref.parent.name === ref && ref.parent.expression.kind === ts.SyntaxKind.ThisKeyword ? ref.parent : ref;
        if (!ts.isCallExpression(callee.parent) || callee.parent.expression !== callee) {
            break;
        }
        out.push(callee.parent);
    }
    return out;
}

function checkDuplicates(emissions: Emission[], push: Push, strictAt: (at: Loc, t?: string) => boolean, usageNodeAt: (loc: Loc) => ts.Node | undefined) {
    const byKey = new Map<string, Emission[]>();
    for (const e of emissions) {
        if (e.value.k !== 'lit' && e.key === null) {
            continue;
        }
        const k = e.key === null ? e.template : `${e.template}=${e.key}`;
        byKey.set(k, [...(byKey.get(k) ?? []), e]);
    }
    for (const [k, list] of byKey) {
        const nodes = [...new Map(list.map((e) => [e.site.node, e])).values()];
        if (nodes.length < 2) {
            continue;
        }
        const grammar = !isGrammarError(nodes[0].parsed);
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i];
                const b = nodes[j];
                const sameFile = a.site.node.getSourceFile() === b.site.node.getSourceFile();
                if (exclusiveAlongChains(a, b, usageNodeAt)) {
                    if (a.landing.tag && b.landing.tag && a.landing.aria.role !== b.landing.aria.role && grammar) {
                        push('duplicates', strictAt(a.site.at, k) || strictAt(b.site.at, k), a.site.at, `"${k}" is used in exclusive branches with different roles (${a.landing.aria.role} at ${a.site.at}, ${b.landing.aria.role} at ${b.site.at}).`, 'Use the same element kind in both branches, or give them different names.');
                    }
                    continue;
                }
                push('duplicates', strictAt(a.site.at, k) || strictAt(b.site.at, k), a.site.at, `"${k}" is also used by ${b.site.at}${sameFile ? ', and both can render together' : ''}.`, 'Give each element its own name, or scope them (`modal_a.save--button`, `modal_b.save--button`).');
            }
        }
    }
}

/** Whether two nodes in one file are in different arms of a branch (ternary, if/else, early return, switch). */
export function exclusive(a: ts.Node, b: ts.Node): boolean {
    const anc = new Set<ts.Node>();
    for (let n: ts.Node | undefined = a; n; n = n.parent) {
        anc.add(n);
    }
    let common: ts.Node | undefined = b;
    while (common && !anc.has(common)) {
        common = common.parent;
    }
    if (!common) {
        return false;
    }
    const c = common;
    const armOf = (x: ts.Node) => {
        let n = x;
        while (n.parent && n.parent !== c) {
            n = n.parent;
        }
        return n;
    };
    if (ts.isConditionalExpression(c)) {
        const aa = armOf(a);
        const bb = armOf(b);
        return aa !== bb && aa !== c.condition && bb !== c.condition;
    }
    if (ts.isIfStatement(c)) {
        const aa = armOf(a);
        const bb = armOf(b);
        return aa !== bb && aa !== c.expression && bb !== c.expression;
    }
    if (ts.isBlock(c) || ts.isSourceFile(c) || ts.isCaseClause(c)) {
        const sa = armOf(a);
        const sb = armOf(b);
        const [first] = sa.pos < sb.pos ? [sa, sb] : [sb, sa];
        let returns = false;
        const v = (n: ts.Node) => {
            if (ts.isReturnStatement(n)) {
                returns = true;
            }
            if (!returns && !ts.isFunctionLike(n)) {
                ts.forEachChild(n, v);
            }
        };
        v(first);
        if (returns && ts.isIfStatement(first)) {
            return true;
        }
    }
    if (ts.isCaseBlock(c)) {
        return true;
    }

    // guarded by contradicting conditions: `if (!compact) {…}` and `else if (archived && compact) {…}`
    if (contradict(guards(a, c), guards(b, c))) {
        return true;
    }

    // different functions of one component (e.g. render helpers chosen by a switch) count as exclusive only via the above
    return false;
}

type Atom = {text: string; neg: boolean};

/** The conditions a node runs under, below `stop`, as atoms: `a && !b` in a then-arm gives a, !b; an else-arm negates a single atom. */
function guards(n: ts.Node, stop: ts.Node): Atom[] {
    const out: Atom[] = [];
    const atom = (e: ts.Expression, neg: boolean): Atom => {
        let x = e;
        let negated = neg;
        while (ts.isParenthesizedExpression(x) || (ts.isPrefixUnaryExpression(x) && x.operator === ts.SyntaxKind.ExclamationToken)) {
            if (ts.isPrefixUnaryExpression(x)) {
                negated = !negated;
                x = x.operand;
            } else {
                x = x.expression;
            }
        }
        return {text: x.getText(), neg: negated};
    };
    const conjuncts = (e: ts.Expression): ts.Expression[] => {
        const x = ts.isParenthesizedExpression(e) ? e.expression : e;
        return ts.isBinaryExpression(x) && x.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken ? [...conjuncts(x.left), ...conjuncts(x.right)] : [x];
    };
    for (let c = n; c.parent && c !== stop; c = c.parent) {
        const p = c.parent;
        if (ts.isIfStatement(p) && c === p.thenStatement) {
            out.push(...conjuncts(p.expression).map((e) => atom(e, false)));
        } else if (ts.isIfStatement(p) && c === p.elseStatement && conjuncts(p.expression).length === 1) {
            out.push(atom(p.expression, true));
        } else if (ts.isConditionalExpression(p) && c === p.whenTrue) {
            out.push(...conjuncts(p.condition).map((e) => atom(e, false)));
        } else if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && c === p.right) {
            out.push(...conjuncts(p.left).map((e) => atom(e, false)));
        }
    }
    return out;
}

function contradict(a: Atom[], b: Atom[]): boolean {
    return a.some((x) => b.some((y) => x.text === y.text && x.neg !== y.neg));
}

/** Elements that would get the same generated member name in one scope (checked by the generator too). */
export function memberCollisions(elements: Element[], nameOf: (e: Element) => string): Diagnostic[] {
    const byScope = new Map<string, Map<string, Element>>();
    const out: Diagnostic[] = [];
    for (const e of elements) {
        if (!e.grammar) {
            continue;
        }
        const s = e.scope.join('.');
        const names = byScope.get(s) ?? new Map<string, Element>();
        byScope.set(s, names);
        const n = nameOf(e);
        const prev = names.get(n);
        if (prev && prev.template !== e.template) {
            out.push({rule: 'collisions', severity: 'error', at: e.component.at, message: `"${e.template}" and "${prev.template}" (${prev.component.at}) both generate ${s}.${n}.`, fix: 'Rename one of them.'});
        }
        names.set(n, e);
    }
    return out;
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

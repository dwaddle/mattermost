// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import ts from 'typescript';

import {attrValue, exprName, isFunctionLike, isIntrinsic, isJsxTag, jsxAttr, oneLine, propName, returnsOf, strip, tagName, type FunctionLike, type JsxTag} from './ast.ts';
import {cmp, cmpLoc, cmpLocs} from './compare.ts';
import {Conditions} from './conditions.ts';
import {relativeToRoot, type Config} from './config.ts';
import {componentName, emptyEffects, mergeEffects, Tracer, withDialogOps, type Effects} from './effects.ts';
import {pascal} from './generate/names.ts';
import {isGrammarError, KEY_PLACEHOLDER, parseTestId, type GrammarError, type ParsedTestId} from './grammar.ts';
import {readVersioned} from './input.ts';
import {MAX_CONDITION_USAGES, MAX_LANDING_HOPS, MAX_SCOPE_DEPTH, MAX_SCOPE_PATH, MAX_TEMPLATE_VALUES} from './limits.ts';
import {APP_MAP_VERSION, MANIFEST_VERSION, type Aria, type Diagnostic, type Element, type Loc, type Manifest, type Open, type PluginInfo, type PluginSlot, type RenderCondition, type RuleName, type TestPart} from './manifest_types.ts';
import {pageOf} from './navigation.ts';
import {buildPages, discoverRoutes} from './pages.ts';
import {installedVersion, loadPublishedParts, packageDir, publishedComponent, type PublishedParts} from './parts.ts';
import type {LoadedProgram} from './program.ts';
import {fileOfLoc, isCallUsage, ProgramIndex, usageNode, type CodeNode, type Usage} from './program_index.ts';
import {publish} from './publish.ts';
import {reachableFiles} from './reachability.ts';
import {ROLE_TABLE} from './role_table.ts';
import {asWritten, Roles, type AriaRole} from './roles.ts';
import {Operations} from './routes.ts';
import {StoreGates, type Gate} from './store_gates.ts';
import {assignmentsOf, concat, gapsOf, isTruncated, lit, pushesOf, Resolver, templateOf, TOO_MANY_VALUES, type Gap, type Value} from './values.ts';

export type SiteKind = 'dom' | 'component' | 'object' | 'part' | 'html';

/** A place where a data-testid is written. */
export type Site = {
    node: ts.Node;
    at: Loc;
    kind: SiteKind;
    tag: JsxTag | null;
    expr: ts.Expression | undefined;
    owner: CodeNode | null;
    ownerName: string;
    values: Value[];

    /** Component sites whose value is already emitted by a DOM site inside the component. */
    forwarded?: boolean;

    /** Part sites: the published part of a library component (`<Modal testId>` -> `.close--button`). */
    part?: TestPart & {component: string; claimed: string[]};

    /** HTML sites: the tag of `<span data-testid="x">` written inside a string (markup built for `dangerouslySetInnerHTML`). */
    htmlTag?: string;
    htmlAttrs?: string;
};

/** Where a site's testid ends up in the DOM, for one instance. */
export type Landing = {
    tag: JsxTag | null;
    aria: Aria;

    /** The tag whose on* attributes are the element's handlers. */
    handlerTag: JsxTag | null;

    /** Only these of the handler tag's on* attributes (a library part's callbacks); `handlerExclude` skips others' ones. */
    handlerAttrs?: string[];
    handlerExclude?: string[];

    /** The node whose render conditions apply. */
    anchor: ts.Node;
    interactive: boolean;
};

/** One testid value produced by one site for one instance. */
export type Emission = {
    site: Site;
    value: Value;
    template: string;
    key: string | null;
    parsed: ParsedTestId | GrammarError;
    via: Loc[];
    landing: Landing;
};

export type ScanStats = Record<string, number | Record<string, number>>;

export type ScanResult = {

    /** The manifest with exact locations (`file:line:column`), which checks and `test-surface where` read. */
    manifest: Manifest;

    /** The manifest as committed: places named `file#Component` (`publish`). */
    published: Manifest;
    stats: ScanStats;
    sites: Site[];
    emissions: Emission[];
    unknownEffects: Array<{at: Loc; template: string; calls: string[]}>;
    specGaps: Array<{client: string; verb: string; path: string}>;

    /** The node a usage location points at (for checks that compare positions along usage chains). */
    usageNodeAt: (loc: Loc) => ts.Node | undefined;

    /** The REST client's URL prefix (`/api/v4`), for the summary. */
    urlVersion: string | null;

    /** What the scan itself found wrong (unreadable inputs, `pageReady`, truncated navigations); checks add the rest. */
    diagnostics: Diagnostic[];
};

/** Roles a bare-word testid (a scope root, `channel_settings_modal`) may land on: it names a container, not a control. */
const CONTAINER_ROLES = new Set<AriaRole>(['none', 'presentation', 'dialog', 'alertdialog', 'menu', 'region', 'form', 'navigation', 'list', 'grid', 'table', 'tabpanel', 'status', 'alert', 'tooltip', 'text']);

/** Roles a component usage's element can have without being something the user operates, though it takes on* props. */
const NOT_OPERATED = new Set<AriaRole>(['text', 'img', 'list', 'listitem', 'dialog', 'heading', 'grid', 'table', 'cell', 'columnheader', 'row', 'gridcell', 'form', 'navigation', 'status', 'alert', 'region', 'tooltip', 'separator']);

export class Scanner {
    private readonly published: PublishedParts[];
    readonly ix: ProgramIndex;
    readonly R: Resolver;
    readonly roles: Roles;
    readonly conditions: Conditions;
    readonly ops: Operations;
    readonly tracer: Tracer;
    private readonly config: Config;
    private readonly usageByLoc = new Map<Loc, Usage>();
    private readonly diagnostics: Diagnostic[] = [];
    private readonly timings: Record<string, number> = {};

    constructor(loaded: LoadedProgram, config: Config, previous?: ProgramIndex) {
        this.config = config;
        let t = Date.now();
        this.ix = new ProgramIndex(loaded, config, previous);
        this.timings.index = Date.now() - t;
        this.R = new Resolver(this.ix);
        this.published = loadPublishedParts(config, this.diagnostics);
        this.roles = new Roles(this.ix, this.R, this.published);
        this.conditions = new Conditions(this.ix, this.R);
        t = Date.now();
        this.ops = new Operations(this.ix);
        this.diagnostics.push(...this.ops.diagnostics);
        this.timings.routes = Date.now() - t;
        this.tracer = new Tracer(this.ix, this.R, this.ops);
        t = Date.now();
        this.ix.addDynamicUsages((e) => this.R.sources(e).filter((x): x is {expr: ts.Expression; via: Loc[]} => !('marker' in x)).flatMap((src) => {
            // a member of a parameter no call site sets (a method called through a lookup table): its typed literals
            const x = strip(src.expr) as ts.Expression;
            const typed = ts.isPropertyAccessExpression(x) ? this.R.typedMemberSources(x) : [];
            return typed.length ? typed.map((expr) => ({expr, via: src.via})) : [src];
        }));
        this.timings.dynamicUsages = Date.now() - t;
        for (const us of this.ix.usages.values()) {
            for (const u of us) {
                this.usageByLoc.set(this.ix.where(usageNode(u)), u);
            }
        }
        Object.assign(this.timings, loaded.timings);
    }

    private diag(rule: RuleName, severity: Diagnostic['severity'], at: Loc, message: string, fix?: string) {
        this.diagnostics.push({rule, severity, at, message, ...(fix ? {fix} : {})});
    }

    // ---- sites ----------------------------------------------------------------------------

    collectSites(): Site[] {
        const sites: Site[] = [];
        const testIdProps = new Set(this.published.map((l) => l.parts.testIdProp));
        for (const sf of this.ix.files) {
            const visit = (n: ts.Node) => {
                if (ts.isJsxAttribute(n) && n.name.getText() === 'data-testid') {
                    const tag = n.parent.parent as JsxTag;
                    sites.push(this.site(n, isIntrinsic(tag) ? 'dom' : 'component', tag, attrValue(n) ?? undefined));
                } else if (ts.isJsxAttribute(n) && testIdProps.has(n.name.getText()) && !isIntrinsic(n.parent.parent as JsxTag)) {
                    sites.push(...this.partSites(n));
                } else if (ts.isPropertyAssignment(n) && propName(n.name) === 'data-testid' && ts.isStringLiteral(n.name)) {
                    sites.push(this.site(n, 'object', null, n.initializer));
                } else if (ts.isStringLiteral(n) || ts.isNoSubstitutionTemplateLiteral(n)) {
                    sites.push(...this.htmlSites(n));
                } else if (ts.isTemplateExpression(n)) {
                    // the whole template, so a testid can carry a key (`data-testid="x.mention:${name}--link"`)
                    sites.push(...this.htmlTemplateSites(n));
                }
                ts.forEachChild(n, visit);
            };
            visit(sf);
        }
        return sites;
    }

    /** Markup written as text (`<span class="x" data-testid="markdown.y--text">${word}</span>`): one site per literal testid on a tag. */
    private htmlSites(n: ts.StringLiteral | ts.NoSubstitutionTemplateLiteral | ts.TemplateLiteralLikeNode): Site[] {
        const out: Site[] = [];
        for (const m of n.text.matchAll(Scanner.HTML_TESTID)) {
            const site = this.site(n, 'html', null, undefined);
            site.values = [lit(m[2] ?? m[3])];
            site.htmlTag = m[1];
            site.htmlAttrs = n.text.slice(m.index, n.text.indexOf('>', m.index));
            out.push(site);
        }
        return out;
    }

    private static readonly HTML_TESTID = /<([a-z][a-z0-9]*)\b[^<>]*?\bdata-testid=(?:"([^"]+)"|'([^']+)')/g;

    /** A template with substitutions: its text with each substitution as a gap, one site per testid on a tag. */
    private htmlTemplateSites(n: ts.TemplateExpression): Site[] {
        if (!n.head.text.includes('<') && !n.templateSpans.some((s) => s.literal.text.includes('<'))) {
            return [];
        }
        const GAP = '\u0001';
        const gaps: Gap[] = [];
        let text = n.head.text;
        for (const span of n.templateSpans) {
            const g = this.R.gapFor(span.expression);
            gaps.push((g as {parts: Array<{gap: Gap}>}).parts[0].gap);
            text += GAP + span.literal.text;
        }
        const out: Site[] = [];
        for (const m of text.matchAll(Scanner.HTML_TESTID)) {
            const raw = m[2] ?? m[3];
            const valueStart = text.indexOf(raw, m.index);
            let g = [...text.slice(0, valueStart)].filter((c) => c === GAP).length;
            const parts: Array<string | {gap: Gap}> = [];
            let str = '';
            for (const c of raw) {
                if (c === GAP) {
                    if (str) {
                        parts.push(str);
                    }
                    str = '';
                    parts.push({gap: gaps[g++]});
                } else {
                    str += c;
                }
            }
            if (str) {
                parts.push(str);
            }
            const site = this.site(n, 'html', null, undefined);
            site.values = [parts.every((p) => typeof p === 'string') ? lit(parts.join('')) : {k: 'pat', parts}];
            site.htmlTag = m[1];
            site.htmlAttrs = text.slice(m.index, text.indexOf('>', m.index));
            out.push(site);
        }
        return out;
    }

    /** `<Modal testId={x}>` of a library that publishes its parts: one site per part the usage renders. */
    private partSites(attr: ts.JsxAttribute): Site[] {
        const tag = attr.parent.parent as JsxTag;
        const pub = publishedComponent(this.ix, tag, this.published);
        if (!pub?.component || attr.name.getText() !== pub.lib.parts.testIdProp) {
            return [];
        }
        const expr = attrValue(attr);
        const base = expr ? this.R.resolve(expr) : [];
        const out: Site[] = [];

        // callbacks a built-in part fires (`onClose` on the close button) aren't the root's
        const claimed = [...new Set(pub.component.parts.flatMap((p) => p.handlers ?? []))].sort();
        for (const part of pub.component.parts) {
            if (part.when && Boolean(jsxAttr(tag, part.when.prop)) !== part.when.set) {
                continue;
            }

            // an explicit data-testid on the usage wins over the derived root testid
            if ((part.suffix === '' || part.suffix.startsWith('--')) && jsxAttr(tag, 'data-testid')) {
                continue;
            }
            const site = this.site(attr, 'part', tag, undefined);
            site.values = concat(base, suffixValues(part, `${pub.name}.${pub.lib.parts.testIdProp}`));
            site.part = {...part, component: pub.name, claimed};
            out.push(site);
        }
        return out;
    }

    private site(node: ts.Node, kind: SiteKind, tag: JsxTag | null, expr: ts.Expression | undefined): Site {
        const owner = this.R.componentOf(node);
        return {
            node,
            at: this.ix.where(node),
            kind,
            tag,
            expr,
            owner,
            ownerName: owner ? componentName(owner) : '(module)',
            values: expr ? this.siteValues(node, kind, expr) : [{k: 'absent'}],
        };
    }

    /**
     * A testid in an object literal that is one branch of a condition (`{...(testId ? {'data-testid': `${testId}.x`} : {})}`)
     * renders only when the condition holds: resolve it with the condition's reference narrowed.
     */
    private siteValues(node: ts.Node, kind: SiteKind, expr: ts.Expression): Value[] {
        if (kind === 'object') {
            let child: ts.Node = node.parent;
            let p = child.parent;
            while (p && ts.isParenthesizedExpression(p)) {
                child = p;
                p = p.parent;
            }
            if (p && ts.isConditionalExpression(p) && child !== p.condition) {
                return this.R.resolveUnder(p.condition, child === p.whenTrue, expr);
            }
            if (p && ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === p.right) {
                return this.R.resolveUnder(p.left, true, expr);
            }
        }
        return this.R.resolve(expr);
    }

    // ---- landing --------------------------------------------------------------------------

    /** The JSX tag inside `comp` that receives its props by spread (`{...props}`, `{...rest}`), if any. */
    private spreadTarget(comp: CodeNode, propPath: string[] = []): JsxTag | null {
        let found: JsxTag | null = null;
        const visit = (n: ts.Node) => {
            if (found) {
                return;
            }
            if (isJsxTag(n)) {
                for (const p of n.attributes.properties) {
                    if (!ts.isJsxSpreadAttribute(p)) {
                        continue;
                    }
                    const rp = this.R.restPropsOf(p.expression) ?? this.R.propsPath(p.expression);
                    if (rp && rp.comp === comp && rp.path.join('.') === propPath.join('.')) {
                        found = n;
                        return;
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        const body = isFunctionLike(comp) ? comp.body : comp;
        if (body) {
            visit(body);
        }
        return found;
    }

    /**
     * The intrinsic element a component's spread props land on through `React.createElement`, when
     * its type is a tag name or falls back to one (`createElement(props.inputComponent || 'input', {...rest})`).
     */
    private createElementTarget(comp: CodeNode, propPath: string[] = []): string | null {
        let found: string | null = null;
        const visit = (n: ts.Node) => {
            if (found) {
                return;
            }
            if (ts.isCallExpression(n) && exprName(strip(n.expression) as ts.Expression) === 'createElement' && n.arguments.length >= 2) {
                const props = strip(n.arguments[1]) as ts.Expression;
                const spreads = ts.isObjectLiteralExpression(props) && props.properties.some((p) => {
                    if (!ts.isSpreadAssignment(p)) {
                        return false;
                    }
                    const rp = this.R.restPropsOf(p.expression) ?? this.R.propsPath(p.expression);
                    return Boolean(rp && rp.comp === comp && rp.path.join('.') === propPath.join('.'));
                });
                if (spreads) {
                    let t = strip(n.arguments[0]) as ts.Expression;
                    if (ts.isBinaryExpression(t) && (t.operatorToken.kind === ts.SyntaxKind.BarBarToken || t.operatorToken.kind === ts.SyntaxKind.QuestionQuestionToken)) {
                        t = strip(t.right) as ts.Expression;
                    }
                    if (ts.isStringLiteralLike(t) && (/^[a-z][a-z0-9]*$/).test(t.text)) {
                        found = t.text;
                        return;
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        const body = isFunctionLike(comp) ? comp.body : comp;
        if (body) {
            visit(body);
        }
        return found;
    }

    /**
     * Follows a component usage to the element its spread props land on: intrinsic, or a library component.
     * `hops` are the usages passed through, innermost first (the usage chain for the landing tag's own props).
     */
    private landTag(usage: JsxTag, propPath: string[] = []): {tag: JsxTag; library: boolean; hops: Loc[]; element?: string} | null {
        let tag = usage;
        let path = propPath;
        const hops: Loc[] = [];
        for (let depth = 0; depth < MAX_LANDING_HOPS; depth++) {
            if (isIntrinsic(tag)) {
                return {tag, library: false, hops};
            }
            const comp = this.ix.componentOfTag(tag);
            if (!comp || this.ix.isLibraryNode(comp)) {
                return {tag, library: true, hops};
            }
            const next = this.spreadTarget(comp, path);
            if (!next) {
                // `createElement(as || 'input', {...rest})`: the usage's attributes land on that tag
                const element = this.createElementTarget(comp, path);
                return element ? {tag, library: false, hops, element} : null;
            }
            hops.unshift(this.ix.where(tag));
            tag = next;
            path = [];
        }
        return null;
    }

    landing(site: Site, via: Loc[]): Landing {
        if (site.kind === 'part') {
            const usage = site.tag!;
            const part = site.part!;
            const root = part.suffix === '' || part.suffix.startsWith('--');
            const role = part.role;
            return {
                tag: null,
                aria: {role, native: false, state: []},
                handlerTag: usage,
                ...(root ? {handlerExclude: part.claimed} : {handlerAttrs: part.handlers ?? []}),
                anchor: elementOf(usage),
                interactive: role !== null && Boolean(ROLE_TABLE[role].interactive),
            };
        }
        if (site.kind === 'html') {
            return {tag: null, aria: this.roles.ofTagName(site.htmlTag!, site.htmlAttrs), handlerTag: null, anchor: site.node, interactive: false};
        }
        if (site.kind === 'dom') {
            const tag = site.tag!;
            return {tag, aria: this.roles.ofIntrinsic(tag, via), handlerTag: tag, anchor: elementOf(tag), interactive: this.roles.isInteractive(tag)};
        }
        if (site.kind === 'component') {
            const usage = site.tag!;
            const hasHandlers = usage.attributes.properties.some((a) => ts.isJsxAttribute(a) && (/^on[A-Z]/).test(a.name.getText()));
            const own = this.usageAria(usage, via);
            const land = this.landTag(usage);
            let aria: Aria = own ?? {role: null, native: false, state: []};
            if (!own && land) {
                const innerVia = [...land.hops, ...via];
                aria = (land.library ? this.roles.ofLibrary(land.tag, innerVia) : this.roles.ofIntrinsic(land.tag, innerVia, land.element)) ?? aria;
            }
            const interactive = hasHandlers || (aria.role !== null && !NOT_OPERATED.has(aria.role));
            return {tag: land?.tag ?? null, aria, handlerTag: usage, anchor: elementOf(usage), interactive};
        }

        // 'data-testid' in an object literal: follow the object to a component prop that is spread onto an element
        const obj = site.node.parent;
        const attr = obj?.parent?.parent;
        if (attr && ts.isJsxAttribute(attr) && isJsxTag(attr.parent.parent)) {
            const usage = attr.parent.parent;
            const land = this.landTag(usage, [attr.name.getText()]);
            if (land && land.tag !== usage) {
                const aria = (land.library ? this.roles.ofLibrary(land.tag) : this.roles.ofIntrinsic(land.tag)) ?? {role: null, native: false, state: []};
                return {tag: land.tag, aria, handlerTag: null, anchor: elementOf(usage), interactive: !land.library && this.roles.isInteractive(land.tag)};
            }
        }
        return {tag: null, aria: {role: null, native: false, state: []}, handlerTag: null, anchor: site.node, interactive: false};
    }

    /** Role set at a component usage (`<Button role='switch'>`, `<Button aria-pressed>`), which wins over the component's own. */
    private usageAria(usage: JsxTag, via: Loc[]): Aria | null {
        const role = this.roles.attrLiterals(usage, 'role', via);
        if (role && role.length) {
            return {role: asWritten(role[0]), native: false, state: []};
        }
        if (jsxAttr(usage, 'aria-pressed')) {
            return {role: 'togglebutton', native: false, state: ['aria-pressed']};
        }
        return null;
    }

    // ---- emissions ------------------------------------------------------------------------

    /**
     * Whether each usage on an instance's chain can render there: a usage inside `if (props.x)`, `props.x && …`
     * or `props.x ? … :` is impossible for an instance whose own usage doesn't pass `x`.
     */
    private renderedFor(via: Loc[]): boolean {
        for (let i = 0; i < via.length - 1; i++) {
            const u = this.usageByLoc.get(via[i]);
            if (u && this.guardedOff(usageAnchor(u), via.slice(i + 1))) {
                return false;
            }
        }
        return true;
    }

    private guardedOff(node: ts.Node, outer: Loc[]): boolean {
        const comp = this.R.componentOf(node);
        const guards: Array<{cond: ts.Expression; positive: boolean}> = [];
        for (let child = node, p = node.parent; p && p !== comp; child = p, p = p.parent) {
            if (ts.isIfStatement(p) && child !== p.expression) {
                guards.push({cond: p.expression, positive: child === p.thenStatement});
            } else if (ts.isConditionalExpression(p) && child !== p.condition) {
                guards.push({cond: p.condition, positive: child === p.whenTrue});
            } else if (ts.isBinaryExpression(p) && p.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken && child === p.right) {
                guards.push({cond: p.left, positive: true});
            } else if (ts.isBlock(p)) {
                // an earlier `if (x) return …;` in the same block: code after it runs only when `x` is falsy
                for (const st of p.statements) {
                    if (st === child) {
                        break;
                    }
                    if (ts.isIfStatement(st) && !st.elseStatement && alwaysReturns(st.thenStatement)) {
                        guards.push({cond: st.expression, positive: false});
                    }
                }
            }
        }
        for (const g of guards) {
            let positive = g.positive;
            let c = strip(g.cond) as ts.Expression;
            while (ts.isPrefixUnaryExpression(c) && c.operator === ts.SyntaxKind.ExclamationToken) {
                positive = !positive;
                c = strip(c.operand) as ts.Expression;
            }
            const pp = this.R.propsPath(c);
            if (!pp || pp.comp !== comp || !pp.path.length) {
                continue;
            }

            // a prop the instance doesn't pass (or passes as false) is off; one it passes a truthy value for is on
            const vals = this.R.resolveIn(c, outer);
            const off = vals.length > 0 && vals.every((v) => v.k === 'absent' || (v.k === 'lit' && FALSY_LITERALS.has(v.s)));
            const on = vals.length > 0 && vals.every((v) => (v.k === 'lit' && !FALSY_LITERALS.has(v.s)) || (v.k === 'pat' && v.parts.some((part) => typeof part === 'string' && part !== '')));
            if ((positive && off) || (!positive && on)) {
                return true;
            }
        }
        return false;
    }

    emissions(sites: Site[]): Emission[] {
        // component sites whose values a DOM site inside the component already emits (the same value through that
        // usage: another prop of the same usage, like an input's clear button testid, doesn't cover it)
        const covered = new Map<Loc, Set<string>>();
        const text = (v: Value) => (v.k === 'lit' ? v.s : templateOf(v));
        for (const s of sites) {
            if (s.kind !== 'dom') {
                continue;
            }
            for (const v of s.values) {
                // a value that renders no testid (`clearTestId ? … : undefined` at a usage without clearTestId) covers nothing
                if (v.k === 'absent') {
                    continue;
                }
                const t = text(v);
                for (const u of v.via ?? []) {
                    const set = covered.get(u) ?? new Set<string>();
                    set.add(t ?? '');
                    covered.set(u, set);
                }
            }
        }
        const coveredBy = (site: Site) => (site.kind === 'component' ? covered.get(this.ix.where(site.tag!)) : undefined);

        // a component site nothing inside covers is where the testid lands as far as the scan can see (an icon
        // component chosen at run time, a library component), and so is a forwarded `{...{'data-testid': x}}`
        // object: the usages it came through forward to it
        const addCover = (s: Site, into: Map<Loc, Set<string>>) => {
            for (const v of s.values) {
                if (v.k === 'absent') {
                    continue;
                }
                for (const u of v.via ?? []) {
                    const set = into.get(u) ?? new Set<string>();
                    set.add(text(v) ?? '');
                    into.set(u, set);
                }
            }
        };
        const terminal = new Map<Loc, Set<string>>();
        for (const s of sites) {
            if ((s.kind === 'component' || s.kind === 'object') && !coveredBy(s) && s.values.some((v) => v.via?.length)) {
                addCover(s, terminal);
            }
        }
        for (const [loc, set] of terminal) {
            const prev = covered.get(loc);
            covered.set(loc, prev ? new Set([...prev, ...set]) : set);
        }
        const out: Emission[] = [];
        for (const site of sites) {
            const inner = coveredBy(site);
            const isCovered = (v: Value) => Boolean(inner && (inner.has(text(v) ?? '') || inner.has('')));
            if (inner && site.values.every((v) => v.k === 'absent' || isCovered(v))) {
                site.forwarded = true;
                continue;
            }
            let concreteTemplates: string[] | null = null;
            const concrete = () => {
                concreteTemplates ??= site.values.filter((v) => !(v.k === 'pat' && v.recursive)).map(templateOf).filter((t): t is string => t !== null);
                return concreteTemplates;
            };
            for (const value of site.values) {
                if (value.k === 'absent' || isCovered(value)) {
                    continue;
                }
                const via = value.via ?? [];

                // the element isn't rendered for this instance: a usage on its chain sits under a prop that's absent there
                if (via.length > 1 && !this.renderedFor(via)) {
                    continue;
                }

                // …or the site itself sits under one (`if (iconOnly) return <button …/>` for an instance without iconOnly)
                if (via.length && site.tag && this.guardedOff(site.tag, via)) {
                    continue;
                }
                const raw = templateOf(value);
                if (raw === null) {
                    continue;
                }

                // a recursive component's own scope fed back into itself (`<ContainerBlock testIdScope={testIdScope}/>`
                // inside the blocks ContainerBlock renders) leaves the scope unknown at the cycle; when an outer instance
                // already renders the same element (`center.post_list.post.action:{key}--button` for
                // `{key}.action:{key}--button`), the cycle adds nothing. (A recursion that reaches an element no outer
                // instance does, or builds a key, stays.)
                if (value.k === 'pat' && value.recursive && raw.startsWith(KEY_PLACEHOLDER)) {
                    const rest = raw.slice(KEY_PLACEHOLDER.length);
                    if (concrete().some((t) => t.endsWith(rest))) {
                        continue;
                    }
                }
                let parsed = parseTestId(raw);
                const landing = this.landing(site, via);

                // a bare word is only a scope root on a container, not on something a user operates
                if (!isGrammarError(parsed) && !parsed.scope.length && landing.aria.role && !CONTAINER_ROLES.has(landing.aria.role)) {
                    parsed = {rule: 'unscoped', message: `"${raw}" has no scope.`, fix: `Prefix it with where it lives, e.g. "area.${parsed.name}--${landing.aria.role}".`};
                }
                let template = raw;
                let key: string | null = null;
                if (!isGrammarError(parsed) && parsed.hasKey && parsed.key !== null) {
                    key = parsed.key;
                    template = raw.replace(':' + parsed.key, ':' + KEY_PLACEHOLDER);
                }
                out.push({site, value, template, key, parsed, via, landing});
            }
        }
        return out;
    }

    // ---- per-emission analysis ------------------------------------------------------------

    private effectsOf(e: Emission): Effects {
        const acc = emptyEffects();
        const tag = e.landing.handlerTag;
        if (!tag) {
            return acc;
        }
        const only = e.landing.handlerAttrs && new Set(e.landing.handlerAttrs);
        const skip = new Set(e.landing.handlerExclude ?? []);
        for (const a of tag.attributes.properties) {
            if (!ts.isJsxAttribute(a) || !(/^on[A-Z]/).test(a.name.getText())) {
                continue;
            }
            if ((only && !only.has(a.name.getText())) || skip.has(a.name.getText())) {
                continue;
            }
            const h = attrValue(a);
            if (h) {
                mergeEffects(acc, this.tracer.effectsOfHandler(h, e.via));
            }
        }

        // handlers passed in through a props spread (`<button {...otherProps}>`): the ones at the usages this instance came
        // through, up the chain while each usage spreads its own props on (`<SaveButton onClick>` -> `<Button {...props}>`)
        if (tag.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a)) && e.via.length) {
            const seen = new Set(tag.attributes.properties.filter(ts.isJsxAttribute).map((a) => a.name.getText()));
            for (let i = 0; i < e.via.length; i++) {
                const usage = this.usageByLoc.get(e.via[i]);
                if (!usage || isCallUsage(usage)) {
                    break;
                }
                for (const a of usage.attributes.properties) {
                    if (ts.isJsxAttribute(a) && (/^on[A-Z]/).test(a.name.getText()) && !seen.has(a.name.getText())) {
                        seen.add(a.name.getText());
                        const h = attrValue(a);
                        if (h) {
                            mergeEffects(acc, this.tracer.effectsOfHandler(h, e.via.slice(i + 1)));
                        }
                    }
                }
                if (!usage.attributes.properties.some((a) => ts.isJsxSpreadAttribute(a))) {
                    break;
                }
            }
        }

        // a submit button fires its form's onSubmit
        const land = e.landing.tag;
        if (land && isIntrinsic(land) && tagName(land) === 'button') {
            const type = this.roles.attrLiterals(land, 'type', e.via);
            if (!type || type.includes('submit')) {
                const form = enclosingForm(land);
                const onSubmit = form && attrValue(jsxAttr(form, 'onSubmit'));
                if (onSubmit) {
                    mergeEffects(acc, this.tracer.effectsOfHandler(onSubmit, e.via));
                }
            }
        }

        // a click can start an animation that finishes the action: a reaction saves when its count's animation ends
        if (jsxAttr(tag, 'onClick') && ts.isJsxOpeningElement(tag)) {
            const visit = (n: ts.Node) => {
                if (isJsxTag(n) && n !== tag) {
                    for (const name of ['onAnimationEnd', 'onTransitionEnd']) {
                        const h = attrValue(jsxAttr(n, name));
                        if (h) {
                            mergeEffects(acc, this.tracer.effectsOfHandler(h, e.via));
                        }
                    }
                }
                ts.forEachChild(n, visit);
            };
            tag.parent.children.forEach(visit);
        }

        // UI the store shows: a constant the click dispatches that a component's render condition compares against
        for (const k of acc.signals.keys()) {
            for (const g of this.storeGates().get(k) ?? []) {
                const node = g.comp as CodeNode;
                acc.opens.set('panel:' + componentName(node), {kind: 'panel', node, target: componentName(node), at: this.ix.where(g.usage)});
            }
        }

        // a router link navigates when clicked: <Link to=…>, <NavLink to=…>
        const to = this.isRouterLink(tag) ? attrValue(jsxAttr(tag, 'to')) : undefined;
        if (to) {
            acc.navigates.set(this.ix.where(to), {expr: to, target: oneLine(to), conditional: false});
        }
        return acc;
    }

    private gates: Map<string, Gate[]> | null = null;

    private storeGates(): Map<string, Gate[]> {
        this.gates ??= new StoreGates(this.ix, this.R, this.conditions).build();
        return this.gates;
    }

    /** `Link` / `NavLink` imported from react-router. */
    private isRouterLink(tag: JsxTag): boolean {
        if (!(/^(Link|NavLink)$/).test(tagName(tag))) {
            return false;
        }
        const d = this.ix.checker.getSymbolAtLocation(tag.tagName)?.declarations?.[0];
        const from = d && ts.isImportSpecifier(d) ? d.parent.parent.parent.moduleSpecifier : undefined;
        return Boolean(from && ts.isStringLiteral(from) && (/^react-router(-dom)?$/).test(from.text));
    }

    /**
     * Elements the app can't render: no emission site is in a file the entries reach, or every usage chain
     * passes through a file they don't (a menu item written in a component nothing imports).
     */
    private markUnreachable(elements: Element[]) {
        const files = new Set([...reachableFiles(this.ix.program, this.config.entries)].map((f) => this.ix.rel(f)));
        const live = (loc: Loc) => files.has(fileOfLoc(loc));
        for (const el of elements) {
            const sites = [el.component.at, ...(el.alsoAt ?? [])];
            if (!sites.some(live) || !el.instances.some((i) => i.via.every(live))) {
                el.unreachable = true;
            }
        }
    }

    /** ToggleModalButton-style components: `dialogType={X}` on the element's own tag. */
    private tagOpens(e: Emission): Array<{open: Open; node: CodeNode | null}> {
        const tag = e.landing.handlerTag;
        let dt = tag && attrValue(jsxAttr(tag, 'dialogType'));

        // the testid is on the component's own button (`<button data-testid={`${testId}--button`}>` inside
        // ToggleModalButton): `dialogType` is on the usage that rendered it, when the component takes that prop.
        // `at` stays the button: the button's own testid flows through the usage, and a testid flowing through
        // an opener's `at` would name the modal (as dialogProps do)
        const usage = !dt && tag && e.via.length ? this.usageByLoc.get(e.via[0]) : undefined;
        if (usage && !isCallUsage(usage) && this.takesProp(tag!, 'dialogType')) {
            dt = attrValue(jsxAttr(usage, 'dialogType'));
        }
        if (!dt || !tag) {
            return [];
        }
        return this.dialogArms(dt).map((arm) => {
            const node = this.ix.unwrapExpr(arm);
            return {open: {kind: 'modal', target: node ? componentName(node) : arm.getText(), at: this.ix.where(tag)}, node};
        });
    }

    /** The components a `dialogType` value can be: both arms of `a ? A : B`, also through a local `const modal = a ? A : B`. */
    private dialogArms(e: ts.Expression): ts.Expression[] {
        const x = strip(e) ?? e;
        if (ts.isConditionalExpression(x)) {
            return [...this.dialogArms(x.whenTrue), ...this.dialogArms(x.whenFalse)];
        }
        if (ts.isIdentifier(x)) {
            const d = this.ix.checker.getSymbolAtLocation(x)?.valueDeclaration;
            const init = d && ts.isVariableDeclaration(d) && d.initializer ? strip(d.initializer) : undefined;
            if (init && ts.isConditionalExpression(init) && (ts.getCombinedNodeFlags(d!) & ts.NodeFlags.Const)) {
                return this.dialogArms(init);
            }
        }
        return [x];
    }

    /** Whether the component that renders `tag` destructures or reads a prop named `name`. */
    private takesProp(tag: JsxTag, name: string): boolean {
        let fn: ts.Node | undefined = tag.parent;
        while (fn && !(ts.isFunctionLike(fn) && fn.parameters.length > 0 && !ts.isJsxAttribute(fn.parent) && !ts.isCallExpression(fn.parent))) {
            fn = fn.parent;
        }
        const param = fn && ts.isFunctionLike(fn) ? fn.parameters[0] : undefined;
        if (!param) {
            return false;
        }
        if (ts.isObjectBindingPattern(param.name)) {
            return param.name.elements.some((el) => (el.propertyName ?? el.name).getText() === name);
        }

        // `props.dialogType` read somewhere in the component (not text that merely contains it)
        const props = ts.isIdentifier(param.name) ? this.ix.checker.getSymbolAtLocation(param.name) : undefined;
        const reads = (n: ts.Node): boolean => (ts.isPropertyAccessExpression(n) && n.name.text === name && ts.isIdentifier(n.expression) &&
            Boolean(props) && this.ix.checker.getSymbolAtLocation(n.expression) === props) || Boolean(ts.forEachChild(n, reads));
        return reads(fn!);
    }

    /** Menu triggers: a testid read from `props.menuButton` of a component that also takes `menu` opens that menu. */
    private menuOpens(e: Emission): {open: Open; usage: JsxTag} | null {
        const wrapped = wrapperMenu(e.landing.anchor);
        if (wrapped) {
            return {open: {kind: 'menu', target: tagName(wrapped), at: this.ix.where(wrapped)}, usage: wrapped};
        }
        const pp = e.site.expr ? this.R.propsPath(e.site.expr) : null;
        if (!pp || pp.path[0] !== 'menuButton' || !e.via.length) {
            return null;
        }
        const usage = this.usageByLoc.get(e.via[0]);
        if (!usage || isCallUsage(usage) || !jsxAttr(usage, 'menu')) {
            return null;
        }
        const menu = attrValue(jsxAttr(usage, 'menu'));
        const id = menu && ts.isObjectLiteralExpression(menu) ? menu.properties.find((p) => propName(p.name) === 'id') : undefined;
        const label = id && ts.isPropertyAssignment(id) && ts.isStringLiteralLike(id.initializer) ? id.initializer.text : 'menu';
        return {open: {kind: 'menu', target: label, at: this.ix.where(usage)}, usage};
    }

    private conditionsOf(e: Emission): RenderCondition[] {
        const out = this.conditions.of(e.landing.anchor);

        // conditions at the usages the testid flowed through (`{canX && <Item/>}` in the parent)
        for (const loc of e.via.slice(0, MAX_CONDITION_USAGES)) {
            const u = this.usageByLoc.get(loc);
            if (u) {
                out.push(...this.conditions.of(usageAnchor(u)));
            }
        }

        // a literal testid inside a component: conditions where that component is rendered (when it is rendered in few places)
        const owner = e.site.owner;
        const usages = owner && !e.via.length ? this.ix.usages.get(owner) ?? [] : [];
        if (usages.length && usages.length <= MAX_CONDITION_USAGES) {
            for (const u of usages) {
                out.push(...this.conditions.of(usageAnchor(u)));
            }
        }
        return out;
    }

    // ---- scopes rendered by a component (open targets) -----------------------------------

    private scopeMemo = new Map<ts.Node, Map<string, Set<string>>>();
    private emissionsByFile = new Map<ts.SourceFile, Emission[]>();

    /**
     * Testid scopes a subtree renders: its own valid testids plus those of the components it uses. `path` is the
     * chain of usages descended through (outermost first); a child's testid only counts when it was produced
     * through that chain (or is literal), so a shared wrapper doesn't leak other instances' scopes.
     */
    private scopesOf(node: ts.Node, path: Loc[] = [], stack = new Set<ts.Node>(), followRefs = false): Set<string> {
        const key = (followRefs ? '&' : '') + path.join('<');
        const memoForNode = this.scopeMemo.get(node);
        const memo = memoForNode?.get(key);
        if (memo) {
            return memo;
        }
        const out = new Set<string>();
        if (path.length > MAX_SCOPE_PATH || stack.has(node)) {
            return out;
        }
        stack.add(node);
        const throughPath = (via: Loc[]) => via.every((loc, i) => i >= path.length || loc === path[path.length - 1 - i]);
        for (const e of this.emissionsByFile.get(node.getSourceFile()) ?? []) {
            if (!isGrammarError(e.parsed) && e.parsed.scope.length && e.site.node.pos >= node.pos && e.site.node.end <= node.end && throughPath(e.via)) {
                out.add(e.parsed.scope.join('.'));
            }
        }
        const visit = (n: ts.Node) => {
            if (isJsxTag(n)) {
                const comp = this.ix.componentOfTag(n);
                if (comp && !this.ix.isLibraryNode(comp)) {
                    for (const sc of this.scopesOf(comp, [...path, this.ix.where(n)], stack)) {
                        out.add(sc);
                    }
                }
            }

            // a subtree (a menu's children) can refer to JSX defined outside it; a whole component's body already holds it
            // `{createChannelItem}`: JSX held in a variable (`let x = null; if (…) x = <Menu.Item …/>`, or `items.push(<Menu.Item …/>)`)
            // `{isAdmin ? makeMember : null}`, `{canCreate && createItem}`: the variables a condition picks from
            if (followRefs && ts.isJsxExpression(n) && n.expression) {
                for (const id of pickedIdentifiers(n.expression)) {
                    for (const expr of this.jsxHeldBy(id)) {
                        for (const sc of this.scopesOf(expr, path, stack, true)) {
                            out.add(sc);
                        }
                    }
                }
            }

            // `{renderTeam(team)}`: a render helper in the same file (in JSX children, not in a handler attribute);
            // `{options.map(renderOption)}`: one passed by reference
            if (followRefs && ts.isCallExpression(n) && inJsxChildren(n)) {
                const callee = strip(n.expression);
                const refs = [callee, ...n.arguments.map((a) => strip(a))].filter((x): x is ts.Identifier => Boolean(x) && ts.isIdentifier(x!));
                for (const id of refs) {
                    const helper = this.localHelper(id);
                    for (const r of helper ? returnsOf(helper) : []) {
                        for (const sc of this.scopesOf(r, path, stack, true)) {
                            out.add(sc);
                        }
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(node);
        stack.delete(node);
        const m = memoForNode ?? new Map<string, Set<string>>();
        m.set(key, out);
        this.scopeMemo.set(node, m);
        return out;
    }

    /** A function declared in the same file as the call (not a component: those are followed through their tags). */
    private localHelper(id: ts.Identifier): FunctionLike | null {
        const d = this.ix.checker.getSymbolAtLocation(id)?.valueDeclaration;
        const fn = d && ts.isVariableDeclaration(d) ? d.initializer && strip(d.initializer) : d;
        if (!fn || !isFunctionLike(fn) || fn.getSourceFile() !== id.getSourceFile() || this.ix.usages.has(fn)) {
            return null;
        }
        return fn;
    }

    /** The expressions a local variable is set to (initializer and later assignments). */
    private jsxHeldBy(id: ts.Identifier): ts.Expression[] {
        const sym = this.ix.checker.getSymbolAtLocation(id);
        const d = sym?.valueDeclaration;
        if (!sym || !d || !ts.isVariableDeclaration(d) || d.getSourceFile() !== id.getSourceFile()) {
            return [];
        }
        return [...(d.initializer ? [d.initializer] : []), ...assignmentsOf(d, sym, this.ix.checker), ...pushesOf(d, sym, this.ix.checker)];
    }

    private coarseMemo = new Map<ts.Node, Set<string>>();

    /**
     * Where each scope is decided: the outermost usage its testid's value flowed through (the composer's
     * `center.post_create` belongs to the component that renders `<AdvancedCreatePost location=…>`), or
     * the emission site when the value is fixed there.
     */
    private renderAnchors = new Map<ts.SourceFile, Array<{node: ts.Node; scope: string; container?: string}>>();

    /** Scope-less containers by where they are decided (only for naming an opened component). */
    private rootAnchors = new Map<ts.SourceFile, Array<{node: ts.Node; scope: string}>>();

    private anchorEmissions(emissions: Emission[]) {
        for (const e of emissions) {
            if (isGrammarError(e.parsed)) {
                continue;
            }
            const outer = [...e.via].reverse().map((loc) => this.usageByLoc.get(loc)).find(Boolean);
            const node = outer ? usageAnchor(outer) : e.site.node;
            const sf = node.getSourceFile();

            // a scope-less container (`file_preview_modal`) is the root its children's scopes start with: it names the
            // component that renders it, though only `scope.name` testids count as scopes elsewhere
            if (!e.parsed.scope.length) {
                if (!e.parsed.role && !e.parsed.hasKey) {
                    this.rootAnchors.set(sf, [...(this.rootAnchors.get(sf) ?? []), {node, scope: e.parsed.name}]);
                }
                continue;
            }
            this.scopeRoots.add(e.parsed.scope[0]);

            // a container (`admin.attribute.graph.grant_modal`) is the scope its children start with: a modal whose root
            // sits under another scope is named by that root, not by the scope it nests in
            const container = !e.parsed.role && !e.parsed.hasKey;
            const scope = container ? [...e.parsed.scope, e.parsed.name] : e.parsed.scope;
            this.renderAnchors.set(sf, [...(this.renderAnchors.get(sf) ?? []), {node, scope: scope.join('.')}]);
        }
    }

    /** First words of every scope: a scope-less container names a component only when other testids nest under it. */
    private readonly scopeRoots = new Set<string>();

    /** Scopes whose value is decided inside this node (its own testids, and the scopes it passes down). */
    private scopesDecidedIn(node: ts.Node): string[] {
        const sf = node.getSourceFile();
        const inside = (a: {node: ts.Node}) => a.node.pos >= node.pos && a.node.end <= node.end;
        const roots = (this.rootAnchors.get(sf) ?? []).filter((a) => this.scopeRoots.has(a.scope));
        const own: Array<{scope: string; container?: string}> = [...(this.renderAnchors.get(sf) ?? []), ...roots].filter(inside);

        // a scoped container that testids nest under (`rhs.channel_info`) decides that scope, not its parent's
        const nests = (c: string) => own.some((b) => b.scope === c || b.scope.startsWith(c + '.'));
        return [...new Set(own.map((a) => (a.container && nests(a.container) ? a.container : a.scope)))].sort();
    }

    /** Scopes a component renders, each with the fewest component levels down it appears at (up to 4). */
    private scopeDepths(node: ts.Node): Map<string, number> {
        const out = new Map<string, number>();
        let level: ts.Node[] = [node];
        const seen = new Set<ts.Node>();
        for (let depth = 0; depth <= MAX_SCOPE_DEPTH && level.length; depth++) {
            const next: ts.Node[] = [];
            for (const n of level) {
                if (seen.has(n)) {
                    continue;
                }
                seen.add(n);
                for (const a of this.renderAnchors.get(n.getSourceFile()) ?? []) {
                    if (a.node.pos >= n.pos && a.node.end <= n.end && !out.has(a.scope)) {
                        out.set(a.scope, depth);
                    }
                }
                const visit = (c: ts.Node) => {
                    if (isJsxTag(c)) {
                        const comp = this.ix.componentOfTag(c);
                        if (comp && !this.ix.isLibraryNode(comp)) {
                            next.push(comp);
                        }
                    }
                    ts.forEachChild(c, visit);
                };
                visit(n);
            }
            level = next;
        }
        return out;
    }

    /** Scopes anywhere in a component's render tree, ignoring which instance produced them (for pages). */
    private scopesRenderedBy(node: ts.Node, stack = new Set<ts.Node>()): Set<string> {
        const memo = this.coarseMemo.get(node);
        if (memo) {
            return memo;
        }
        const out = new Set<string>();
        if (stack.has(node)) {
            return out;
        }
        stack.add(node);
        for (const a of this.renderAnchors.get(node.getSourceFile()) ?? []) {
            if (a.node.pos >= node.pos && a.node.end <= node.end) {
                out.add(a.scope);
            }
        }
        const visit = (n: ts.Node) => {
            if (isJsxTag(n)) {
                const comp = this.ix.componentOfTag(n);
                if (comp && !this.ix.isLibraryNode(comp)) {
                    for (const sc of this.scopesRenderedBy(comp, stack)) {
                        out.add(sc);
                    }
                }
            }
            ts.forEachChild(n, visit);
        };
        visit(node);
        stack.delete(node);
        this.coarseMemo.set(node, out);
        return out;
    }

    /**
     * A container's or keyed item's `renders`: the top-level scopes (one word) rendered inside its element, at any of
     * its emissions, other than its own and those something opens (a portal renders those outside it).
     */
    private addNestedScopes(elements: Element[], byTemplate: Map<string, Emission[]>) {
        const opened = new Set(elements.flatMap((e) => (e.opens ?? []).map((o) => o.scope).filter((x): x is string => Boolean(x))));
        for (const el of elements) {
            if (!el.grammar || (el.role && !el.key)) {
                continue;
            }
            const own = el.scope[0] ?? el.name;
            const inside = new Set<string>();
            for (const e of byTemplate.get(el.template) ?? []) {
                const tag = e.landing.tag ?? e.site.tag;
                if (!tag) {
                    continue;
                }
                for (const s of this.scopesRenderedBy(elementOf(tag))) {
                    if (!s.includes('.') && s !== own && !opened.has(s)) {
                        inside.add(s);
                    }
                }
            }
            if (inside.size) {
                el.renders = [...inside].sort(cmp);
            }
        }
    }

    /**
     * `effects.declared`: requests the scan can't see an element send (an upload through a raw XMLHttpRequest), added
     * to its effects. An entry naming no element is reported, like an allow entry that stopped matching; one naming an
     * operation that neither a client method nor the OpenAPI spec has is an error.
     */
    private addDeclaredEffects(elements: Element[]) {
        const at = relativeToRoot(this.config, this.config.configPath);
        for (const d of this.config.effects.declared) {
            const el = elements.find((e) => e.template === d.testId);
            if (!el) {
                this.diag('allow', 'warning', at, `effects.declared entry for "${d.testId}" matches no element.`, 'Remove it, or name the testid as it is now.');
                continue;
            }
            for (const id of d.ops) {
                if (!this.ops.byId.has(id)) {
                    const spec = this.ops.specOps.find((o) => o.opId === id);
                    if (!spec) {
                        this.diag('input', 'error', at, `effects.declared names ${id} for "${d.testId}", which is neither a client method's operation nor in the OpenAPI spec.`, 'Name the OpenAPI operation id.');
                        continue;
                    }
                    this.ops.byId.set(id, {opId: id, verb: spec.verb, path: spec.path, body: null, schema: spec.schema, inSpec: true, client: ''});
                }
                const fx = el.effects ?? {ops: [], unknown: false, delegated: []};
                fx.ops = [...new Set([...fx.ops, id])].sort();
                el.effects = fx;
            }
        }
    }

    // ---- manifest -------------------------------------------------------------------------

    scan(): ScanResult {
        let t = Date.now();
        const sites = this.collectSites();
        const emissions = this.emissions(sites);
        this.timings.testids = Date.now() - t;
        for (const e of emissions) {
            const sf = e.site.node.getSourceFile();
            const list = this.emissionsByFile.get(sf) ?? [];
            list.push(e);
            this.emissionsByFile.set(sf, list);
        }

        t = Date.now();
        const byTemplate = new Map<string, Emission[]>();
        for (const e of emissions) {
            const list = byTemplate.get(e.template) ?? [];
            list.push(e);
            byTemplate.set(e.template, list);
        }

        const elements: Element[] = [];
        const opTargets = new Map<string, CodeNode>();
        const unknownEffects: ScanResult['unknownEffects'] = [];
        const menuUsages = new Map<string, JsxTag>();
        const navigations = new Map<Open, ts.Expression>();
        for (const [template, list] of byTemplate) {
            list.sort((a, b) => cmpLoc(a.site.at, b.site.at) || cmpLocs(a.via, b.via));
            const first = list[0];
            const parsed = first.parsed;
            const valid = !isGrammarError(parsed);
            const effects = emptyEffects();

            // conditions that hold wherever the element renders (a condition of one site only isn't one of the element's)
            const siteConds: Array<Map<string, RenderCondition>> = [];
            const opens = new Map<string, Open>();
            const instances = new Map<string, {via: Loc[]; keySet: Set<string>}>();
            const keyValues = new Set<string>();
            const gaps: Gap[] = [];
            let aria: Aria = first.landing.aria;
            const menuSites = new Set<string>();
            for (const e of list) {
                mergeEffects(effects, this.effectsOf(e));
                siteConds.push(new Map(this.conditionsOf(e).map((c) => [c.at + ' ' + c.expr, c])));
                for (const {open, node} of this.tagOpens(e)) {
                    opens.set(open.kind + ':' + open.target, open);
                    if (node && !this.ix.isLibraryNode(node)) {
                        opTargets.set(open.target, node);
                    }
                }
                const menu = this.menuOpens(e);
                if (menu) {
                    // two menus can share a label (`menu`, when the id isn't a literal): one per place it is rendered
                    opens.set('menu:' + menu.open.target + '@' + menu.open.at, menu.open);
                    menuUsages.set(menu.open.target + '@' + menu.open.at, menu.usage);
                    menuSites.add(fileOf(e.site.at));
                }
                const ik = e.via.join(' < ');
                const inst = instances.get(ik) ?? {via: e.via, keySet: new Set<string>()};
                if (e.key !== null) {
                    inst.keySet.add(e.key);
                    keyValues.add(e.key);
                }
                instances.set(ik, inst);
                gaps.push(...gapsOf(e.value));
                if (!aria.role && e.landing.aria.role) {
                    aria = e.landing.aria;
                }
            }
            for (const o of effects.opens.values()) {
                if (o.node && !this.ix.isLibraryNode(o.node)) {
                    opTargets.set(o.target, o.node);
                    const k = o.kind + ':' + o.target + '@' + o.at;

                    // the menu component's own trigger opens the menu as a modal in mobile view (MenuModal)
                    const menuForm = o.kind === 'modal' && menuSites.has(fileOf(o.at));
                    opens.set(k, withDialogOps(opens.get(k), {kind: o.kind, target: o.target, at: o.at, ...(o.dialogOps ? {dialogOps: o.dialogOps} : {}), ...(menuForm ? {menuForm: true as const} : {})}));
                }
            }
            for (const nav of effects.navigates.values()) {
                // the same target from two places is one open, conditional only when both are
                const prev = opens.get('page:' + nav.target);
                if (prev) {
                    if (prev.conditional && !nav.conditional) {
                        delete prev.conditional;
                    }
                    continue;
                }
                const o: Open = {kind: 'page', target: nav.target, at: first.site.at, ...(nav.conditional ? {conditional: true as const} : {})};
                opens.set('page:' + nav.target, o);
                if (nav.expr) {
                    navigations.set(o, nav.expr);
                }
            }
            if (effects.unresolved.length) {
                unknownEffects.push({at: first.site.at, template, calls: [...new Set(effects.unresolved)].sort()});
            }
            const sitesAt = [...new Set(list.map((e) => e.site.at))];
            const el: Element = {
                template,
                grammar: valid,
                scope: valid ? parsed.scope : [],
                name: valid ? parsed.name : template,
                role: valid ? parsed.role : null,
                component: {name: first.site.ownerName, at: first.site.at},
                instances: [...instances.values()].
                    map((i) => ({via: i.via, ...(i.keySet.size ? {keySet: [...i.keySet].sort()} : {})})).
                    sort((a, b) => cmpLocs(a.via, b.via)),
                aria: {...aria, state: [...new Set(aria.state)].sort()},
            };
            if (sitesAt.length > 1) {
                el.alsoAt = sitesAt.slice(1);
            }
            if (valid && parsed.hasKey) {
                el.key = keyInfo(keyValues, gaps);
            }
            if (opens.size) {
                el.opens = [...opens.values()].sort((a, b) => cmp(a.kind + a.target, b.kind + b.target));
            }
            if (effects.ops.size || effects.unresolved.length || effects.delegated.length) {
                el.effects = {
                    ops: [...effects.ops].sort(),
                    unknown: effects.unresolved.length > 0,
                    delegated: [...new Set(effects.delegated.map((d) => d.split(' ')[0]))].sort(),
                };
            }
            const conds = siteConds.reduce((all, here) => new Map([...all].filter(([k]) => here.has(k))));
            if (conds.size) {
                el.renderedWhen = [...conds.values()].sort((a, b) => cmpLoc(a.at ?? '', b.at ?? '') || cmp(a.expr, b.expr));
            }
            elements.push(el);
        }
        this.timings.analysis = Date.now() - t;

        // open targets: which testid scopes each opened component renders
        t = Date.now();
        this.anchorEmissions(emissions);
        const components = [...opTargets.entries()].map(([name, node]) => {
            const scopes = [...this.scopesOf(node)].sort();
            return {name, at: this.ix.where(node), scopes};
        }).sort((a, b) => cmp(a.name, b.name) || cmpLoc(a.at, b.at));

        // a component's own scopes (decided in its body) name it; without any, it has no name of its own (a scope
        // nested inside it, like a popover in its textbox, would be the wrong page object to return)
        const ownScopes = new Map([...opTargets.entries()].map(([name, node]) => [name, this.scopesDecidedIn(node)]));
        const scopeOfComponent = new Map([...ownScopes.entries()].map(([name, own]) => [name, own.length ? commonScope(own) : null]));

        // a modal opened with a testid in its dialogProps is named by that opener: the scopes of the elements whose
        // value flowed through this openModal call (one shared ConfirmModal, a different scope per opener)
        // (a role-less element is a container: its own testid is the scope, `….delete_modal` and not its parent)
        const scopesThrough = new Map<Loc, string[]>();
        for (const el of elements) {
            const scope = el.role === null ? [...el.scope, el.name] : el.scope;
            if (!scope.length) {
                continue;
            }
            for (const inst of el.instances) {
                for (const loc of inst.via) {
                    scopesThrough.set(loc, [...(scopesThrough.get(loc) ?? []), scope.join('.')]);
                }
            }
        }
        const menuScopes = new Map<string, Set<string>>();
        for (const [k, usage] of menuUsages) {
            const scopes = new Set<string>();
            const el = elementOf(usage);
            if (ts.isJsxElement(el)) {
                for (const child of el.children) {
                    for (const s of this.scopesOf(child, [], new Set(), true)) {
                        scopes.add(s);
                    }
                }
            }
            menuScopes.set(k, scopes);
        }
        for (const el of elements) {
            for (const o of el.opens ?? []) {
                const through = o.kind === 'modal' ? scopesThrough.get(o.at) : undefined;
                let s: string | null | undefined;
                if (o.kind === 'menu') {
                    s = menuScopeFor(menuScopes.get(o.target + '@' + o.at), el.scope.join('.'));
                } else if (o.kind === 'panel') {
                    // named below, once every element's opens are known
                    continue;
                } else {
                    // what flowed through this opener may be only part of the modal (a tab key in dialogProps): widen it
                    // to the shortest of the modal's own scopes that contains it
                    const narrow = through?.length ? commonScope(through) : null;
                    const wider = narrow ? (ownScopes.get(o.target) ?? []).filter((w) => narrow === w || narrow.startsWith(w + '.')) : [];
                    s = narrow ? wider.sort((a, b) => a.length - b.length)[0] ?? narrow : scopeOfComponent.get(o.target);
                }
                if (s) {
                    o.scope = s;
                }
            }

            // the same component opened at several places onto one scope is one open (callbacks merged)
            if (el.opens?.length) {
                const merged = new Map<string, Open>();
                for (const o of el.opens) {
                    const k = `${o.kind}:${o.target}:${o.scope ?? '@' + o.at}`;
                    merged.set(k, withDialogOps(merged.get(k), o));
                }
                el.opens = [...merged.values()];
            }
        }

        // a panel the store shows is named by its own scopes, else by the scope most of the shallowest testids it
        // renders nest under (its header one component down, not a popover in a member row three levels down)
        // A panel renders its own container: an element whose testid is exactly that scope (`rhs.channel_info`). What
        // a constant gates without one (a date separator or result row a search tab shows) isn't a panel the click opens.
        const containers = new Map<string, Set<string>>();
        for (const el of elements) {
            if (el.grammar && !el.role && !el.key) {
                const set = containers.get(el.template) ?? new Set<string>();
                set.add(el.component.name);
                containers.set(el.template, set);
            }
        }
        for (const el of elements) {
            if (!el.opens?.length) {
                continue;
            }
            el.opens = el.opens.filter((o) => {
                if (o.kind !== 'panel') {
                    return true;
                }
                const node = opTargets.get(o.target);
                const depths = node ? this.scopeDepths(node) : new Map<string, number>();
                const top = Math.min(...depths.values());
                const s = scopeOfComponent.get(o.target) ?? dominantScope([...depths].filter(([, d]) => d === top).map(([sc]) => sc));
                if (!s || !containers.has(s) || !depths.has(s)) {
                    return false;
                }
                o.scope = s;
                return true;
            });
            if (!el.opens.length) {
                delete el.opens;
            }
        }
        this.addNestedScopes(elements, byTemplate);
        this.timings.scopes = Date.now() - t;

        t = Date.now();
        const pages = buildPages(discoverRoutes(this.ix, this.R), this.ix, (n) => this.scopesRenderedBy(n), this.config.pageNames, this.config.pageParams);
        for (const [cls, ready] of Object.entries(this.config.pageReady)) {
            const page = pages.find((p) => p.class === cls);
            if (!page) {
                this.diag('pages', 'error', relativeToRoot(this.config, this.config.configPath), `pageReady names ${cls}, which isn't a page.`);
                continue;
            }

            // an element of its own (a scope can be only a prefix), rendered under the page
            const missing = ready.filter((r) => !elements.some((e) => e.template === r && !e.key && (page.scopes.includes(r) || page.scopes.includes(e.scope.join('.')))));
            if (missing.length) {
                this.diag('pages', 'error', page.component.at, `pageReady for ${cls} names ${missing.map((r) => `\`${r}\``).join(', ')}, which the page doesn't render as an element.`, 'Name a testid the page renders, whose element is its own (not only a scope prefix).');
                continue;
            }
            page.ready = ready;
        }
        for (const [o, expr] of navigations) {
            const vals = this.R.resolve(expr);
            const cut = vals.find((v) => v.k === 'unres' && v.why === TOO_MANY_VALUES);
            if (cut?.k === 'unres') {
                // some targets were left out: the page can't be told from the rest
                this.diag('truncated', 'warning', o.at, `A navigation to ${o.target} can go to more than ${MAX_TEMPLATE_VALUES} paths (${cut.at}); the scan keeps only some, so its page is unknown.`, 'Build the path from fewer lists, or navigate through a route helper with typed params.');
                continue;
            }
            const page = pageOf(vals, pages);
            if (page) {
                o.page = page;
            }
        }
        this.timings.pages = Date.now() - t;

        addForms(elements);
        const sets = fixedSets(elements);
        this.addDeclaredEffects(elements);
        const usedOps = new Set(elements.flatMap((e) => e.effects?.ops ?? []));
        const operations = [...usedOps].sort().map((id) => {
            const op = this.ops.byId.get(id)!;
            return {opId: op.opId, verb: op.verb, path: op.path, body: op.body, ...(op.bodyImports ? {bodyImports: op.bodyImports} : {}), inSpec: op.inSpec};
        });
        const specGaps = [...this.ops.byId.values()].filter((o) => !o.inSpec).map((o) => ({client: o.client, verb: o.verb, path: o.path})).sort((a, b) => cmp(a.client, b.client));

        elements.sort((a, b) => cmp(a.template, b.template));
        if (this.config.entries.length) {
            t = Date.now();
            this.markUnreachable(elements);
            this.timings.reachability = Date.now() - t;
        }
        if (this.ix.resolverError) {
            this.diag('input', 'warning', relativeToRoot(this.config, this.config.tsconfig), `The type checker failed on ${this.ix.stats.resolverErrors} symbol lookups (first: ${this.ix.resolverError}); what they name is left out of the scan.`, 'Check that the program type-checks (tsc) with the config\'s pathOverrides.');
        }
        const manifest: Manifest = {
            version: MANIFEST_VERSION,
            generatedFrom: {
                tsconfig: relativeToRoot(this.config, this.config.tsconfig),
                scope: this.config.include.map((d) => relativeToRoot(this.config, d)),
                ...(this.config.libraries.length ? {libraries: this.libraries()} : {}),
            },
            elements,
            sets,
            operations,
            pages,
            pluginSlots: this.pluginSlots(),
            ...(this.config.plugin ? {plugin: this.pluginInfo()} : {}),
            components,
        };
        const usageNodeAt = (loc: Loc) => {
            const u = this.usageByLoc.get(loc);
            return u ? usageAnchor(u) : undefined;
        };
        const published = publish(manifest, (loc) => this.ix.refOf(loc));
        return {manifest, published, stats: this.stats(sites, emissions, elements), sites, emissions, unknownEffects, specGaps, usageNodeAt, urlVersion: this.config.client?.urlVersion ?? null, diagnostics: this.diagnostics};
    }

    /** The configured component libraries as installed: version, and whether their parts were read. */
    private libraries(): NonNullable<Manifest['generatedFrom']['libraries']> {
        return this.config.libraries.map((lib) => {
            if (typeof lib !== 'string') {
                // parts from a file the config names: the file stands for the version
                return {package: lib.package, version: relativeToRoot(this.config, path.resolve(this.config.root, lib.parts)), parts: this.published.some((p) => p.package === lib.package)};
            }
            const dir = packageDir(this.config.root, lib);
            return {package: lib, version: dir ? installedVersion(dir) : 'not installed', parts: this.published.some((p) => p.package === lib)};
        });
    }

    /** The published slot contract: `export const X = {slot: 'template with {plugin}', …} as const`, and the registry methods that fill each slot. */
    private pluginSlots(): PluginSlot[] {
        const c = this.config.pluginSlots;
        if (!c) {
            return [];
        }
        const obj = this.ix.constObject(c.file, c.export);
        if (!obj) {
            this.diagnostics.push({rule: 'plugin-slots', severity: 'error', at: relativeToRoot(this.config, c.file), message: `No \`export const ${c.export} = {…}\` here (config pluginSlots).`});
            return [];
        }
        const registry = new Map<string, string[]>();
        if (c.registryExport) {
            const reg = this.ix.constObject(c.file, c.registryExport);
            if (!reg) {
                this.diagnostics.push({rule: 'plugin-slots', severity: 'error', at: relativeToRoot(this.config, c.file), message: `No \`export const ${c.registryExport} = {…}\` here (config pluginSlots.registryExport).`});
            }
            for (const p of reg?.properties ?? []) {
                const init = ts.isPropertyAssignment(p) ? strip(p.initializer) : undefined;
                if (ts.isPropertyAssignment(p) && init && ts.isArrayLiteralExpression(init)) {
                    registry.set(propName(p.name) ?? p.name.getText(), init.elements.filter(ts.isStringLiteralLike).map((m) => m.text).sort());
                }
            }
        }
        const out: PluginSlot[] = [];
        for (const p of obj.properties) {
            if (ts.isPropertyAssignment(p) && ts.isStringLiteralLike(p.initializer)) {
                const slot = propName(p.name) ?? p.name.getText();
                const methods = registry.get(slot);
                out.push({slot, template: p.initializer.text.replace('{plugin}', KEY_PLACEHOLDER), ...(methods ? {registry: methods} : {}), at: this.ix.where(p)});
            }
        }
        return out.sort((a, b) => cmp(a.slot, b.slot));
    }

    /**
     * Plugin mode: the host slots the plugin's registry calls fill (`registry.registerChannelHeaderMenuAction(…)`
     * fills `channel_header_menu_item`), from the registry methods each supported host's app map lists.
     */
    private pluginInfo(): PluginInfo {
        const plugin = this.config.plugin!;
        const slotsByMethod = new Map<string, Set<string>>();
        for (const host of plugin.hosts) {
            const read = readHostSlots(host.appMap, relativeToRoot(this.config, this.config.configPath));

            // (an unreadable host map is reported by the plugin-compat check)
            for (const s of 'slots' in read ? read.slots : []) {
                for (const m of s.registry ?? []) {
                    slotsByMethod.set(m, (slotsByMethod.get(m) ?? new Set()).add(s.slot));
                }
            }
        }
        const slotsUsed: PluginInfo['slotsUsed'] = [];

        // a registry call is a call on the registry's type (an untyped registry counts: nothing better is known)
        const onRegistry = (receiver: ts.Expression) => {
            const t = this.ix.checker.getNonNullableType(this.ix.checker.getTypeAtLocation(receiver));
            return Boolean(t.flags & ts.TypeFlags.Any) || (t.aliasSymbol ?? t.getSymbol())?.getName() === plugin.registryType;
        };
        const visit = (n: ts.Node) => {
            if (ts.isCallExpression(n) && ts.isPropertyAccessExpression(n.expression)) {
                const slots = slotsByMethod.get(n.expression.name.text);
                if (slots && onRegistry(n.expression.expression)) {
                    slotsUsed.push({method: n.expression.name.text, slots: [...slots].sort(), at: this.ix.where(n)});
                }
            }
            ts.forEachChild(n, visit);
        };
        for (const sf of this.ix.files) {
            visit(sf);
        }
        return {id: plugin.id, key: plugin.key, slotsUsed: slotsUsed.sort((a, b) => cmpLoc(a.at, b.at))};
    }

    private stats(sites: Site[], emissions: Emission[], elements: Element[]): ScanStats {
        const dom = sites.filter((s) => s.kind === 'dom');
        const resolvedSite = (s: Site) => {
            const real = s.values.filter((v) => v.k !== 'absent');
            return real.length > 0 && real.every((v) => (v.k === 'lit' || v.k === 'pat') && !isUnscoped(v));
        };
        const fromProps = dom.filter((s) => s.expr && this.usesProps(s.expr));
        const withEffects = elements.filter((e) => e.effects?.ops.length);
        return {
            ...this.ix.stats,
            timings: {...this.timings},
            sites: sites.length,
            domSites: dom.length,
            domResolved: dom.filter(resolvedSite).length,
            domFromProps: fromProps.length,
            domFromPropsResolved: fromProps.filter(resolvedSite).length,
            componentSites: sites.filter((s) => s.kind === 'component').length,
            forwardedComponentSites: sites.filter((s) => s.forwarded).length,
            objectSites: sites.filter((s) => s.kind === 'object').length,
            emissions: emissions.length,
            elements: elements.length,
            grammarElements: elements.filter((e) => e.grammar).length,
            elementsWithRole: elements.filter((e) => e.aria.role).length,
            elementsWithEffects: withEffects.length,
            elementsWithUnknownEffects: elements.filter((e) => e.effects?.unknown).length,
            elementsWithOpens: elements.filter((e) => e.opens?.length).length,
            elementsWithConditions: elements.filter((e) => e.renderedWhen?.length).length,

            // testid sites and navigations whose values were cut at a cap (`truncated` diagnostics)
            truncatedTestIdSites: sites.filter((s) => s.values.some(isTruncated)).length,
            truncatedValues: this.R.truncatedAt.size,
            ...this.ops.stats,
        };
    }

    private usesProps(e: ts.Expression): boolean {
        let found = false;
        const v = (n: ts.Node) => {
            if (!found && this.R.propsPath(n)) {
                found = true;
            }
            if (!found) {
                ts.forEachChild(n, v);
            }
        };
        v(e);
        return found;
    }
}

export const isUnscoped = (v: Value) => v.k === 'pat' && v.parts.length === 1 && typeof v.parts[0] !== 'string';

/** `channels/src/a.tsx:12` -> `channels/src/a.tsx`. */
const fileOf = fileOfLoc;

function usageAnchor(u: Usage): ts.Node {
    return isCallUsage(u) ? u.call : elementOf(u);
}

/** The JSX element (opening + children) for a tag. */
function elementOf(tag: JsxTag): ts.Node {
    return ts.isJsxOpeningElement(tag) ? tag.parent : tag;
}

function enclosingForm(tag: JsxTag): JsxTag | null {
    for (let p: ts.Node | undefined = tag.parent; p; p = p.parent) {
        if (ts.isJsxElement(p) && isIntrinsic(p.openingElement) && tagName(p.openingElement) === 'form') {
            return p.openingElement;
        }
        if (isFunctionLike(p)) {
            return null;
        }
    }
    return null;
}

/** The scope that most of `scopes` are, or nest under; null on a tie. */
export function dominantScope(scopes: string[]): string | null {
    const covered = (c: string) => scopes.filter((x) => x === c || x.startsWith(c + '.')).length;
    const ranked = scopes.map((c) => ({c, n: covered(c)})).sort((a, b) => b.n - a.n || a.c.length - b.c.length);
    if (!ranked.length || (ranked[1] && ranked[1].n === ranked[0].n && !ranked[1].c.startsWith(ranked[0].c + '.'))) {
        return null;
    }
    return ranked[0].c;
}

/** Longest common scope prefix of a set of scopes ("a.b.c", "a.b.d" -> "a.b"), else the most common top scope. */
export function commonScope(scopes: string[]): string | null {
    if (!scopes.length) {
        return null;
    }
    const parts = scopes.map((s) => s.split('.'));
    const prefix: string[] = [];
    for (let i = 0; ; i++) {
        const w = parts[0][i];
        if (w === undefined || !parts.every((p) => p[i] === w)) {
            break;
        }
        prefix.push(w);
    }
    if (prefix.length) {
        return prefix.join('.');
    }
    const counts = new Map<string, number>();
    for (const p of parts) {
        counts.set(p[0], (counts.get(p[0]) ?? 0) + 1);
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0][0];
}

function keyInfo(values: Set<string>, gaps: Gap[]): Element['key'] {
    const vals = [...values].sort();
    const kinds = new Set(gaps.map((g) => g.kind));
    if (!gaps.length || (kinds.size === 1 && kinds.has('set'))) {
        const all = [...new Set([...vals, ...gaps.flatMap((g) => g.values ?? [])])].sort();
        return {kind: 'set', type: all.map((v) => JSON.stringify(v)).join(' | ') || 'never', values: all};
    }
    const entity = gaps.find((g) => g.kind === 'entity');
    if (entity && gaps.every((g) => g.kind === 'entity' && g.entity === entity.entity && g.field === entity.field)) {
        return {kind: 'entity', entity: entity.entity, field: entity.field, ...(entity.module ? {module: entity.module} : {}), type: `Pick<${entity.entity}, '${entity.field}'>`, ...(vals.length ? {values: vals} : {})};
    }
    if (kinds.size === 1 && kinds.has('plugin')) {
        return {kind: 'plugin', type: 'PluginKey'};
    }
    if (kinds.size === 1 && kinds.has('setting')) {
        const local = [...new Set(gaps.flatMap((g) => g.values ?? []))].sort();
        const templates = [...new Set(gaps.flatMap((g) => g.templates ?? []))].sort();
        return {kind: 'setting', type: ['AdminSettingPath', ...local.map((v) => JSON.stringify(v)), ...templates].join(' | '), ...(local.length ? {values: local} : {})};
    }
    if (kinds.size === 1 && kinds.has('suggestion')) {
        return {kind: 'suggestion', type: 'string'};
    }
    if (kinds.size === 1 && kinds.has('text')) {
        return {kind: 'text', type: 'string'};
    }
    if (kinds.size === 1 && kinds.has('number')) {
        return {kind: 'number', type: 'number', ...(vals.length ? {values: vals} : {})};
    }
    return {kind: 'string', type: 'string', ...(vals.length ? {values: vals} : {})};
}

/** A scope with two or more value fields is a form: each field gets its value type. */
function addForms(elements: Element[]) {
    const byScope = new Map<string, Element[]>();
    for (const e of elements) {
        if (!e.grammar || e.key || !e.role || !ROLE_TABLE[e.role].value) {
            continue;
        }
        const s = e.scope.join('.');
        byScope.set(s, [...(byScope.get(s) ?? []), e]);
    }
    for (const [scope, fields] of byScope) {
        if (fields.length < 2) {
            continue;
        }

        // names shared by fields of different roles (a setting row's value is a text box, a spin button or a select):
        // each field takes its role too
        const shared = new Set(fields.map((f) => f.name).filter((n, i, all) => all.indexOf(n) !== i));
        for (const f of fields) {
            const field = shared.has(f.name) ? `${f.name}_${f.role}` : f.name;
            f.form = {scope, field, valueType: ROLE_TABLE[f.role!].value!};
        }
    }
}

/** Fixed key sets: one per keyed element with known key values (all of them, or the known part of an open key), named after its top scope and name. */
function fixedSets(elements: Element[]) {
    const sets = [];
    const used = new Set<string>();
    for (const e of [...elements].sort((a, b) => cmp(a.template, b.template))) {
        if (!e.grammar || !e.key || !(e.key.kind === 'set' || e.key.kind === 'string') || !e.key.values?.length) {
            continue;
        }
        let name = pascal(e.scope[0]) + pascal(e.name);
        for (let i = 1; used.has(name); i++) {
            name = pascal(e.scope.join('_')) + pascal(e.name) + (i > 1 ? String(i) : '');
        }
        used.add(name);
        e.key.set = name;
        sets.push({name, values: e.key.values, source: e.component.at});
    }
    return sets.sort((a, b) => cmp(a.name, b.name));
}

/** A part's suffix as values: `.close--button`, or `.tab:` + a typed key gap + `--tab`. */
function suffixValues(part: TestPart, expr: string): Value[] {
    const at = part.suffix.indexOf(KEY_PLACEHOLDER);
    if (at < 0) {
        return [lit(part.suffix)];
    }
    const type = part.key ?? 'string';
    const values = type.split(' | ').every((t) => (/^"[^"]*"$/).test(t)) ? type.split(' | ').map((t) => JSON.parse(t) as string) : null;
    let kind: Gap['kind'] = 'string';
    if (values) {
        kind = 'set';
    } else if (type === 'number') {
        kind = 'number';
    }
    const gap: Gap = {kind, type, expr: `${expr}${part.suffix.slice(0, at)}`, ...(values ? {values} : {})};
    return [{k: 'pat', parts: [part.suffix.slice(0, at), {gap}, part.suffix.slice(at + KEY_PLACEHOLDER.length)]}];
}

/**
 * The old widgets/menu: `<MenuWrapper>{trigger}<Menu>…items…</Menu></MenuWrapper>`. A trigger (an element in the
 * wrapper, outside its Menu) opens that Menu; returns the Menu's tag.
 */
function wrapperMenu(anchor: ts.Node): JsxTag | null {
    for (let p = anchor.parent; p && !isFunctionLike(p); p = p.parent) {
        if (!ts.isJsxElement(p) || !(/(^|\.)MenuWrapper$/).test(tagName(p.openingElement))) {
            continue;
        }
        const menu = p.children.find((c): c is ts.JsxElement => ts.isJsxElement(c) && (/(^|\.)Menu$/).test(tagName(c.openingElement)));
        if (!menu || (anchor.pos >= menu.pos && anchor.end <= menu.end)) {
            return null;
        }
        return menu.openingElement;
    }
    return null;
}

/**
 * The scope of the menu a trigger opens: the common scope of the menu's items, preferring the items under
 * the trigger's own scope (a shared selector at `search_box.team_selector` and `search.team_selector`
 * renders each instance's items under its own scope).
 */
function menuScopeFor(scopes: Set<string> | undefined, triggerScope: string): string | null {
    if (!scopes?.size) {
        return null;
    }
    const own = triggerScope ? [...scopes].filter((s) => s === triggerScope || s.startsWith(triggerScope + '.')) : [];
    if (own.length) {
        return commonScope(own);
    }

    // items beside the trigger (`lhs.header.open--button` opens `lhs.browse_or_add_menu`): a child from elsewhere,
    // like a tour tip in an item, shouldn't widen the menu's scope
    const root = triggerScope.split('.')[0];
    const sameRoot = root ? [...scopes].filter((s) => s === root || s.startsWith(root + '.')) : [];
    return commonScope(sameRoot.length ? sameRoot : [...scopes]);
}

/** The variables a JSX child can render: `x`, both arms of `c ? x : y`, the value side of `c && x`, `x || y`, `x ?? y`. */
function pickedIdentifiers(e: ts.Expression): ts.Identifier[] {
    const s = strip(e) as ts.Expression;
    if (ts.isIdentifier(s)) {
        return [s];
    }
    if (ts.isConditionalExpression(s)) {
        return [...pickedIdentifiers(s.whenTrue), ...pickedIdentifiers(s.whenFalse)];
    }
    if (ts.isBinaryExpression(s)) {
        const op = s.operatorToken.kind;
        if (op === ts.SyntaxKind.AmpersandAmpersandToken) {
            return pickedIdentifiers(s.right);
        }
        if (op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken) {
            return [...pickedIdentifiers(s.left), ...pickedIdentifiers(s.right)];
        }
    }
    return [];
}

/** Whether an expression sits in a JSX child position (`{…}` between tags), not in an attribute. */
function inJsxChildren(n: ts.Node): boolean {
    for (let p = n.parent; p; p = p.parent) {
        if (ts.isJsxAttribute(p) || ts.isJsxSpreadAttribute(p)) {
            return false;
        }
        if (ts.isJsxExpression(p)) {
            return ts.isJsxElement(p.parent) || ts.isJsxFragment(p.parent);
        }
        if (ts.isSourceFile(p) || ts.isFunctionDeclaration(p) || ts.isClassLike(p)) {
            return false;
        }
    }
    return false;
}

const FALSY_LITERALS = new Set(['', 'false', '0', 'null', 'undefined']);

/** A statement that always leaves the function: `return …`, `throw …`, or a block ending in one. */
function alwaysReturns(st: ts.Statement): boolean {
    if (ts.isReturnStatement(st) || ts.isThrowStatement(st)) {
        return true;
    }
    return ts.isBlock(st) && st.statements.length > 0 && alwaysReturns(st.statements[st.statements.length - 1]);
}

export type HostSlot = {slot: string; testId: string; registry?: string[]};

/** The plugin slots a host's `app-map.json` publishes, or why it can't be read (missing, corrupt, another format version). */
export function readHostSlots(appMap: string, configAt: string): {slots: HostSlot[]} | {diagnostic: Diagnostic} {
    const read = readVersioned<{version: number; pluginSlots?: HostSlot[]}>(appMap, APP_MAP_VERSION, `Host app-map.json ${appMap}`, configAt);
    return 'value' in read ? {slots: read.value.pluginSlots ?? []} : read;
}

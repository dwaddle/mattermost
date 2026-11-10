// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import ts from 'typescript';

import {attrValue, isIntrinsic, jsxAttr, tagName, type JsxTag} from './ast.ts';
import {MAX_LANDING_HOPS, MAX_STYLED_HOPS} from './limits.ts';
import {publishedComponent, type PublishedParts} from './parts.ts';
import {styledTarget, type Loc, type ProgramIndex} from './program_index.ts';
import type {Resolver, Value} from './values.ts';

export type Aria = {role: string | null; native: boolean; state: string[]};

/** Roles rendered by library components (not in the scanned program). Matched on the declaring file and export name. */
export type LibraryRole = {module: RegExp; name: string; role: string | null};

export const LIBRARY_ROLES: LibraryRole[] = [

    // @mattermost/compass-ui without test-parts.json (alpha.25 and older; MenuItem renders no role of its own).
    // A library listed in `libraries` that ships test-parts.json takes its roles from there instead.
    ...([
        ['Button', 'button'], ['IconButton', 'button'], ['Switch', 'switch'], ['Checkbox', 'checkbox'], ['Radio', 'radio'],
        ['TextInput', 'textbox'], ['TextArea', 'textbox'], ['Select', 'combobox'], ['Combobox', 'combobox'],
        ['Tabs', 'tablist'], ['Tab', 'tab'], ['Modal', 'dialog'], ['Toast', 'status'], ['MenuItem', null], ['Link', 'link'],

        // added by alpha.25
        ['CardButton', 'button'], ['TileButton', 'button'], ['EmojiButton', 'button'], ['ReactionButton', 'button'],
        ['PasswordInput', 'textbox'], ['SearchInput', 'searchbox'],

        // containers whose on* props belong to built-in controls (AdminPanel's header switch, SectionNotice's
        // buttons), so the container itself isn't the control
        ['AdminPanel', 'region'], ['SectionNotice', 'region'],
    ] as const).map(([name, role]) => ({module: /node_modules\/@mattermost\/compass-ui\//, name, role})),
    {module: /node_modules\/@mui\/material\//, name: 'MenuItem', role: 'menuitem'},
    {module: /node_modules\/@mui\/material\//, name: 'MenuList', role: 'menu'},
    {module: /node_modules\/@mui\/material\//, name: 'Button', role: 'button'},
    {module: /node_modules\/@mui\/material\//, name: 'Tab', role: 'tab'},
    {module: /node_modules\/react-select\//, name: 'Input', role: 'combobox'}, // the search input; Select gives it role='combobox'
    {module: /node_modules\/react-bootstrap\//, name: 'Modal', role: 'dialog'},
    {module: /node_modules\/react-bootstrap\//, name: 'Button', role: 'button'},
    {module: /node_modules\/(@types\/)?react-router(-dom)?\//, name: 'Link', role: 'link'},
    {module: /node_modules\/(@types\/)?react-router(-dom)?\//, name: 'NavLink', role: 'link'},
];

const INPUT_ROLES: Record<string, string | null> = {
    checkbox: 'checkbox',
    radio: 'radio',
    text: 'textbox',
    email: 'textbox',
    password: 'textbox',
    tel: 'textbox',
    url: 'textbox',
    search: 'searchbox',
    number: 'spinbutton',
    range: 'slider',
    submit: 'button',
    button: 'button',
    reset: 'button',
    file: null,
    hidden: null,
    date: 'textbox',
    time: 'textbox',
    color: null,
};

const TAG_ROLES: Record<string, string> = {
    textarea: 'textbox',
    select: 'combobox',
    img: 'img',
    ul: 'list',
    ol: 'list',
    li: 'listitem',
    tr: 'row',
    td: 'cell',
    th: 'columnheader',
    table: 'table',
    dialog: 'dialog',
    option: 'option',
    nav: 'navigation',
    form: 'form',
    progress: 'progressbar',
};

const STATE_ATTRS = ['aria-checked', 'aria-pressed', 'aria-selected', 'aria-expanded', 'aria-disabled', 'disabled', 'checked', 'value'];

export const INTERACTIVE_HANDLER = /^on(Click|Change|KeyDown|KeyUp|KeyPress|Submit|MouseDown|MouseUp|Input)$/;

export class Roles {
    private readonly ix: ProgramIndex;
    private readonly R: Resolver;
    private readonly published: PublishedParts[];

    constructor(ix: ProgramIndex, R: Resolver, published: PublishedParts[] = []) {
        this.ix = ix;
        this.R = R;
        this.published = published;
    }

    /** Literal values of an attribute at a tag, restricted to an instance's usage chain when given. */
    attrLiterals(tag: JsxTag, name: string, via?: Loc[]): string[] | null {
        const a = jsxAttr(tag, name);
        if (!a) {
            return null;
        }
        if (!a.initializer) {
            return ['true'];
        }
        const vals = this.R.resolveIn(attrValue(a), via).filter((v) => v.k === 'lit' && compatible(v, via));
        return vals.map((v) => (v as {s: string}).s);
    }

    /** Implicit ARIA role of a tag known only by its text (markup written as a string): an `<a>` is a link when it has an href. */
    ofTagName(name: string, attrs = ''): Aria {
        if (name === 'a') {
            return {role: (/\bhref=/).test(attrs) ? 'link' : null, native: true, state: []};
        }
        return {role: TAG_ROLES[name] ?? null, native: name in TAG_ROLES, state: []};
    }

    /** ARIA role of an intrinsic element: explicit role, aria-pressed toggle, or the tag's implicit role. */
    ofIntrinsic(tag: JsxTag, via?: Loc[], element?: string): Aria {
        const name = element ?? tagName(tag);
        const state = STATE_ATTRS.filter((s) => jsxAttr(tag, s));
        const explicit = this.attrLiterals(tag, 'role', via);
        if (explicit && explicit.length) {
            return {role: explicit[0], native: false, state};
        }

        // `role={role}` that this instance doesn't pass: the element keeps its implicit role
        const roleAttr = jsxAttr(tag, 'role');
        if (roleAttr && !this.R.resolveIn(attrValue(roleAttr), via).every((v) => v.k === 'absent')) {
            return {role: null, native: false, state};
        }
        if (name === 'button') {
            return {role: jsxAttr(tag, 'aria-pressed') ? 'togglebutton' : 'button', native: true, state};
        }
        if (name === 'a') {
            return {role: jsxAttr(tag, 'href') ? 'link' : null, native: true, state};
        }
        if (name === 'input') {
            const t = this.attrLiterals(tag, 'type', via)?.[0] ?? 'text';
            return {role: t in INPUT_ROLES ? INPUT_ROLES[t] : 'textbox', native: true, state};
        }

        // `contentEditable={false}` marks a part an editor can't edit (a token chip inside it), not a textbox
        const editable = jsxAttr(tag, 'contentEditable') ?? jsxAttr(tag, 'contenteditable');
        if (editable && attrValue(editable)?.kind !== ts.SyntaxKind.FalseKeyword) {
            return {role: 'textbox', native: false, state};
        }
        if ((/^h[1-6]$/).test(name)) {
            return {role: 'heading', native: true, state};
        }
        return {role: TAG_ROLES[name] ?? null, native: name in TAG_ROLES, state};
    }

    /**
     * The symbol a tag name stands for, through import aliases and `const X = styled(LibraryComponent)\`…\``
     * wrappers, so a styled compass Button still finds its row in the library table.
     */
    private librarySymbol(name: ts.Expression, depth = 0): ts.Symbol | undefined {
        let sym = this.ix.checker.getSymbolAtLocation(name);
        if (sym && (sym.flags & ts.SymbolFlags.Alias)) {
            try {
                sym = this.ix.checker.getAliasedSymbol(sym);
            } catch {
                return undefined;
            }
        }
        const decl = sym?.declarations?.[0];
        if (depth < MAX_STYLED_HOPS && decl && ts.isVariableDeclaration(decl) && decl.initializer) {
            const init = decl.initializer;
            const wrapped = styledTarget(ts.isTaggedTemplateExpression(init) ? init.tag : init);
            if (wrapped && (ts.isIdentifier(wrapped) || ts.isPropertyAccessExpression(wrapped))) {
                return this.librarySymbol(wrapped, depth + 1);
            }
        }
        return sym;
    }

    /** Role of a library component tag, from the library table or an explicit role prop. */
    ofLibrary(tag: JsxTag, via?: Loc[]): Aria | null {
        const explicit = this.attrLiterals(tag, 'role', via);
        const state = STATE_ATTRS.filter((s) => jsxAttr(tag, s));
        if (explicit && explicit.length) {
            return {role: explicit[0], native: false, state};
        }

        // styled-components: `const Close = styled.button\`…\``; `<Close>` is a <button>, and
        // `<Wrapper as={onClick ? 'button' : 'div'}>` is the element `as` names for this instance
        const styledAs = styledElement(this.ix, tag);
        if (styledAs) {
            const as = [...new Set(this.attrLiterals(tag, 'as', via) ?? [])];
            return this.ofIntrinsic(tag, via, as.length === 1 && (/^[a-z][a-z0-9]*$/).test(as[0]) ? as[0] : styledAs);
        }

        // a library that publishes test-parts.json says where data-testid lands
        const pub = publishedComponent(this.ix, tag, this.published);
        if (pub) {
            return {role: pub.component?.role ?? null, native: false, state};
        }
        const sym = this.librarySymbol(tag.tagName as ts.Expression);
        const file = sym?.declarations?.[0]?.getSourceFile().fileName.split(path.sep).join('/');
        const last = tagName(tag).split('.').pop()!;
        const hit = file ? LIBRARY_ROLES.find((r) => r.module.test(file) && (r.name === last || r.name === sym!.getName())) : undefined;
        return hit ? {role: hit.role, native: false, state} : null;
    }

    /** Whether an intrinsic element is something a user operates. */
    isInteractive(tag: JsxTag): boolean {
        const name = isIntrinsic(tag) ? tagName(tag) : styledElement(this.ix, tag);
        if (!name) {
            return false;
        }
        if (['button', 'a', 'input', 'select', 'textarea'].includes(name)) {
            return true;
        }
        return tag.attributes.properties.some((a) => ts.isJsxAttribute(a) && INTERACTIVE_HANDLER.test(a.name.getText()));
    }
}

/** A value applies to an instance when one usage chain is a prefix of the other (they flowed through the same usages). */
export function compatible(v: Value, via?: Loc[]): boolean {
    if (!via || !v.via) {
        return true;
    }
    const n = Math.min(via.length, v.via.length);
    for (let i = 0; i < n; i++) {
        if (via[i] !== v.via[i]) {
            return false;
        }
    }
    return true;
}

/**
 * The element a styled-components tag renders: `styled.button\`…\``, `styled.button.attrs(…)\`…\``,
 * `styled('button')\`…\``, and `styled(Other)\`…\`` where `Other` is one of those. Null for anything else
 * (including `styled(Component)`).
 */
export function styledElement(ix: ProgramIndex, tag: JsxTag): string | null {
    if (isIntrinsic(tag) || ts.isJsxNamespacedName(tag.tagName)) {
        return null;
    }
    return styledElementOf(ix, ts.isPropertyAccessExpression(tag.tagName) ? tag.tagName.name : tag.tagName, 0);
}

function styledElementOf(ix: ProgramIndex, ref: ts.Expression, hops: number): string | null {
    if (hops > MAX_STYLED_HOPS) {
        return null;
    }
    let sym = ix.checker.getSymbolAtLocation(ref);
    if (sym && (sym.flags & ts.SymbolFlags.Alias)) {
        try {
            sym = ix.checker.getAliasedSymbol(sym);
        } catch {
            return null;
        }
    }
    const d = sym?.valueDeclaration;
    let e: ts.Expression | undefined = d && ts.isVariableDeclaration(d) ? d.initializer : undefined;
    if (e && ts.isTaggedTemplateExpression(e)) {
        e = e.tag;
    } else if (e && ts.isCallExpression(e)) {
        e = e.expression;
    } else {
        return null;
    }
    for (let depth = 0; e && depth < MAX_LANDING_HOPS; depth++) {
        if (ts.isPropertyAccessExpression(e)) {
            if (ts.isIdentifier(e.expression) && e.expression.text === 'styled') {
                return e.name.text;
            }
            e = e.expression;
        } else if (ts.isCallExpression(e)) {
            const callee: ts.Expression = e.expression;
            if (ts.isIdentifier(callee) && callee.text === 'styled') {
                const a = e.arguments[0];
                if (a && ts.isStringLiteralLike(a)) {
                    return a.text;
                }
                return a && ts.isIdentifier(a) ? styledElementOf(ix, a, hops + 1) : null;
            }
            e = callee;
        } else {
            return null;
        }
    }
    return null;
}


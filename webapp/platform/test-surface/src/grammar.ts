// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * The testid grammar:
 *
 *     testid  := path [ ":" KEY ] [ "--" ROLE ]
 *     path    := WORD ( "." WORD )*        ; leading WORDs = scope, last WORD = name
 *     WORD    := [a-z][a-z0-9_]*
 *
 * KEY is runtime data, written in source as `:${expr}` and normalized to `{key}` in the manifest.
 * ROLE is an ARIA role name or one of the pseudo-roles below; no role means a container.
 */

export const ROLES = [
    'button',
    'link',
    'textbox',
    'searchbox',
    'checkbox',
    'switch',
    'radio',
    'radiogroup',
    'combobox',
    'listbox',
    'option',
    'tab',
    'tablist',
    'tabpanel',
    'menu',
    'menuitem',
    'menuitemcheckbox',
    'menuitemradio',
    'dialog',
    'alertdialog',
    'slider',
    'spinbutton',
    'togglebutton',
    'text',
    'img',
    'list',
    'listitem',
    'row',
    'grid',
    'gridcell',
    'status',
    'alert',
    'tooltip',
    'region',
    'separator',
] as const;
export type Role = typeof ROLES[number];

export const KEY_PLACEHOLDER = '{key}';

const WORD = /^[a-z][a-z0-9_]*$/;
const ROLE_SET = new Set<string>(ROLES);

export type ParsedTestId = {
    scope: string[];
    name: string;
    hasKey: boolean;

    /** The literal key, when the testid was written with one (not a placeholder). */
    key: string | null;
    role: Role | null;
};

export type GrammarError = {rule: 'grammar' | 'unscoped'; message: string; fix: string};

/**
 * Parses a testid or template (`{key}` stands for runtime data). Returns the parse or the
 * first rule it breaks, with a suggested fix.
 */
export function parseTestId(id: string): ParsedTestId | GrammarError {
    let rest = id;
    let role: Role | null = null;
    const dash = rest.lastIndexOf('--');
    if (dash >= 0) {
        const r = rest.slice(dash + 2);
        if (!ROLE_SET.has(r)) {
            return {rule: 'grammar', message: `"${id}" has an unknown role "--${r}".`, fix: `Use one of: ${ROLES.join(', ')}.`};
        }
        role = r as Role;
        rest = rest.slice(0, dash);
    }
    if (rest.includes('--')) {
        return {rule: 'grammar', message: `"${id}" contains "--" before its role.`, fix: 'Only the role suffix may follow "--". Inside names use "_".'};
    }
    let key: string | null = null;
    let hasKey = false;
    const colon = rest.indexOf(':');
    if (colon >= 0) {
        key = rest.slice(colon + 1);
        rest = rest.slice(0, colon);
        hasKey = true;
        if (!key.length) {
            // eslint-disable-next-line no-template-curly-in-string
            return {rule: 'grammar', message: `"${id}" has an empty key after ":".`, fix: 'Write the key as `:${value}` or drop the ":".'};
        }
        if (key !== KEY_PLACEHOLDER && (/[.:]/).test(key)) {
            return {rule: 'grammar', message: `"${id}" has a key containing "." or ":".`, fix: 'Keys may not contain ".", ":" or "--" (normalize, e.g. dots to underscores).'};
        }
        if (key.includes(KEY_PLACEHOLDER)) {
            key = null;
        }
    }
    if (rest.includes(KEY_PLACEHOLDER)) {
        // eslint-disable-next-line no-template-curly-in-string
        return {rule: 'grammar', message: `"${id}" has runtime data outside the key.`, fix: 'Only the last word may carry runtime data, after ":" (`name:${value}`).'};
    }
    const words = rest.split('.');
    for (const w of words) {
        if (!WORD.test(w)) {
            const hint = w ? toWord(w) : '';
            return {
                rule: 'grammar',
                message: `"${id}" has the word "${w}", which is not lower_snake_case.`,
                fix: hint && hint !== w ? `Words match [a-z][a-z0-9_]*, e.g. "${hint}".` : 'Words match [a-z][a-z0-9_]*.',
            };
        }
    }

    // a bare word is only allowed as a scope root container (no key, no role): `channel_settings_modal`
    if (words.length < 2 && (role || hasKey)) {
        return {rule: 'unscoped', message: `"${id}" has no scope.`, fix: 'Prefix it with where it lives, e.g. "channel_header.menu.' + toWord(words[0]) + '".'};
    }
    return {scope: words.slice(0, -1), name: words[words.length - 1], hasKey, key, role};
}

export function isGrammarError(p: ParsedTestId | GrammarError): p is GrammarError {
    return 'rule' in p;
}

/** Formats a parse back into a template. */
export function formatTestId(p: Pick<ParsedTestId, 'scope' | 'name' | 'hasKey' | 'role'>): string {
    return [...p.scope, p.name].join('.') + (p.hasKey ? ':' + KEY_PLACEHOLDER : '') + (p.role ? '--' + p.role : '');
}

/** camelCase/kebab/PascalCase -> snake_case word. */
export function toWord(s: string): string {
    return s.
        replace(/([a-z0-9])([A-Z])/g, '$1_$2').
        replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2').
        replace(/[^A-Za-z0-9]+/g, '_').
        replace(/^_+|_+$/g, '').
        toLowerCase().
        replace(/^([0-9])/, 'n$1');
}

/** Normalizes a runtime value for use as a key (plugin ids: dots to underscores). */
export function normalizeKey(value: string): string {
    return value.replace(/[.:]/g, '_').replace(/--+/g, '_');
}

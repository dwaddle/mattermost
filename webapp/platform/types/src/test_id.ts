// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * The testid grammar, defined once. The webapp's components (through `@mattermost/shared/utils/test_id`), the
 * testid lint rules, the test-surface scanner and the Playwright runtime all import it from here:
 *
 *     testid  := path [ ":" KEY ] [ "--" ROLE ]
 *     path    := WORD ( "." WORD )*        leading WORDs = scope, last WORD = name
 *     WORD    := [a-z][a-z0-9_]*
 *
 * Node tools load the built package (`lib/`): after changing this file, rebuild it (`npm run build` in
 * `platform/types`) before running them.
 */

/** ARIA role suffixes a testid can end with (`--button`). `text` marks read-only content. */
export const TEST_ID_ROLES = [
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

export type TestIdRole = typeof TEST_ID_ROLES[number];

const ROLE_SET = new Set<string>(TEST_ID_ROLES);

/** A word of a testid's path: lower_snake_case. */
export const TEST_ID_WORD = /^[a-z][a-z0-9_]*$/;

/** A testid that follows the grammar, split into its parts. */
export type TestIdParts = {
    scope: string[];
    name: string;
    hasKey: boolean;

    /** The literal key, or null when there is none or runtime data fills it. */
    key: string | null;
    role: TestIdRole | null;

    /** The testid continues a path composed at runtime (`${testId}.close--button`). */
    composed: boolean;
};

/** The first rule a testid breaks. Each tool words its own message. */
export type TestIdProblem =
    | {problem: 'unknown_role'; role: string} |
    {problem: 'dashes_before_role'} |
    {problem: 'empty_key'} |
    {problem: 'key_characters'} |
    {problem: 'data_outside_key'} |
    {problem: 'composed_without_dot'} |
    {problem: 'word'; word: string} |
    {problem: 'unscoped'; word: string};

/**
 * Where runtime data sits in a template: `key` stands for data (it may only fill the key), and `prefix`, at the
 * very start, for a path composed at runtime (`${testId}.close--button`).
 */
export type TestIdMarks = {key: string; prefix?: string};

/** Parses a testid, or a template with runtime data marked, into its parts or the first rule it breaks. */
export function parseTestId(text: string, marks: TestIdMarks): TestIdParts | TestIdProblem {
    let rest = text;
    let role: TestIdRole | null = null;
    const dash = rest.lastIndexOf('--');
    if (dash >= 0) {
        const r = rest.slice(dash + 2);
        if (!ROLE_SET.has(r)) {
            return {problem: 'unknown_role', role: r};
        }
        role = r as TestIdRole;
        rest = rest.slice(0, dash);
    }
    if (rest.includes('--')) {
        return {problem: 'dashes_before_role'};
    }

    let key: string | null = null;
    let hasKey = false;
    const colon = rest.indexOf(':');
    if (colon >= 0) {
        key = rest.slice(colon + 1);
        rest = rest.slice(0, colon);
        hasKey = true;
        if (!key.length) {
            return {problem: 'empty_key'};
        }
        if ((/[.:]/).test(key.split(marks.key).join(''))) {
            return {problem: 'key_characters'};
        }
        if (key.includes(marks.key)) {
            key = null;
        }
    }
    if (rest.includes(marks.key)) {
        return {problem: 'data_outside_key'};
    }

    let composed = false;
    if (marks.prefix && rest.startsWith(marks.prefix)) {
        composed = true;
        rest = rest.slice(marks.prefix.length);
        if (rest === '') {
            return {scope: [], name: '', hasKey, key, role, composed};
        }
        if (!rest.startsWith('.')) {
            return {problem: 'composed_without_dot'};
        }
        rest = rest.slice(1);
    }
    if (marks.prefix && rest.includes(marks.prefix)) {
        return {problem: 'data_outside_key'};
    }

    const words = rest.split('.');
    const bad = words.find((w) => !TEST_ID_WORD.test(w));
    if (bad !== undefined) {
        return {problem: 'word', word: bad};
    }

    // a bare word is only allowed as a scope root container (no key, no role): `channel_settings_modal`
    if (!composed && words.length < 2 && (role || hasKey)) {
        return {problem: 'unscoped', word: words[0]};
    }
    return {scope: words.slice(0, -1), name: words[words.length - 1], hasKey, key, role, composed};
}

export function isTestIdProblem(p: TestIdParts | TestIdProblem): p is TestIdProblem {
    return 'problem' in p;
}

/**
 * A plugin id as a testid key: `com.mattermost.calls` -> `com_mattermost_calls` (keys can't contain
 * `.`, `:` or `--`). The scanner types keys of this type as the plugin keys of installed test packages.
 */
export type PluginTestKey = string & {readonly __pluginTestKey: true};

export function pluginTestKey(pluginId: string): PluginTestKey {
    return pluginId.toLowerCase().replace(/[^a-z0-9_]/g, '_') as PluginTestKey;
}

/**
 * A config setting's path as a testid key: `ServiceSettings.SiteURL` -> `ServiceSettings_SiteURL` (keys can't
 * contain `.`, `:` or `--`). The admin console's settings are `admin.setting:<settingTestKey(path)>`; the scanner
 * types keys of this type as config paths, and the generated page objects take the path.
 */
export type SettingTestKey = string & {readonly __settingTestKey: true};

export function settingTestKey(path: string): SettingTestKey {
    return path.replace(/[.:]/g, '_').replace(/-{2,}/g, '-') as SettingTestKey;
}

/**
 * An autocomplete suggestion's term as a testid key: `@john.doe` -> `john_doe`, `~town-square` -> `town-square`,
 * `:smile:` -> `smile` (the sigil goes; keys can't contain `.`, `:` or `--`). Suggestion lists reorder as you type,
 * so items are keyed by what they suggest, not by position. The scanner types keys of this type as terms, and the
 * generated page objects take the term (a username, a channel name).
 */
export type SuggestionTestKey = string & {readonly __suggestionTestKey: true};

export function suggestionTestKey(term: string): SuggestionTestKey {
    return term.trim().replace(/^[@~/:]/, '').replace(/:$/, '').replace(/[.:]/g, '_').replace(/-{2,}/g, '-') as SuggestionTestKey;
}

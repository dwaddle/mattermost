// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * A testid path without its role: lowercase words joined by dots, scope first and name last
 * (`channel_header.menu.leave_channel`), optionally keyed on the last word
 * (`lhs.channel_list.channel:${channel.name}`).
 *
 * Components that take a `testId` prop type it as `TestId` and render
 * `data-testid={`${testId}--${role}`}`, deriving their parts from it (`${testId}.close--button`).
 * The test-surface scanner reads these to generate the typed Playwright page objects.
 */
export type TestId = `${Lowercase<string>}.${string}`;

/**
 * A testid scope: a `TestId`, or a single word naming a scope root container (a modal, a page region:
 * `channel_settings_modal`). Props that receive a scope for their parts take this type.
 */
export type TestIdScope = TestId | Lowercase<string>;

/** ARIA role suffixes a testid can end with (`--button`). `text` marks read-only content. */
export type TestIdRole =
    | 'button' | 'link' | 'textbox' | 'searchbox' | 'checkbox' | 'switch' | 'radio' | 'radiogroup' |
    'combobox' | 'listbox' | 'option' | 'tab' | 'tablist' | 'tabpanel' | 'menu' | 'menuitem' |
    'menuitemcheckbox' | 'menuitemradio' | 'dialog' | 'alertdialog' | 'slider' | 'spinbutton' |
    'togglebutton' | 'text' | 'img' | 'list' | 'listitem' | 'row' | 'grid' | 'gridcell' |
    'status' | 'alert' | 'tooltip' | 'region' | 'separator';

/** `withRole('a.b', 'button')` -> `a.b--button`; undefined stays undefined so no testid renders. */
export function withRole(testId: TestId | undefined, role: TestIdRole): string | undefined {
    return testId ? `${testId}--${role}` : undefined;
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

/**
 * Host-owned testids on the slots plugins render into (`{plugin}` is the plugin's `pluginTestKey`).
 * This is a published contract, like the published modals: plugin test packages locate their buttons
 * through it, and the test-surface scan fails if the webapp stops rendering a slot listed here, or
 * renders a plugin-keyed testid that isn't listed.
 */
export const PLUGIN_SLOT_TEST_IDS = {

    // each area's PR lists the slots it renders, once it renders them: e.g. `app_bar_button: 'app_bar.plugin:{plugin}--button'`
} as const;

export type PluginSlot = keyof typeof PLUGIN_SLOT_TEST_IDS;

/**
 * The registry methods whose registrations the webapp renders in each slot. A plugin's test-surface
 * scan reads its own registry calls through this to list the slots it uses, and checks that each host
 * version it supports still renders them.
 */
export const PLUGIN_SLOT_REGISTRY_METHODS: Record<PluginSlot, readonly string[]> = {};

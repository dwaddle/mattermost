// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TEST_ID_ROLES, pluginTestKey, settingTestKey, suggestionTestKey} from '@mattermost/types/test_id';
import type {PluginTestKey, SettingTestKey, SuggestionTestKey, TestIdRole} from '@mattermost/types/test_id';

// the grammar is defined once in @mattermost/types; imported then exported, since parcel's type bundler can't follow `export ... from` into another package
export {TEST_ID_ROLES, pluginTestKey, settingTestKey, suggestionTestKey, type PluginTestKey, type SettingTestKey, type SuggestionTestKey, type TestIdRole};

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

/** `withRole('a.b', 'button')` -> `a.b--button`; undefined stays undefined so no testid renders. */
export function withRole(testId: TestId | undefined, role: TestIdRole): string | undefined {
    return testId ? `${testId}--${role}` : undefined;
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

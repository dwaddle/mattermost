// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {TEST_ID_ROLES, pluginTestKey, settingTestKey, suggestionTestKey} from '@mattermost/types/test_id';
import type {PluginTestKey, SettingTestKey, SuggestionTestKey, TestIdRole} from '@mattermost/types/test_id';

// the grammar is defined once in @mattermost/types; imported then exported, since parcel's type bundler can't follow `export ... from` into another package
export {TEST_ID_ROLES, pluginTestKey, settingTestKey, suggestionTestKey, type PluginTestKey, type SettingTestKey, type SuggestionTestKey, type TestIdRole};

/**
 * A testid path without its role: lowercase words joined by dots, scope first and name last
 * (`channel_header.menu.leave_channel`), optionally keyed on the last word
 * (`lhs.channel_list.channel:${channel.name}`). The key keeps its case (`admin.setting:ServiceSettings_SiteURL`);
 * the path is lowercase.
 *
 * Components that take a `testId` prop type it as `TestId` and render `withRole(testId, 'button')`, deriving
 * their parts from it (`part(testId, 'close', 'button')`). The test-surface scanner reads these to generate the
 * typed Playwright page objects. The type can't spell out the whole grammar (lower_snake_case words, no `--`
 * before the role); the testid lint rules and the scan check the literals.
 */
export type TestId = `${Lowercase<string>}.${Lowercase<string>}` | `${Lowercase<string>}.${Lowercase<string>}:${string}`;

/** A full testid: a `TestId` and its role (`channel_header.menu.leave_channel--menuitem`). */
export type TestIdWithRole = `${TestId}--${TestIdRole}`;

/**
 * A testid scope: a `TestId`, or a single word naming a scope root container (a modal, a page region:
 * `channel_settings_modal`). Props that receive a scope for their parts take this type.
 */
export type TestIdScope = TestId | Lowercase<string>;

/** A list item's key: runtime data (an id, a name), never a literal. See the key rules in the grammar docs. */
export type TestIdKey = {key: string | number};

/** `withRole('a.b', 'button')` -> `a.b--button`; undefined (or '') stays undefined so no testid renders. */
export function withRole(testId: TestId, role: TestIdRole): TestIdWithRole;
export function withRole(testId: TestId | undefined, role: TestIdRole): TestIdWithRole | undefined;
export function withRole(testId: TestId | undefined, role: TestIdRole): TestIdWithRole | undefined {
    return testId ? `${testId}--${role}` : undefined;
}

/**
 * A part of a scope: `part(scope, 'menu.close')` -> `scope.menu.close`, `part(scope, 'close', 'button')` ->
 * `scope.close--button`, `part(scope, 'row', {key: user.id}, 'button')` -> `scope.row:<id>--button`.
 *
 * Without a scope (undefined or '') the result is undefined, so the component renders no testid rather than a
 * broken one (`scope && ...` renders `data-testid=""` for ''). Write `path` as a literal of lower_snake_case words:
 * the scanner and the lint rules read it from the source. `part(s, p, role)` is `withRole(part(s, p), role)`.
 */
export function part(scope: TestIdScope, path: string): TestId;
export function part(scope: TestIdScope | undefined, path: string): TestId | undefined;
export function part(scope: TestIdScope, path: string, role: TestIdRole): TestIdWithRole;
export function part(scope: TestIdScope | undefined, path: string, role: TestIdRole): TestIdWithRole | undefined;
export function part(scope: TestIdScope, path: string, key: TestIdKey): TestId;
export function part(scope: TestIdScope | undefined, path: string, key: TestIdKey): TestId | undefined;
export function part(scope: TestIdScope, path: string, key: TestIdKey, role: TestIdRole): TestIdWithRole;
export function part(scope: TestIdScope | undefined, path: string, key: TestIdKey, role: TestIdRole): TestIdWithRole | undefined;
export function part(scope: TestIdScope | undefined, path: string, keyOrRole?: TestIdKey | TestIdRole, role?: TestIdRole): TestId | TestIdWithRole | undefined {
    if (!scope) {
        return undefined;
    }
    if (typeof keyOrRole === 'string') {
        return `${scope}.${path}--${keyOrRole}` as TestIdWithRole;
    }
    const id = (keyOrRole ? `${scope}.${path}:${keyOrRole.key}` : `${scope}.${path}`) as TestId;
    return role ? withRole(id, role) : id;
}

/**
 * Keys a testid itself: `keyed(testId, status.id, 'button')` -> `<testId>:<id>--button`, for a component rendered
 * once per list item that receives its testId from the list. Undefined (or '') testId or an undefined key gives
 * undefined.
 */
export function keyed(testId: TestIdScope, key: string | number): TestId;
export function keyed(testId: TestIdScope, key: string | number, role: TestIdRole): TestIdWithRole;
export function keyed(testId: TestIdScope | undefined, key: string | number | undefined): TestId | undefined;
export function keyed(testId: TestIdScope | undefined, key: string | number | undefined, role: TestIdRole): TestIdWithRole | undefined;
export function keyed(testId: TestIdScope | undefined, key: string | number | undefined, role?: TestIdRole): TestId | TestIdWithRole | undefined {
    if (!testId || key === undefined) {
        return undefined;
    }
    const id = `${testId}:${key}` as TestId;
    return role ? withRole(id, role) : id;
}

type SlotTemplate<S extends PluginSlot> = typeof PLUGIN_SLOT_TEST_IDS[S];

/** The slots that render under a scope the host passes in (`*.actions_menu.plugin:{plugin}--button`). */
export type ScopedPluginSlot = {[S in PluginSlot]: SlotTemplate<S> extends `*.${string}` ? S : never}[PluginSlot];
export type UnscopedPluginSlot = Exclude<PluginSlot, ScopedPluginSlot>;

type SlotTestId<S extends PluginSlot> = SlotTemplate<S> extends `${string}--${string}` ? TestIdWithRole : TestId;

function fillSlot(slot: PluginSlot, pluginId: string, scope: TestIdScope | undefined): string | undefined {
    const template: string = PLUGIN_SLOT_TEST_IDS[slot];
    const id = template.replace('{plugin}', pluginTestKey(pluginId));
    if (!id.startsWith('*')) {
        return id;
    }
    return scope ? scope + id.slice(1) : undefined;
}

/**
 * The testid of a plugin's registration in a slot: `pluginSlotTestId('app_bar_button', plugin.id)` ->
 * `app_bar.plugin:<pluginTestKey(id)>--button`. A slot that renders under any scope (`*.` in
 * `PLUGIN_SLOT_TEST_IDS`) takes the scope; without one the result is undefined. Write the slot as a literal:
 * the scanner expands it from `PLUGIN_SLOT_TEST_IDS`.
 */
export function pluginSlotTestId<S extends UnscopedPluginSlot>(slot: S, pluginId: string): SlotTestId<S>;
export function pluginSlotTestId<S extends ScopedPluginSlot>(slot: S, pluginId: string, scope: TestIdScope): SlotTestId<S>;
export function pluginSlotTestId<S extends ScopedPluginSlot>(slot: S, pluginId: string, scope: TestIdScope | undefined): SlotTestId<S> | undefined;
export function pluginSlotTestId<S extends PluginSlot>(slot: S, pluginId: string, scope?: TestIdScope): TestId | TestIdWithRole | undefined {
    return fillSlot(slot, pluginId, scope) as TestId | TestIdWithRole | undefined;
}

/**
 * `pluginSlotTestId` without the role, for a component that appends its own (`<MenuItem testId=...>`).
 */
export function pluginSlotPath<S extends UnscopedPluginSlot>(slot: S, pluginId: string): TestId;
export function pluginSlotPath<S extends ScopedPluginSlot>(slot: S, pluginId: string, scope: TestIdScope): TestId;
export function pluginSlotPath<S extends ScopedPluginSlot>(slot: S, pluginId: string, scope: TestIdScope | undefined): TestId | undefined;
export function pluginSlotPath<S extends PluginSlot>(slot: S, pluginId: string, scope?: TestIdScope): TestId | undefined {
    const id = fillSlot(slot, pluginId, scope);
    return id?.replace(/--[a-z]+$/, '') as TestId | undefined;
}

/**
 * Host-owned testids on the slots plugins render into (`{plugin}` is the plugin's `pluginTestKey`).
 * This is a published contract, like the published modals: plugin test packages locate their buttons
 * through it, and the test-surface scan fails if the webapp stops rendering a slot listed here, or
 * renders a plugin-keyed testid that isn't listed.
 *
 * A menu item's slot ends in `--menuitem` whatever renders it today, so moving a menu to the menu library renames
 * nothing plugins rely on. The older menus still render those items as buttons or links (allow-listed in the scan's
 * role-fit check until they move).
 */
export const PLUGIN_SLOT_TEST_IDS = {
    app_bar_button: 'app_bar.plugin:{plugin}--button',
    channel_header_button: 'channel_header.plugin_actions.action:{plugin}--button',
    channel_header_dropdown_item: 'channel_header.plugin_actions.menu.action:{plugin}--menuitem',
    channel_header_menu_item: 'channel_header.menu.plugin:{plugin}--menuitem',
    channel_header_bookmarks_menu_item: 'channel_header.menu.bookmarks.plugin:{plugin}--menuitem',
    channel_info_menu_item: 'rhs.channel_info.menu.plugin:{plugin}--menuitem',

    // a file's "..." menu wherever an attachment renders (a post, a thread, a preview…): `*` is the attachment
    // list's scope (`<post>.attachments`)
    file_menu_item: '*.file_card.menu.plugin:{plugin}--menuitem',

    // the composer's attachment menu, in the center and the thread panel
    file_upload_method: '*.attach_menu.plugin:{plugin}--menuitem',
    lhs_browse_or_add_menu_item: 'lhs.browse_or_add_menu.plugin:{plugin}--menuitem',
    lhs_team_menu_item: 'lhs.team_menu.plugin:{plugin}--menuitem',

    // a post's actions menu wherever a post renders (the center, a thread, search results…)
    post_menu_item: '*.actions_menu.plugin:{plugin}--menuitem',
    post_submenu: '*.actions_menu.plugin_submenu:{plugin}--menuitem',
    rhs_panel: 'rhs.plugin:{plugin}',
    search_file_menu_item: 'search.results.file.menu.plugin:{plugin}--menuitem',
    search_type: 'search_box.plugin_type:{plugin}--radio',

    // each area's PR lists the slots it renders, once it renders them
} as const;

export type PluginSlot = keyof typeof PLUGIN_SLOT_TEST_IDS;

/**
 * The registry methods whose registrations the webapp renders in each slot. A plugin's test-surface
 * scan reads its own registry calls through this to list the slots it uses, and checks that each host
 * version it supports still renders them.
 */
export const PLUGIN_SLOT_REGISTRY_METHODS: Record<PluginSlot, readonly string[]> = {
    app_bar_button: ['registerAppBarComponent', 'registerChannelHeaderButtonAction'],
    channel_header_button: ['registerChannelHeaderButtonAction'],
    channel_header_dropdown_item: ['registerChannelHeaderButtonAction'],
    channel_header_menu_item: ['registerChannelHeaderMenuAction'],
    channel_header_bookmarks_menu_item: ['registerChannelBookmarksMenuAction'],
    channel_info_menu_item: ['registerChannelInfoMenuAction'],
    file_menu_item: ['registerFileDropdownMenuAction'],
    file_upload_method: ['registerFileUploadMethod'],
    lhs_browse_or_add_menu_item: ['registerSidebarBrowseOrAddChannelMenuAction'],
    lhs_team_menu_item: ['registerMainMenuAction'],
    post_menu_item: ['registerPostDropdownMenuAction'],
    post_submenu: ['registerPostDropdownSubMenuAction'],
    rhs_panel: ['registerRightHandSidebarComponent'],
    search_file_menu_item: ['registerFileDropdownMenuAction'],
    search_type: ['registerSearchComponents'],
};

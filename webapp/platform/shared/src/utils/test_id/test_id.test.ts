// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {PLUGIN_SLOT_TEST_IDS, keyed, part, pluginSlotPath, pluginSlotTestId, withRole} from './index';
import type {PluginSlot, TestId, TestIdScope, TestIdWithRole} from './index';

describe('withRole', () => {
    test('appends the role', () => {
        expect(withRole('a.b', 'button')).toBe('a.b--button');
    });

    test('no testid stays no testid', () => {
        expect(withRole(undefined, 'button')).toBeUndefined();
    });
});

describe('part', () => {
    test('scope.path', () => {
        expect(part('channel_settings_modal', 'save_panel.save')).toBe('channel_settings_modal.save_panel.save');
        expect(part('admin.list', 'top_pager')).toBe('admin.list.top_pager');
    });

    test('scope.path--role', () => {
        expect(part('center.post', 'only_visible_to_you', 'text')).toBe('center.post.only_visible_to_you--text');
    });

    test('scope.path:key and scope.path:key--role', () => {
        expect(part('abac.editor', 'value_menu.multi_option', {key: 'Alpha'})).toBe('abac.editor.value_menu.multi_option:Alpha');
        expect(part('abac.editor', 'value_menu.multi_option', {key: 'Alpha'}, 'menuitemcheckbox')).toBe('abac.editor.value_menu.multi_option:Alpha--menuitemcheckbox');
        expect(part('decision.policy', 'rule', {key: 0}, 'row')).toBe('decision.policy.rule:0--row');
    });

    test('no scope, or an empty one, gives no testid', () => {
        const none: TestIdScope | undefined = undefined;
        expect(part(none, 'close')).toBeUndefined();
        expect(part(none, 'close', 'button')).toBeUndefined();
        expect(part(none, 'row', {key: 'x'}, 'button')).toBeUndefined();
        expect(part('', 'close', 'button')).toBeUndefined();
    });

    test('part(s, p, role) is withRole(part(s, p), role)', () => {
        expect(part('a.b', 'c', 'link')).toBe(withRole(part('a.b', 'c'), 'link'));
    });
});

describe('keyed', () => {
    test('keys the testid itself', () => {
        expect(keyed('custom_status_modal.suggestion', 'in_a_meeting')).toBe('custom_status_modal.suggestion:in_a_meeting');
        expect(keyed('custom_status_modal.suggestion', 'in_a_meeting', 'button')).toBe('custom_status_modal.suggestion:in_a_meeting--button');
        expect(keyed('toast.list.toast', 3, 'status')).toBe('toast.list.toast:3--status');
    });

    test('no testid or no key gives no testid', () => {
        expect(keyed(undefined, 'x', 'button')).toBeUndefined();
        expect(keyed('a.b', undefined, 'button')).toBeUndefined();
        expect(keyed('', 'x')).toBeUndefined();
    });
});

describe('pluginSlotTestId and pluginSlotPath', () => {
    // Each area's PR lists the slots it renders; until then the table is empty, so these tests add their own.
    const slots = PLUGIN_SLOT_TEST_IDS as Record<string, string>;
    const added = {
        test_button: 'app_bar.plugin:{plugin}--button',
        test_scoped: '*.actions_menu.plugin:{plugin}--menuitem',
        test_panel: 'rhs.plugin:{plugin}',
    };

    beforeAll(() => {
        Object.assign(slots, added);
    });

    afterAll(() => {
        for (const slot of Object.keys(added)) {
            delete slots[slot];
        }
    });

    const slot = (name: keyof typeof added) => name as unknown as PluginSlot;

    // The overloads need a literal slot from the table, which is empty in this PR: call through the implementation's shape.
    const scoped = pluginSlotTestId as (s: PluginSlot, id: string, scope?: TestIdScope) => TestId | TestIdWithRole | undefined;

    test('fills the plugin key', () => {
        expect(scoped(slot('test_button'), 'com.mattermost.calls')).toBe('app_bar.plugin:com_mattermost_calls--button');
        expect(scoped(slot('test_panel'), 'focalboard')).toBe('rhs.plugin:focalboard');
    });

    test('a scoped slot takes the scope, and gives no testid without one', () => {
        expect(scoped(slot('test_scoped'), 'my-plugin', 'center.post_list.post')).toBe('center.post_list.post.actions_menu.plugin:my_plugin--menuitem');
        expect(scoped(slot('test_scoped'), 'my-plugin', undefined)).toBeUndefined();
    });

    test('pluginSlotPath strips the role', () => {
        const path = pluginSlotPath as (s: PluginSlot, id: string, scope?: TestIdScope) => TestId | undefined;
        expect(path(slot('test_button'), 'calls')).toBe('app_bar.plugin:calls');
        expect(path(slot('test_scoped'), 'calls', 'rhs.post')).toBe('rhs.post.actions_menu.plugin:calls');
        expect(path(slot('test_panel'), 'calls')).toBe('rhs.plugin:calls');
    });
});

describe('types', () => {
    test('a defined scope gives a defined testid, and paths are lowercase', () => {
        const scope: TestIdScope = 'channel_settings_modal';
        const id: TestId = part(scope, 'save');
        const full: TestIdWithRole = part(scope, 'save', 'button');
        const keyedId: TestIdWithRole = keyed('a.row', 'x', 'button');
        const settingKey: TestId = 'admin.setting:ServiceSettings_SiteURL';

        // @ts-expect-error uppercase in the path
        const bad: TestId = 'a.Bad';

        // @ts-expect-error not a role
        const badRole: TestIdWithRole = 'a.b--input';

        // @ts-expect-error a maybe-undefined scope gives a maybe-undefined testid
        const maybe: TestId = part(scope as TestIdScope | undefined, 'save');

        expect([id, full, keyedId, settingKey, bad, badRole, maybe]).toHaveLength(7);
    });
});

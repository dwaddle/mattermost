// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for typed keys (`npm run tsc` in lib): plugin keys from plugin ids, System Console setting
// keys, and the runtime API check generated code makes. Each `@ts-expect-error` must be an error.

import {
    callsPluginId,
    demoPluginId,
    pluginKey,
    settingTestKey,
    type AdminSettingKey,
    type AdminSettingPath,
    type PluginKey,
    type RUNTIME_API,
    type RuntimeApiCheck,
} from '../src';

export function keyTests() {
    // plugin keys come from plugin ids, typed as the literal key; the known plugins' keys are declared in the lib
    const calls: 'com_mattermost_calls' = pluginKey(callsPluginId);
    const demo: PluginKey = pluginKey(demoPluginId);
    // @ts-expect-error not a declared plugin's key
    const unknownPlugin: PluginKey = pluginKey('com.example.unknown');

    // setting keys: config paths (to three levels), React ids, custom profile attributes
    const paths: AdminSettingKey[] = ['ServiceSettings.SiteURL', 'custom_profile_attribute-abc'];
    settingTestKey('ServiceSettings.SiteURL');

    // config paths reach nested settings objects, and only real keys
    const nested: AdminSettingPath = 'AIRecapSettings.DefaultLimits.MaxChannelsPerRecap';
    // @ts-expect-error not a config path
    const wrong: AdminSettingPath = 'ServiceSettings.SiteURL.Nope';

    return {calls, demo, unknownPlugin, paths, nested, wrong};
}

// generated code checks the runtime API version it was written for
export type CurrentApi = RuntimeApiCheck<typeof RUNTIME_API>;
// @ts-expect-error generated for another runtime API
export type OtherApi = RuntimeApiCheck<999>;

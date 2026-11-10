// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test, expect as baseExpect} from '@playwright/test';

import {pluginKey, pluginSurfaces, registerPluginSurface} from '../src/aria/plugins';

test.describe('plugin surfaces', () => {
    test('are created once per page, and an unregistered one names its package', async ({page}) => {
        let created = 0;
        registerPluginSurface('comExampleWidgets', (p) => {
            created++;
            return {page: p};
        });
        const plugins = pluginSurfaces(page);
        baseExpect(plugins.comExampleWidgets).toBe(pluginSurfaces(page).comExampleWidgets);
        baseExpect(created).toBe(1);
        baseExpect('comExampleWidgets' in plugins).toBe(true);
        baseExpect(() => plugins.comMattermostDemoPlugin).toThrow(
            'app.plugins.comMattermostDemoPlugin is not registered: import its test package (plugins/com_mattermost_demo_plugin) in this spec.',
        );

        // probing the object (await, JSON) doesn't throw
        baseExpect(await Promise.resolve(plugins)).toBe(plugins);
        baseExpect(() => JSON.stringify(plugins)).not.toThrow();
    });

    test('pluginKey normalizes a plugin id like the webapp', () => {
        baseExpect(pluginKey('com.mattermost.demo-plugin')).toBe('com_mattermost_demo_plugin');
        baseExpect(pluginKey('mattermost-ai')).toBe('mattermost_ai');
    });
});

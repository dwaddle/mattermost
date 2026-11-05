// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for host plugin slots: a plugin test package declares its key by augmenting the
// package entry (here `../src/index`, for packages `@mattermost/playwright-lib`), and slot getters
// accept only declared keys.

import type {Page} from '@playwright/test';

import {App} from '../src';

declare module '../src' {
    interface PluginKeys {
        com_mattermost_calls: true;
    }
}

declare const page: Page;
const app = new App(page);

export async function pluginSlotTypeTests() {
    await app.channelHeader.pluginActions.action('com_mattermost_calls').click();
    await app.channelHeader.menu.plugin('com_mattermost_calls').click();

    // @ts-expect-error not a key of an installed plugin test package
    app.channelHeader.pluginActions.action('com_mattermost_unknown');

    // @ts-expect-error keys are normalized plugin ids, not raw ones
    app.channelHeader.pluginActions.action('com.mattermost.calls');
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for plugin keys: a plugin test package declares its key by augmenting the package
// entry (here `../src/index`, for packages `@mattermost/playwright-lib`), and only declared keys are
// plugin keys. Host plugin slots (`app.channelHeader.pluginActions.action(key)`) take a `PluginKey`; their
// tests come with the first area that renders a slot.

import type {PluginKey} from '../src';

declare module '../src' {
    interface PluginKeys {
        com_mattermost_calls: true;
    }
}

export const declared: PluginKey = 'com_mattermost_calls';

// @ts-expect-error not a key of an installed plugin test package
export const unknown: PluginKey = 'com_mattermost_unknown';

// @ts-expect-error keys are normalized plugin ids, not raw ones
export const raw: PluginKey = 'com.mattermost.calls';

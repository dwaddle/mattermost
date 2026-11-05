// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

type Factory = (page: Page) => unknown;

const surfaces = new Map<string, Factory>();

/**
 * Called by a plugin's generated test package: `registerPluginSurface('comMattermostCalls', (page) => new ComMattermostCalls(page))`.
 * Its types reach `app.plugins` by augmenting the `Plugins` interface.
 */
export function registerPluginSurface(name: string, factory: Factory) {
    surfaces.set(name, factory);
}

/** The registered plugin surfaces for a page, created on first access. */
export function pluginSurfaces(page: Page): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [name, factory] of surfaces) {
        Object.defineProperty(out, name, {enumerable: true, get: () => factory(page)});
    }
    return out;
}

/**
 * Plugin keys a test can pass to host plugin slots (`app.channelHeader.pluginActions.action(key)`): the
 * plugin's id normalized for a testid (`com.mattermost.calls` -> `com_mattermost_calls`). A plugin's
 * generated test package adds its key; a spec using a plugin without one declares it:
 *
 *     declare module '@mattermost/playwright-lib' {
 *         interface PluginKeys {
 *             com_mattermost_demo_plugin: true;
 *         }
 *     }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface PluginKeys {}

export type PluginKey = keyof PluginKeys & string;

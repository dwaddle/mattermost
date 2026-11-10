// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';
import {pluginTestKey} from '@mattermost/types/test_id';

type Factory = (page: Page) => unknown;

const factories = new Map<string, Factory>();
const cache = new WeakMap<Page, Map<string, unknown>>();

/**
 * Called by a plugin's generated test package: `registerPluginSurface('comMattermostCalls', (page) => new ComMattermostCalls(page))`.
 * Its types reach `app.plugins` by augmenting the `Plugins` interface, so a spec imports the package to use it.
 */
export function registerPluginSurface(name: string, factory: Factory) {
    factories.set(name, factory);
}

// read by tools and runtimes that probe any object (await, JSON, util.inspect, expect): never a plugin surface. A
// surface's name is a camelCase identifier; anything else (`_apiName`, `$$typeof`, symbols) reads as undefined.
const PROBED = new Set([
    'then',
    'toJSON',
    'constructor',
    'asymmetricMatch',
    'nodeType',
    'inspect',
    'toString',
    'valueOf',
]);
const SURFACE_NAME = /^[a-z][A-Za-z0-9]*$/;

/**
 * The registered plugin surfaces for a page (`app.plugins`): each one is created on first access and kept for the
 * page. Reading one that no imported package registered throws, naming the package to import (its type exists as
 * soon as any file in the program imports the package, so the compiler can't catch a spec that forgot to).
 */
export function pluginSurfaces(page: Page): Record<string, unknown> {
    let surfaces = cache.get(page);
    if (!surfaces) {
        surfaces = new Map();
        cache.set(page, surfaces);
    }
    const created = surfaces;
    return new Proxy({} as Record<string, unknown>, {
        get(_, name) {
            if (typeof name !== 'string' || PROBED.has(name) || !SURFACE_NAME.test(name)) {
                return undefined;
            }
            if (created.has(name)) {
                return created.get(name);
            }
            const factory = factories.get(name);
            if (!factory) {
                throw new Error(
                    `app.plugins.${name} is not registered: import its test package (plugins/${packageDir(name)}) in this spec.` +
                        ` Registered: ${[...factories.keys()].join(', ') || 'none'}.`,
                );
            }
            const surface = factory(page);
            created.set(name, surface);
            return surface;
        },
        has(_, name) {
            return typeof name === 'string' && factories.has(name);
        },
        ownKeys() {
            return [...factories.keys()];
        },
        getOwnPropertyDescriptor(_, name) {
            return typeof name === 'string' && factories.has(name) ? {enumerable: true, configurable: true} : undefined;
        },
    });
}

/** `comMattermostDemoPlugin` -> `com_mattermost_demo_plugin` (a plugin package's directory is its plugin key). */
function packageDir(name: string): string {
    return name.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);
}

/**
 * Plugin keys a test can pass to host plugin slots (`app.channelHeader.pluginActions.action(key)`): the
 * plugin's id normalized for a testid (`com.mattermost.calls` -> `com_mattermost_calls`). The known plugins (the
 * lib's plugin id constants) are declared here; a plugin's generated test package adds its own key. Build keys with
 * `pluginKey(id)` rather than typing them.
 */
export interface PluginKeys {
    com_mattermost_calls: true;
    com_mattermost_apps: true;
    com_mattermost_demo_plugin: true;
    com_mattermost_nps: true;
    mattermost_ai: true;
    playbooks: true;
}

export type PluginKey = keyof PluginKeys & string;

/** S with every `From` replaced by `_`. */
type Underscore<S extends string, From extends string> = S extends `${infer A}${From}${infer B}`
    ? `${A}_${Underscore<B, From>}`
    : S;

/** A plugin id as a testid key, at the type level too: `PluginKeyOf<'com.mattermost.calls'>` is `'com_mattermost_calls'`. */
export type PluginKeyOf<Id extends string> = Lowercase<Underscore<Underscore<Underscore<Id, '.'>, '-'>, ' '>>;

/**
 * The testid key of a plugin (`pluginKey(callsPluginId)` is `'com_mattermost_calls'`), typed as that literal, so a
 * host slot accepts it only when the plugin's key is declared (`PluginKeys`).
 */
export function pluginKey<const Id extends string>(id: Id): PluginKeyOf<Id> {
    return pluginTestKey(id) as string as PluginKeyOf<Id>;
}

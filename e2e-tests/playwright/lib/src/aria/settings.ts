// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {AdminConfig} from '@mattermost/types/config';
import {settingTestKey as baseSettingTestKey, type SettingTestKey} from '@mattermost/types/test_id';

// the webapp's own key helpers (`@mattermost/types/test_id`), so tests build the keys it renders
export {suggestionTestKey} from '@mattermost/types/test_id';

/** `Prefix.Key` for every key of T, and (Depth more levels) the keys of the plain objects it holds (`A.B.C`). */
type PathsOf<T, Prefix extends string, Depth extends unknown[]> = {
    [K in keyof T & string]:
        | `${Prefix}.${K}`
        | (Depth extends [unknown, ...infer Rest]
              ? NonNullable<T[K]> extends readonly unknown[]
                  ? never
                  : NonNullable<T[K]> extends object
                    ? PathsOf<NonNullable<T[K]>, `${Prefix}.${K}`, Rest>
                    : never
              : never);
}[keyof T & string];

/** A System Console setting by its config path: `ServiceSettings.SiteURL`, `AIRecapSettings.DefaultLimits.MaxChannels`. */
export type AdminSettingPath = {
    [S in keyof AdminConfig & string]: PathsOf<AdminConfig[S], S, [unknown]>;
}[keyof AdminConfig & string];

/**
 * The settings the System Console keys by a React id instead of a config path (`restrictUnauthenticatedWebappPlugins`).
 * The generated `sets.ts` adds them (`AdminSettingId`), by declaration merging:
 *
 *     declare module '../../aria/settings' {
 *         interface AdminSettingIds {
 *             restrictUnauthenticatedWebappPlugins: true;
 *         }
 *     }
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface AdminSettingIds {}

/** A React-id setting; any string until the generated code declares the set (`AdminSettingIds`). */
export type AdminSettingId = [keyof AdminSettingIds] extends [never] ? string & {} : keyof AdminSettingIds & string;

/** A System Console setting: its config path, its React id, or a custom profile attribute's setting. */
export type AdminSettingKey = AdminSettingPath | AdminSettingId | `custom_profile_attribute-${string}`;

/** The testid key of a System Console setting (`admin.setting:<key>`), from its config path, React id or attribute. */
export function settingTestKey(setting: AdminSettingKey): SettingTestKey {
    return baseSettingTestKey(setting);
}

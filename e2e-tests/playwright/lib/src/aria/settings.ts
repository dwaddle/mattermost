// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {AdminConfig} from '@mattermost/types/config';

/** A System Console setting by its config path: `ServiceSettings.SiteURL`. */
export type AdminSettingPath = {
    [S in keyof AdminConfig & string]: `${S}.${keyof AdminConfig[S] & string}`;
}[keyof AdminConfig & string];

/** The webapp's `settingTestKey()` (`@mattermost/shared/utils/test_id`): a config path as a testid key. */
export function settingTestKey(path: string): string {
    return path.replace(/[.:]/g, '_').replace(/-{2,}/g, '-');
}

/** The webapp's `suggestionTestKey()`: an autocomplete term (`@john.doe`, `john.doe`) as a testid key. */
export function suggestionTestKey(term: string): string {
    return term
        .trim()
        .replace(/^[@~/:]/, '')
        .replace(/:$/, '')
        .replace(/[.:]/g, '_')
        .replace(/-{2,}/g, '-');
}

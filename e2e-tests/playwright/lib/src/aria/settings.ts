// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {AdminConfig} from '@mattermost/types/config';

// the webapp's own key helpers (`@mattermost/types/test_id`), so tests build the keys it renders
export {settingTestKey, suggestionTestKey} from '@mattermost/types/test_id';

/** A System Console setting by its config path: `ServiceSettings.SiteURL`. */
export type AdminSettingPath = {
    [S in keyof AdminConfig & string]: `${S}.${keyof AdminConfig[S] & string}`;
}[keyof AdminConfig & string];

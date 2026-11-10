// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {createContext} from 'react';

/**
 * The section key of the SettingItem around an expanded section, however deep its SettingItemMax renders: the
 * expanded row takes the collapsed row's testid (`settings.section:<section>`).
 */
const SettingSectionContext = createContext<string | undefined>(undefined);

export default SettingSectionContext;

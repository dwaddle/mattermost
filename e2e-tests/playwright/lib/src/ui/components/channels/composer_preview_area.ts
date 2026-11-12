// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

/**
 * The rendered markdown shown in place of the composer's textbox while "Preview" is on. The area carries no testid
 * (only a class), so it is found from the composer; delete this once the webapp gives it one.
 */
export function composerPreviewArea(composer: {locator: Locator}) {
    return composer.locator.locator('.textbox-preview-area');
}

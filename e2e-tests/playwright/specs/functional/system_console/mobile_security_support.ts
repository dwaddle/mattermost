// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, type App} from '@mattermost/playwright-lib';

/** Opens System Console > Environment > Mobile Security, once its settings show. */
export async function openMobileSecurity(app: App) {
    await app.adminConsolePage.goto({section: 'environment/mobile_security'});
    await expect(app.admin.saveButton.locator).toBeVisible();
}

/** Opens Mobile Security without a license for it: the upsell. */
export async function openMobileSecurityUpsell(app: App) {
    await app.adminConsolePage.goto({section: 'environment/mobile_security'});
    await expect(app.admin.featureDiscovery.titleText.locator).toBeVisible();
}

/** Opens another page (Users), to come back to Mobile Security. */
export async function openUsers(app: App) {
    await app.adminConsolePage.goto({section: 'user_management/users'});
    await expect(app.admin.users.table.rowItems.first()).toBeVisible();
}

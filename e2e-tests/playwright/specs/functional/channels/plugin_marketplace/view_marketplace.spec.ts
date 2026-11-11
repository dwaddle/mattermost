// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a system admin can open and close the plugin (App) Marketplace.
 *
 * MM-T1946, MM-T1947, and MM-T3680 cover the same behavior as MM-T1945 and are covered by this test.
 */
test(
    'MM-T1945 MM-T1946 MM-T1947 MM-T3680 system admin can view the plugin marketplace',
    {tag: '@marketplace'},
    async ({pw}) => {
        const {adminUser, team, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open the App Marketplace from the product menu
        const productMenu = await app.globalHeader.clickProductMenuButton();
        const marketplace = await productMenu.clickMarketplaceMenuItem();

        // * Verify the Marketplace is shown
        await expect(marketplace.locator).toBeVisible();

        // # Close the Marketplace
        await marketplace.clickCloseButton();

        // * Verify the Marketplace is closed
        await expect(marketplace.locator).not.toBeVisible();
    },
);

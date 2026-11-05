// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a system admin can install a plugin from the Marketplace, configure it
 * (landing in System Console), then remove it via Plugin Management.
 */
test(
    'MM-T4023 MM-T1987 system admin can install, configure, and remove a plugin from the Marketplace',
    {tag: '@marketplace'},
    async ({pw}) => {
        const {adminUser, team} = await pw.initSetup();
        const {app, channelsPage, page} = await pw.testBrowser.login(adminUser);
        await channelsPage.goto(team.name, 'town-square');
        await channelsPage.toBeVisible();

        // # Open the App Marketplace and install the first plugin that isn't installed yet
        const productMenu = await app.globalHeader.clickProductMenuButton();
        const marketplace = await productMenu.clickMarketplaceMenuItem();
        await expect(marketplace.locator).toBeVisible();
        await expect(marketplace.itemItems.first()).toBeVisible();
        let key = '';
        for (const k of await marketplace.itemKeys()) {
            if (await marketplace.item(k).installButton.locator.isVisible()) {
                key = k;
                break;
            }
        }
        expect(key).not.toBe('');
        const item = marketplace.item(key);
        await item.clickInstallButton();
        await expect(item.configureLink.locator).toBeVisible({timeout: 60_000});

        // # Click "Configure", which navigates to the plugin's System Console settings page
        await item.clickConfigureLink();

        // * Verify System Console opened directly to the installed plugin's settings page
        const pluginId = (await app.admin.plugin.metadata.idButton.locator.textContent())?.trim() ?? '';
        expect(pluginId).not.toBe('');
        expect(page.url()).toContain(`/admin_console/plugins/plugin_${pluginId}`);

        // # Navigate to Plugin Management and remove the plugin
        await page.goto('/admin_console/plugins/plugin_management');
        const row = app.admin.plugins.plugin(key);
        await row.clickRemoveButton();
        await app.admin.plugins.removeModal.clickConfirmButton();

        // * Verify the plugin no longer appears in the installed plugins list
        await expect(row.locator).not.toBeVisible();
    },
);

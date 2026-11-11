// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Api, expect, test} from '@mattermost/playwright-lib';

import {openAdminConsole} from './support';

/**
 * @objective Verify the public link salt can be regenerated.
 */
test('MM-T1762 regenerates the public link salt', {tag: '@authentication'}, async ({pw}) => {
    const {adminUser} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(adminUser);

    await openAdminConsole(app, '/site_config/public_links');
    const salt = app.admin.setting('FileSettings.PublicLinkSalt');

    // * Verify the salt is masked
    await expect(salt.valueText.locator).toHaveText('********************************');

    // # Regenerate the salt
    await salt.clickRegenerateButton();

    // * Verify a new, unmasked salt is shown
    await expect(salt.valueText.locator).not.toHaveText('********************************');
    await expect(salt.valueText.locator).toHaveText(/^[A-Za-z0-9_-]{32}$/);
});

/**
 * @objective Verify an invalid Maximum Login Attempts value falls back to the default.
 */
test(
    'MM-T1775 resets Maximum Login Attempts to the default after an invalid value',
    {tag: '@authentication'},
    async ({pw}) => {
        const {adminUser} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);

        await openAdminConsole(app, '/authentication/password');
        const attempts = app.admin.setting('maximumLoginAttempts').valueTextbox;

        // # Save a non-numeric value
        await attempts.fill('ten');
        const config = await app.admin.saveButton.commit({wait: Api.PatchConfig});

        // * Verify the save completes and the value falls back to the default
        await expect(app.admin.saveButton.locator).toBeSaved();
        expect(config.ServiceSettings.MaximumLoginAttempts).toBe(10);
        await expect(attempts.locator).toHaveValue('10');
    },
);

/**
 * @objective Verify a valid Maximum Login Attempts change is saved.
 */
test('MM-T1776 saves a valid Maximum Login Attempts change', {tag: '@authentication'}, async ({pw}) => {
    const {adminUser} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(adminUser);

    await openAdminConsole(app, '/authentication/password');
    const attempts = app.admin.setting('maximumLoginAttempts').valueTextbox;

    // # Save a valid value
    await attempts.fill('2');
    const config = await app.admin.saveButton.commit({wait: Api.PatchConfig});

    // * Verify the value is saved
    await expect(app.admin.saveButton.locator).toBeSaved();
    expect(config.ServiceSettings.MaximumLoginAttempts).toBe(2);
    await expect(attempts.locator).toHaveValue('2');
});

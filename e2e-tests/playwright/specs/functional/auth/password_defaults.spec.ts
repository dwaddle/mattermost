// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {openAdminConsole, openSignup} from './support';

/**
 * @objective Verify default password settings in the System Console.
 */
test('MM-T1770 shows default password length and requirement checkboxes', {tag: '@authentication'}, async ({pw}) => {
    const {adminUser, adminClient} = await pw.initSetup();

    const config = await adminClient.getConfig();
    expect([8, 14]).toContain(config.PasswordSettings.MinimumLength);
    expect(config.PasswordSettings.Lowercase).toBe(false);
    expect(config.PasswordSettings.Number).toBe(false);
    expect(config.PasswordSettings.Uppercase).toBe(false);
    expect(config.PasswordSettings.Symbol).toBe(false);

    const {app} = await pw.testBrowser.login(adminUser);

    // # Open Password settings
    await openAdminConsole(app, '/authentication/password');

    // * Verify the default minimum length and unchecked requirements
    const password = app.admin.password;
    await expect(app.admin.setting('passwordMinimumLength').valueTextbox.locator).toHaveValue(
        String(config.PasswordSettings.MinimumLength),
    );
    await expect(password.lowercaseCheckbox.locator).not.toBeChecked();
    await expect(password.uppercaseCheckbox.locator).not.toBeChecked();
    await expect(password.numberCheckbox.locator).not.toBeChecked();
    await expect(password.symbolCheckbox.locator).not.toBeChecked();
    await expect(app.admin.setting('maximumLoginAttempts').valueTextbox.locator).toHaveValue('10');
});

/**
 * @objective Verify signup username validation rejects invalid usernames.
 */
test('MM-T1783 rejects invalid usernames on signup', {tag: '@authentication'}, async ({pw, page}) => {
    const app = await openSignup(pw, page);
    const card = app.signup.card;
    await card.fillEmailTextbox(`test-${pw.random.id()}@example.com`);
    await card.fillPasswordTextbox(pw.newTestPassword());
    await card.setTermsCheckbox(true);

    for (const username of ['1user', 'te', 'user#1', 'user!1']) {
        // # Submit an invalid username
        await card.fillUsernameTextbox(username);
        await card.clickCreateAccountButton();

        // * Verify the username validation error is shown
        await expect(card.username.messageAlert.locator).toHaveText(
            'Usernames have to begin with a lowercase letter and be 3-22 characters long. You can use lowercase letters, numbers, periods, dashes, and underscores.',
        );
    }
});

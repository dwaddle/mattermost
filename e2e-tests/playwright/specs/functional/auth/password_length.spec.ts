// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {expectOnSelectTeam, openAdminConsole, openSignup} from './support';

const LENGTH_ERROR =
    /Minimum password length must be a whole number greater than or equal to (5|14) and less than or equal to 72\./;

/**
 * @objective Verify an out-of-range minimum password length is rejected.
 */
test('MM-T1771 rejects a minimum password length outside the allowed range', {tag: '@authentication'}, async ({pw}) => {
    const {adminUser} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(adminUser);

    await openAdminConsole(app, '/authentication/password');
    const minimumLength = app.admin.setting('passwordMinimumLength').valueTextbox;

    // # Save a minimum length above the maximum
    await minimumLength.fill('88');
    await app.admin.clickSaveButton();

    // * Verify the length error is shown
    await expect(app.admin.saveError.locator).toHaveText(LENGTH_ERROR);

    // # Save a minimum length below the minimum
    await minimumLength.fill('3');
    await app.admin.clickSaveButton();

    // * Verify the length error is shown
    await expect(app.admin.saveError.locator).toHaveText(LENGTH_ERROR);
});

/**
 * @objective Verify a new minimum password length is applied on signup.
 */
test('MM-T1772 applies a new minimum password length on signup', {tag: '@authentication'}, async ({pw, page}) => {
    const {adminUser} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(adminUser);

    // # Set the minimum password length to 15
    await openAdminConsole(app, '/authentication/password');
    await app.admin.setting('passwordMinimumLength').valueTextbox.fill('15');
    await app.admin.clickSaveButton();

    // * Verify the preview reflects the new length
    await expect(app.admin.password.previewText.locator).toHaveText('Your password must be 15-72 characters long.');

    // # Try to sign up with a short password, in the test's own browser (not logged in)
    const signup = await openSignup(pw, page);
    const card = signup.signup.card;
    await card.fillEmailTextbox(`test-${pw.random.id()}@example.com`);
    await card.fillUsernameTextbox(`user${pw.random.id()}`);
    await card.setTermsCheckbox(true);
    await card.fillPasswordTextbox('less');
    await card.clickCreateAccountButton();

    // * Verify the length error is shown
    await expect(card.password.messageAlert.locator).toHaveText(/Your password must be \d+-72 characters long\.$/);

    // # Sign up with a long enough password
    await card.fillPasswordTextbox('GreaterThan15Chr!');
    await card.setTermsCheckbox(true);
    await card.clickCreateAccountButton();

    // * Verify the account is created
    await expectOnSelectTeam(page);
});

/**
 * @objective Verify clearing the minimum password length resets it to the default.
 */
test(
    'MM-T1773 resets Minimum password length to the default after clearing it',
    {tag: '@authentication'},
    async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();
        const originalMinimumLength = (await adminClient.getConfig()).PasswordSettings.MinimumLength;
        const isFips = (await adminClient.getClientConfig()).IsFipsEnabled === 'true';
        const customLength = originalMinimumLength === 20 ? 21 : 20;

        const {app} = await pw.testBrowser.login(adminUser);
        await openAdminConsole(app, '/authentication/password');
        const minimumLength = app.admin.setting('passwordMinimumLength').valueTextbox;

        // # Save a custom minimum length and reload
        await minimumLength.fill(String(customLength));
        await app.admin.clickSaveButton();
        await expect
            .poll(async () => (await adminClient.getConfig()).PasswordSettings.MinimumLength)
            .toBe(customLength);
        await app.page.reload();
        await expect(minimumLength.locator).toHaveValue(String(customLength));

        // # Clear the minimum length and save
        await minimumLength.locator.clear();
        await app.admin.clickSaveButton();

        if (isFips) {
            // * Verify FIPS rejects the empty value and keeps the custom length
            await expect(app.admin.saveError.locator).toHaveText(LENGTH_ERROR);
            expect((await adminClient.getConfig()).PasswordSettings.MinimumLength).toBe(customLength);
        } else {
            // * Verify the length resets to the default
            await expect.poll(async () => (await adminClient.getConfig()).PasswordSettings.MinimumLength).toBe(5);
            await app.page.reload();
            await expect(minimumLength.locator).toHaveValue('5');
        }
    },
);

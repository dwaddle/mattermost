// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openLogin, test} from '@mattermost/playwright-lib';

/**
 * @objective Capture visual snapshots of the signup email page in normal and error states
 */
test(
    'signup page visual check',
    {tag: ['@visual', '@signup_email_page', '@snapshots']},
    async ({pw, page, browserName, viewport}, testInfo) => {
        // # Set up the page not to redirect to the landing page
        await pw.hasSeenLandingPage();

        // # Navigate to login page
        const {adminClient} = await pw.getAdminClient();
        const app = await openLogin(pw, page);

        // # Click on create account link
        await app.login.alternate.clickActionLink();

        // * Verify redirection to signup page
        const card = app.signup.card;
        await expect(card.emailTextbox.locator).toBeVisible();

        // # Remove focus from email input by clicking elsewhere
        await card.titleText.locator.click();

        // # Get license information to determine snapshot suffix
        const license = await adminClient.getClientLicenseOld();
        const editionSuffix = license.IsLicensed === 'true' ? '' : 'team edition';
        const testArgs = {page, browserName, viewport};

        // * Verify visual appearance of signup page
        await pw.matchSnapshot({...testInfo, title: `${testInfo.title} ${editionSuffix}`}, testArgs);

        // # Attempt to create account with invalid credentials
        const invalidUser = {email: 'invalid', username: 'a', password: 'b'};
        await card.fill({...invalidUser, terms: true});
        await card.clickCreateAccountButton();

        // * Verify error messages appear for each field
        await expect(card.email.messageAlert.locator).toBeVisible();
        await expect(card.username.messageAlert.locator).toBeVisible();
        await expect(card.password.messageAlert.locator).toBeVisible();
        await pw.waitForAnimationEnd(card.locator);

        // * Verify visual appearance of signup page with errors
        await pw.matchSnapshot({...testInfo, title: `${testInfo.title} error ${editionSuffix}`}, testArgs);
    },
);

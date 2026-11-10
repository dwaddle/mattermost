// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {openLogin} from '../../functional/auth/support';

/**
 * @objective Capture visual snapshots of the login page in normal and error states
 */
test(
    'login page visual check',
    {tag: ['@visual', '@login_page', '@snapshots']},
    async ({pw, page, browserName, viewport}, testInfo) => {
        // # Set up the page not to redirect to the landing page
        await pw.hasSeenLandingPage();

        // # Go to login page
        const {adminClient} = await pw.getAdminClient();
        const app = await openLogin(pw, page);

        // # Click to other element to remove focus from email input
        await app.login.loginIdTextbox.locator.blur();

        // # Get license information and prepare test args
        const testArgs = {page, browserName, viewport};
        const license = await adminClient.getClientLicenseOld();
        const editionSuffix = license.IsLicensed === 'true' ? '' : 'team edition';

        // * Verify login page appears as expected
        await pw.matchSnapshot({...testInfo, title: `${testInfo.title} ${editionSuffix}`}, testArgs);

        // # Click sign in button without entering user credential
        await app.login.card.clickLogInButton();
        await expect(app.login.banner.locator).toContainText('Please enter your email or username');

        // * Verify login page with error appears as expected
        await pw.matchSnapshot({...testInfo, title: `${testInfo.title} error ${editionSuffix}`}, testArgs);
    },
);

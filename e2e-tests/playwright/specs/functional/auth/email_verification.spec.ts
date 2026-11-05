// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, extractEmailLink, getRecentEmail, test} from '@mattermost/playwright-lib';

import {logIn, openLogin} from './support';

/**
 * @objective Verify a user created while verification was off must verify after it is turned on.
 */
test(
    'MM-T1764 requires email verification after it is enabled for an existing account',
    {tag: '@authentication'},
    async ({pw, page}) => {
        const {adminClient, user} = await pw.initSetup();

        const {restore} = await adminClient.patchConfig({EmailSettings: {RequireEmailVerification: true}});

        try {
            await adminClient.revokeAllSessionsForUser(user.id);
            const started = new Date();

            // # Log in after verification is required
            const app = await openLogin(pw, page);
            await logIn(app, user.username, user.password);
            const verify = app.shouldVerifyEmail;
            await expect(verify.titleText.locator).toHaveText('You’re almost done!');

            // # Resend the verification email
            await verify.clickResendButton();
            await expect(verify.statusText.locator).toHaveText('Verification email sent');

            const mail = await getRecentEmail(user.email, {receivedAfter: started});
            const permalink = extractEmailLink(mail, '/do_verify_email');

            // # Open the verification link and log in
            await page.goto(permalink);
            await expect(app.login.loginIdTextbox.locator).toBeVisible();
            await logIn(app, user.username, user.password);

            // * Verify the user can proceed after verifying
            await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
        } finally {
            await restore();
        }
    },
);

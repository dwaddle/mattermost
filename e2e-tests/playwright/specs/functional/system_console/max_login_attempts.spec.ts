// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {App, expect, test} from '@mattermost/playwright-lib';

/** Fills the login form and submits it. */
async function logIn(app: App, username: string, password: string) {
    await app.login.fillLoginIdTextbox(username);
    await app.login.fillPasswordTextbox(password);
    await app.login.card.clickLogInButton();
}

test('should lock account after exceeding max login attempts and unlock via admin API', async ({pw, page}) => {
    // 1. Setup — create a test user and get admin client
    const {adminClient, user} = await pw.initSetup();

    // 2. Lower MaximumLoginAttempts to 3 via API so the test runs quickly
    await adminClient.patchConfig({
        ServiceSettings: {MaximumLoginAttempts: 3},
    });

    // 3. Navigate to the login page — set localStorage first to skip the native app landing page
    await pw.hasSeenLandingPage();
    const app = new App(page);
    await app.loginPage.goto();
    await expect(app.login.loginIdTextbox.locator).toBeVisible();

    // 4. Attempt login with wrong password 3 times
    for (let i = 0; i < 3; i++) {
        await logIn(app, user.username, 'WrongPassword!');
        await expect(app.login.banner.locator).toContainText(
            /The email\/username or password is invalid\.|Enter a valid email or username and\/or password/,
        );
    }

    // 5. Correct password should now be rejected — account is locked
    await logIn(app, user.username, user.password);
    await expect(app.login.banner.locator).toContainText(
        /Your account is locked because of too many failed password attempts\./,
    );
    await expect(page).toHaveURL(/\/login/);

    // 6. Admin unlocks the account via API
    await adminClient.resetFailedAttempts(user.id);

    // 7. User can now log in with correct password
    await logIn(app, user.username, user.password);
    await expect(page).not.toHaveURL(/\/login/);
});

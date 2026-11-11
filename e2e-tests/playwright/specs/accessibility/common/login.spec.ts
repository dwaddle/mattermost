// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openLogin, test} from '@mattermost/playwright-lib';

test('/login accessibility quick check', async ({pw, page, axe}) => {
    // # Go to login page (past the native-app landing page)
    await openLogin(pw, page);

    // # Analyze the page
    const accessibilityScanResults = await axe.builder(page).analyze();

    // * Should have no violation
    expect(accessibilityScanResults.violations).toHaveLength(0);
});

test('/login accessibility tab support', async ({pw, page}) => {
    // # Go to login page (past the native-app landing page)
    const app = await openLogin(pw, page);
    const {login} = app;
    const {footer, header} = app.public;

    // * Should have focused at login input on page load
    await expect(login.loginIdTextbox.locator).toBeFocused();

    // * Should move focus to password input after tab
    await login.loginIdTextbox.press('Tab');
    await expect(login.passwordTextbox.locator).toBeFocused();

    // * Should move focus to password toggle button after tab
    await login.passwordTextbox.press('Tab');
    await expect(login.password.toggleButton.locator).toBeFocused();

    // * Should move focus to forgot password link after tab
    await login.password.toggleButton.press('Tab');
    await expect(login.forgotPasswordLink.locator).toBeFocused();

    // * Should move focus to sign in button after tab
    await login.forgotPasswordLink.press('Tab');
    await expect(login.card.logInButton.locator).toBeFocused();

    // * Should move focus to about link after tab
    await login.card.logInButton.press('Tab');
    await expect(footer.aboutLink.locator).toBeFocused();

    // * Should move focus to privacy policy link after tab
    await footer.aboutLink.press('Tab');
    await expect(footer.privacyLink.locator).toBeFocused();

    // * Should move focus to terms link after tab
    await footer.privacyLink.press('Tab');
    await expect(footer.termsLink.locator).toBeFocused();

    // * Should move focus to help link after tab
    await footer.termsLink.press('Tab');
    await expect(footer.helpLink.locator).toBeFocused();

    // # Move focus to login input
    await login.loginIdTextbox.focus();
    await expect(login.loginIdTextbox.locator).toBeFocused();

    // * Should move focus to the create account link after shift+tab
    await login.loginIdTextbox.press('Shift+Tab');
    await expect(login.alternate.actionLink.locator).toBeFocused();

    // * Should move focus to the header logo after shift+tab
    await login.alternate.actionLink.press('Shift+Tab');
    await expect(header.logoLink.locator).toBeFocused();
});

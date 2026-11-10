// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {openSignup} from '../../functional/auth/support';

test('/signup_user_complete accessibility quick check', async ({pw, page, axe}) => {
    // # Go to the signup page (past the native-app landing page)
    const app = await openSignup(pw, page);
    await expect(app.signup.card.emailTextbox.locator).toBeVisible();

    // # Analyze the page
    const accessibilityScanResults = await axe
        .builder(page, {disableColorContrast: true, disableLinkInTextBlock: true})
        .analyze();

    // * Should have no violation
    expect(accessibilityScanResults.violations).toHaveLength(0);
});

test('/signup_user_complete accessibility tab support', async ({pw, page}, testInfo) => {
    // # Go to the signup page (past the native-app landing page)
    const app = await openSignup(pw, page);
    const {card} = app.signup;
    const {footer, header} = app.public;
    await expect(card.emailTextbox.locator).toBeVisible();

    // * Should have focused at email input on page load
    await expect(card.emailTextbox.locator).toBeFocused();

    // * Should move focus to username input after tab
    await card.emailTextbox.locator.press('Tab');
    await expect(card.usernameTextbox.locator).toBeFocused();

    // * Should move focus to password input after tab
    await card.usernameTextbox.locator.press('Tab');
    await expect(card.passwordTextbox.locator).toBeFocused();

    // * Should move focus to password toggle button after tab
    await card.passwordTextbox.locator.press('Tab');
    await expect(card.password.toggleButton.locator).toBeFocused();

    // * Should move focus to terms and privacy checkbox after tab
    await card.password.toggleButton.locator.press('Tab');
    await expect(card.termsCheckbox.locator).toBeFocused();

    // * Should move focus to acceptable use policy link after tab
    await card.termsCheckbox.locator.press('Tab');
    await expect(card.acceptableUsePolicyLink.locator).toBeFocused();

    // * Should move focus to privacy policy link after tab
    await card.acceptableUsePolicyLink.locator.press('Tab');
    await expect(card.privacyPolicyLink.locator).toBeFocused();

    // * Should move focus to about link after tab (skips disabled create account button)
    await card.privacyPolicyLink.locator.press('Tab');
    await expect(footer.aboutLink.locator).toBeFocused();

    // * Should move focus to privacy policy link after tab
    await footer.aboutLink.locator.press('Tab');
    await expect(footer.privacyLink.locator).toBeFocused();

    // * Should move focus to terms link after tab
    await footer.privacyLink.locator.press('Tab');
    await expect(footer.termsLink.locator).toBeFocused();

    // * Should move focus to help link after tab
    await footer.termsLink.locator.press('Tab');
    await expect(footer.helpLink.locator).toBeFocused();

    // # Move focus to email input
    await card.emailTextbox.locator.focus();
    await expect(card.emailTextbox.locator).toBeFocused();

    const loginLink = app.signup.alternate.actionLink.locator;
    if (testInfo.project.name === 'ipad') {
        // * Should move focus to header back button after shift+tab
        await card.locator.press('Shift+Tab');
        await expect(header.backLink.locator).toBeFocused();

        // * Should move focus to log in link after shift+tab
        await header.backLink.locator.press('Shift+Tab');
        await expect(loginLink).toBeFocused();

        // * Should move focus to header logo after shift+tab
        await loginLink.press('Shift+Tab');
        await expect(header.logoLink.locator).toBeFocused();
    } else {
        // * Should move focus to log in link after shift+tab
        await card.locator.press('Shift+Tab');
        await expect(loginLink).toBeFocused();

        // * Should move focus to header back button after shift+tab
        await loginLink.press('Shift+Tab');
        await expect(header.backLink.locator).toBeFocused();

        // * Should move focus to header logo after shift+tab
        await header.backLink.locator.press('Shift+Tab');
        await expect(header.logoLink.locator).toBeFocused();
    }
});

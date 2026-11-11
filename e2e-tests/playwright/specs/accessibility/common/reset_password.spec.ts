// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import {App, expect, test, type PlaywrightExtended} from '@mattermost/playwright-lib';

/** Opens the reset password page (past the native-app landing page). */
async function openResetPassword(pw: PlaywrightExtended, page: Page) {
    // Set up the page not to redirect to the landing page
    await pw.hasSeenLandingPage();

    // # Go to reset password page
    const app = new App(page);
    await app.passwordResetSendLinkPage.goto();
    await expect(app.passwordReset.emailTextbox.locator).toBeVisible();
    return app;
}

test('/reset_password accessibility quick check', async ({pw, page, axe}) => {
    await openResetPassword(pw, page);

    // # Analyze the page
    const accessibilityScanResults = await axe.builder(page, {disableColorContrast: true}).analyze();

    // * Should have no violation
    expect(accessibilityScanResults.violations).toHaveLength(0);
});

test('/reset_password accessibility tab support', async ({pw, page}) => {
    const app = await openResetPassword(pw, page);
    const {passwordReset} = app;
    const {footer} = app.public;

    // * Should have focused at email input on page load
    await expect(passwordReset.emailTextbox.locator).toBeFocused();

    // * Should move focus to reset button after tab
    await passwordReset.emailTextbox.press('Tab');
    await expect(passwordReset.sendButton.locator).toBeFocused();

    // * Should move focus to about link after tab
    await passwordReset.sendButton.press('Tab');
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

    // # Move focus to email input
    await passwordReset.emailTextbox.focus();
    await expect(passwordReset.emailTextbox.locator).toBeFocused();

    // * Should move focus to back button after shift+tab
    await passwordReset.emailTextbox.press('Shift+Tab');
    await expect(passwordReset.backLink.locator).toBeFocused();
});

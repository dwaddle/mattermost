// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

test('Theme settings should be keyboard accessible', async ({axe, pw}) => {
    const {user} = await pw.initSetup();

    // # Log in as a user in new browser context
    const {app, page, channelsPage} = await pw.testBrowser.login(user);

    // # Initialize Axe
    const ab = axe.builder(page).disableRules([
        'color-contrast',
        // Known issue: These fail due to the way we've grouped plugin setting tabs together in the LHS
        'aria-required-children',
        'aria-required-parent',
    ]);

    // # Visit default channel page
    await channelsPage.goto();
    await channelsPage.toBeVisible();

    // # Open settings modal
    await app.globalHeader.clickSettingsButton();
    const {tabs} = app.userSettingsModal;
    await expect(tabs.tab('notifications').locator).toBeVisible();

    // * The settings modal should have no accessibility violations
    let accessibilityScanResults = await ab.analyze();
    expect(accessibilityScanResults.violations).toHaveLength(0);

    // # Open display tab
    await app.userSettingsModal.locator.focus();
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await page.keyboard.press('ArrowDown');

    // * The display tab should be open
    const theme = app.settings.section('theme');
    await expect(theme.locator).toBeVisible();

    // * The display tab should have no accessibility violations
    accessibilityScanResults = await ab.analyze();
    expect(accessibilityScanResults.violations).toHaveLength(0);

    // # Open the theme section
    await page.keyboard.press('Tab');
    await page.keyboard.press('Space');

    // * The theme section should be open
    await expect(theme.saveButton.locator).toBeVisible();

    // * The Premade Themes option should be focused
    const premade = theme.option('premade').locator;
    await expect(premade).toBeFocused();

    // * The theme section for premade themes should have no accessibility violations
    accessibilityScanResults = await ab.analyze();
    expect(accessibilityScanResults.violations).toHaveLength(0);

    // * Should be able to tab through the options
    for (const premadeTheme of ['denim', 'sapphire', 'quartz', 'indigo', 'onyx'] as const) {
        await page.keyboard.press('Tab');
        await expect(theme.premadeTheme(premadeTheme).locator).toBeFocused();
    }
    await page.keyboard.press('Tab');

    // Note: There's no "Apply to all your teams" option because this user is only on one team
    await expect(theme.otherThemesLink.locator).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(theme.saveButton.locator).toBeFocused();

    // # Go back to the premade/custom option
    await premade.focus();

    // # Switch to the custom theme section
    await page.keyboard.press('ArrowDown');

    // * The Custom Theme option should be focused
    await expect(theme.option('custom').locator).toBeFocused();

    // * Check the ARIA of the Sidebar Styles section
    await page.keyboard.press('Tab');
    const sidebarStyles = theme.styleToggle('sidebar').locator;
    await expect(sidebarStyles).toBeFocused();
    await expect(sidebarStyles).toHaveAttribute('aria-expanded', 'false');

    // * Check that we can tab over the collapsed section to the next section and then back again
    await page.keyboard.press('Tab');
    await expect(theme.styleToggle('center_channel').locator).toBeFocused();
    await page.keyboard.press('Shift+Tab');
    await expect(sidebarStyles).toBeFocused();

    // * Check that we can expand the section
    await page.keyboard.press('Enter');
    await expect(sidebarStyles).toHaveAttribute('aria-expanded', 'true');

    // # Wait for the expanding animation to be open
    await expect(theme.stylePanel('sidebar').locator).toHaveCSS('overflow-y', 'visible');

    // * Check that we can tab through color pickers
    for (const color of ['sidebarBg', 'sidebarText', 'sidebarHeaderBg']) {
        await page.keyboard.press('Tab');
        await expect(theme.color(color).valueTextbox.locator).toBeFocused();
    }

    // * The theme section for custom themes should have no accessibility violations
    accessibilityScanResults = await ab.analyze();
    expect(accessibilityScanResults.violations).toHaveLength(0);
});

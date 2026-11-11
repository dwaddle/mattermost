// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that focus is properly managed when opening and closing settings modal using keyboard interactions
 */
test(
    'manages focus when opening and closing settings modal with keyboard',
    {tag: ['@accessibility', '@settings']},
    async ({pw}) => {
        // # Create and sign in a new user
        const {user, team} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page} = await pw.testBrowser.login(user);
        const globalHeader = app.globalHeader;
        const settingsModal = app.userSettingsModal;

        // # Visit a default channel page
        await app.teamPage.goto({team});
        await expect(app.center.composer.locator).toBeVisible();

        // # Set focus to Settings button and press Enter
        await globalHeader.settingsButton.focus();
        await page.keyboard.press('Enter');

        // * Settings modal should be visible and focus should be on the modal
        await expect(settingsModal.locator).toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(settingsModal.locator)).toBe(true);

        // # Press Tab and verify focus is on Close button
        await page.keyboard.press('Tab');
        expect(await pw.toBeFocusedWithFocusVisible(settingsModal.closeButton.locator)).toBe(true);

        // # Press Enter and verify Settings modal is closed and focus is back on Settings button
        await page.keyboard.press('Enter');
        await expect(settingsModal.locator).not.toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(globalHeader.settingsButton.locator)).toBe(true);

        // # Open Settings modal again
        await page.keyboard.press('Enter');
        await expect(settingsModal.locator).toBeVisible();

        // # Press Escape and verify Settings modal is closed and focus is back on Settings button
        await page.keyboard.press('Escape');
        await expect(settingsModal.locator).not.toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(globalHeader.settingsButton.locator)).toBe(true);
    },
);

/**
 * @objective Verify that users can navigate between settings tabs using arrow keys
 */
test('navigates between settings tabs using arrow keys', {tag: ['@accessibility', '@settings']}, async ({pw}) => {
    // # Create and sign in a new user
    const {user, team} = await pw.initSetup();

    // # Log in a user in new browser context
    const {app, page} = await pw.testBrowser.login(user);
    const settingsModal = app.userSettingsModal;

    // # Visit a default channel page
    await app.teamPage.goto({team});
    await expect(app.center.composer.locator).toBeVisible();

    // # Set focus to Settings button and press Enter
    await app.globalHeader.settingsButton.focus();
    await page.keyboard.press('Enter');

    // * Settings modal should be visible and focus should be on the modal
    await expect(settingsModal.locator).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.locator)).toBe(true);

    // # Press Tab twice and verify focus is on Notifications tab and Notifications Settings panel is visible
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(settingsModal.tabs.tab('notifications').locator).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('notifications').locator)).toBe(true);
    await expect(app.settings.panel('notifications').locator).toBeVisible();

    // # Press arrow down key and verify focus is on Display tab and Display Settings panel is visible
    await page.keyboard.press('ArrowDown');
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('display').locator)).toBe(true);
    await expect(app.settings.panel('display').locator).toBeVisible();

    // # Press arrow down key and verify focus is on Sidebar tab and Sidebar Settings panel is visible
    await page.keyboard.press('ArrowDown');
    await expect(settingsModal.tabs.tab('sidebar').locator).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('sidebar').locator)).toBe(true);
    await expect(app.settings.panel('sidebar').locator).toBeVisible();

    // # Press Tab and verify focus is on Advanced tab and Advanced Settings panel is visible
    await page.keyboard.press('ArrowDown');
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('advanced').locator)).toBe(true);
    await expect(app.settings.panel('advanced').locator).toBeVisible();

    // # Press arrow down through the tabs plugins add after Advanced, Calls among them
    const builtInTabs = 4;
    const lastTab = settingsModal.tabs.tabItems.last();
    for (let i = 0; i < (await settingsModal.tabs.tabItems.count()) - builtInTabs; i++) {
        await page.keyboard.press('ArrowDown');
    }
    expect(await pw.toBeFocusedWithFocusVisible(lastTab)).toBe(true);

    // # Press arrow down key and verify focus is back on Notifications tab and Notifications Settings panel is visible
    await page.keyboard.press('ArrowDown');
    await expect(settingsModal.tabs.tab('notifications').locator).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('notifications').locator)).toBe(true);
    await expect(app.settings.panel('notifications').locator).toBeVisible();

    // # Press arrow up key and verify focus wraps to the last tab
    await page.keyboard.press('ArrowUp');
    expect(await pw.toBeFocusedWithFocusVisible(lastTab)).toBe(true);
});

/**
 * @objective Verify that notifications settings panel meets WCAG accessibility standards
 */
test(
    'passes accessibility scan on notifications settings panel',
    {tag: ['@accessibility', '@settings']},
    async ({pw, axe}) => {
        // # Create and sign in a new user
        const {user, team} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page} = await pw.testBrowser.login(user);
        const settingsModal = app.userSettingsModal;

        // # Visit a default channel page
        await app.teamPage.goto({team});
        await expect(app.center.composer.locator).toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.focus();
        await page.keyboard.press('Enter');

        // * Settings modal on notifications panel should be visible
        await expect(settingsModal.locator).toBeVisible();
        await expect(app.settings.panel('notifications').locator).toBeVisible();

        // * Analyze the Settings modal with notifications panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.locator.getAttribute('id')}`)
            .analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

/**
 * @objective Verify that display settings panel meets WCAG accessibility standards
 */
test(
    'passes accessibility scan on display settings panel',
    {tag: ['@accessibility', '@settings']},
    async ({pw, axe}) => {
        // # Create and sign in a new user
        const {user, team} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page} = await pw.testBrowser.login(user);
        const settingsModal = app.userSettingsModal;

        // # Visit a default channel page
        await app.teamPage.goto({team});
        await expect(app.center.composer.locator).toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.focus();
        await page.keyboard.press('Enter');

        // * Settings dialog should be visible
        await expect(settingsModal.locator).toBeVisible();

        // # Open Display tab
        await settingsModal.tabs.tab('display').select();
        await expect(app.settings.panel('display').locator).toBeVisible();

        // * Display Settings panel should be visible
        await expect(app.settings.panel('display').locator).toBeVisible();

        // * Analyze the Settings modal with display panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.locator.getAttribute('id')}`)
            .analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

/**
 * @objective Verify that sidebar settings panel meets WCAG accessibility standards
 */
test(
    'passes accessibility scan on sidebar settings panel',
    {tag: ['@accessibility', '@settings']},
    async ({pw, axe}) => {
        // # Create and sign in a new user
        const {user, team} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page} = await pw.testBrowser.login(user);
        const settingsModal = app.userSettingsModal;

        // # Visit a default channel page
        await app.teamPage.goto({team});
        await expect(app.center.composer.locator).toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.focus();
        await page.keyboard.press('Enter');

        // * Settings dialog should be visible
        await expect(settingsModal.locator).toBeVisible();

        // # Open Sidebar tab
        await settingsModal.tabs.tab('sidebar').select();
        await expect(app.settings.panel('sidebar').locator).toBeVisible();

        // * Sidebar Settings panel should be visible
        await expect(app.settings.panel('sidebar').locator).toBeVisible();

        // * Analyze the Settings modal with sidebar panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.locator.getAttribute('id')}`)
            .analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

/**
 * @objective Verify that advanced settings panel meets WCAG accessibility standards
 */
test(
    'passes accessibility scan on advanced settings panel',
    {tag: ['@accessibility', '@settings']},
    async ({pw, axe}) => {
        // # Create and sign in a new user
        const {user, team} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page} = await pw.testBrowser.login(user);
        const settingsModal = app.userSettingsModal;

        // # Visit a default channel page
        await app.teamPage.goto({team});
        await expect(app.center.composer.locator).toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.focus();
        await page.keyboard.press('Enter');

        // * Settings dialog should be visible
        await expect(settingsModal.locator).toBeVisible();

        // # Open Advanced tab
        await settingsModal.tabs.tab('advanced').select();
        await expect(app.settings.panel('advanced').locator).toBeVisible();

        // * Advanced Settings panel should be visible
        await expect(app.settings.panel('advanced').locator).toBeVisible();

        // * Analyze the Settings modal with advanced panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.locator.getAttribute('id')}`)
            .analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

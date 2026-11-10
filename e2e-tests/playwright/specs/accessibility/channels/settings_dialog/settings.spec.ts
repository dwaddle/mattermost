// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {SettingsModal} from './support';

/**
 * @objective Verify that focus is properly managed when opening and closing settings modal using keyboard interactions
 */
test(
    'manages focus when opening and closing settings modal with keyboard',
    {tag: ['@accessibility', '@settings']},
    async ({pw}) => {
        // # Create and sign in a new user
        const {user} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const globalHeader = app.globalHeader;
        const settingsModal = new SettingsModal(app);

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Set focus to Settings button and press Enter
        await globalHeader.settingsButton.locator.focus();
        await page.keyboard.press('Enter');

        // * Settings modal should be visible and focus should be on the modal
        await expect(settingsModal.container).toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(settingsModal.container)).toBe(true);

        // # Press Tab and verify focus is on Close button
        await page.keyboard.press('Tab');
        expect(await pw.toBeFocusedWithFocusVisible(settingsModal.closeButton)).toBe(true);

        // # Press Enter and verify Settings modal is closed and focus is back on Settings button
        await page.keyboard.press('Enter');
        await expect(settingsModal.container).not.toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(globalHeader.settingsButton.locator)).toBe(true);

        // # Open Settings modal again
        await page.keyboard.press('Enter');
        await expect(settingsModal.container).toBeVisible();

        // # Press Escape and verify Settings modal is closed and focus is back on Settings button
        await page.keyboard.press('Escape');
        await expect(settingsModal.container).not.toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(globalHeader.settingsButton.locator)).toBe(true);
    },
);

/**
 * @objective Verify that users can navigate between settings tabs using arrow keys
 */
test('navigates between settings tabs using arrow keys', {tag: ['@accessibility', '@settings']}, async ({pw}) => {
    // # Create and sign in a new user
    const {user} = await pw.initSetup();

    // # Log in a user in new browser context
    const {app, page, channelsPage} = await pw.testBrowser.login(user);
    const settingsModal = new SettingsModal(app);

    // # Visit a default channel page
    await channelsPage.goto();
    await channelsPage.toBeVisible();

    // # Set focus to Settings button and press Enter
    await app.globalHeader.settingsButton.locator.focus();
    await page.keyboard.press('Enter');

    // * Settings modal should be visible and focus should be on the modal
    await expect(settingsModal.container).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.container)).toBe(true);

    // # Press Tab twice and verify focus is on Notifications tab and Notifications Settings panel is visible
    await page.keyboard.press('Tab');
    await page.keyboard.press('Tab');
    await expect(settingsModal.notificationsTab).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.notificationsTab)).toBe(true);
    await expect(settingsModal.notificationsSettings.container).toBeVisible();

    // # Press arrow down key and verify focus is on Display tab and Display Settings panel is visible
    await page.keyboard.press('ArrowDown');
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.displayTab)).toBe(true);
    await expect(settingsModal.displaySettings.container).toBeVisible();

    // # Press arrow down key and verify focus is on Sidebar tab and Sidebar Settings panel is visible
    await page.keyboard.press('ArrowDown');
    await expect(settingsModal.sidebarTab).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.sidebarTab)).toBe(true);
    await expect(settingsModal.sidebarSettings.container).toBeVisible();

    // # Press Tab and verify focus is on Advanced tab and Advanced Settings panel is visible
    await page.keyboard.press('ArrowDown');
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.advancedTab)).toBe(true);
    await expect(settingsModal.advancedSettings.container).toBeVisible();

    // # Press arrow down through the tabs plugins add after Advanced, Calls among them
    const builtInTabs = 4;
    const lastTab = settingsModal.tabs.last();
    for (let i = 0; i < (await settingsModal.tabs.count()) - builtInTabs; i++) {
        await page.keyboard.press('ArrowDown');
    }
    expect(await pw.toBeFocusedWithFocusVisible(lastTab)).toBe(true);

    // # Press arrow down key and verify focus is back on Notifications tab and Notifications Settings panel is visible
    await page.keyboard.press('ArrowDown');
    await expect(settingsModal.notificationsTab).toBeVisible();
    expect(await pw.toBeFocusedWithFocusVisible(settingsModal.notificationsTab)).toBe(true);
    await expect(settingsModal.notificationsSettings.container).toBeVisible();

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
        const {user} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const settingsModal = new SettingsModal(app);

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.locator.focus();
        await page.keyboard.press('Enter');

        // * Settings modal on notifications panel should be visible
        await expect(settingsModal.container).toBeVisible();
        await expect(settingsModal.notificationsSettings.container).toBeVisible();

        // * Analyze the Settings modal with notifications panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.getContainerId()}`)
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
        const {user} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const settingsModal = new SettingsModal(app);

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.locator.focus();
        await page.keyboard.press('Enter');

        // * Settings dialog should be visible
        await expect(settingsModal.container).toBeVisible();

        // # Open Display tab
        await settingsModal.openDisplayTab();

        // * Display Settings panel should be visible
        await expect(settingsModal.displaySettings.container).toBeVisible();

        // * Analyze the Settings modal with display panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.getContainerId()}`)
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
        const {user} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const settingsModal = new SettingsModal(app);

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.locator.focus();
        await page.keyboard.press('Enter');

        // * Settings dialog should be visible
        await expect(settingsModal.container).toBeVisible();

        // # Open Sidebar tab
        await settingsModal.openSidebarTab();

        // * Sidebar Settings panel should be visible
        await expect(settingsModal.sidebarSettings.container).toBeVisible();

        // * Analyze the Settings modal with sidebar panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.getContainerId()}`)
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
        const {user} = await pw.initSetup();

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const settingsModal = new SettingsModal(app);

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Set focus to Settings button and press Enter
        await app.globalHeader.settingsButton.locator.focus();
        await page.keyboard.press('Enter');

        // * Settings dialog should be visible
        await expect(settingsModal.container).toBeVisible();

        // # Open Advanced tab
        await settingsModal.openAdvancedTab();

        // * Advanced Settings panel should be visible
        await expect(settingsModal.advancedSettings.container).toBeVisible();

        // * Analyze the Settings modal with advanced panel
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .disableRules([
                'color-contrast',

                // Known issue: These fail due to the way setting tabs are grouped.
                'aria-required-children',
                'aria-required-parent',
            ])
            .include(`#${await settingsModal.getContainerId()}`)
            .analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

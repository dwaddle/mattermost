// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {EXPANDED_SECTION, expandedSection, selectorOf} from './support';

/**
 * @objective Verify keyboard navigation works correctly through all interactive elements in the Sidebar settings panel
 */
test(
    'navigate on keyboard tab between interactive elements',
    {tag: ['@accessibility', '@settings', '@sidebar_settings']},
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

        // # Press Tab to move focus to Notifications tab
        await page.keyboard.press('Tab');
        expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('notifications').locator)).toBe(true);

        // # Press ArrowDown to navigate to Display tab
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('display').locator)).toBe(true);

        // # Press ArrowDown to navigate to Sidebar tab
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(settingsModal.tabs.tab('sidebar').locator)).toBe(true);

        // # Press Tab to move focus to Group unread channels separately button
        await page.keyboard.press('Tab');
        expect(
            await pw.toBeFocusedWithFocusVisible(app.settings.section('showUnreadsCategory').editButton.locator),
        ).toBe(true);

        // # Press Tab to move focus to Number of direct messages to show button
        await page.keyboard.press('Tab');
        expect(
            await pw.toBeFocusedWithFocusVisible(app.settings.section('limitVisibleGMsDMs').editButton.locator),
        ).toBe(true);
    },
);

/**
 * @objective Verify the Sidebar settings panel passes accessibility scan and matches aria snapshot
 */
test(
    'accessibility scan and aria-snapshot of Sidebar settings panel',
    {tag: ['@accessibility', '@settings', '@sidebar_settings', '@snapshots']},
    async ({pw, axe}) => {
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

        // * Settings modal should be visible
        await expect(settingsModal.locator).toBeVisible();

        // # Open Sidebar tab
        await settingsModal.tabs.tab('sidebar').select();
        await expect(app.settings.panel('sidebar').locator).toBeVisible();

        // * Verify aria snapshot of Sidebar settings tab
        await expect(app.settings.panel('sidebar').locator).toMatchAriaSnapshot(`
          - tabpanel "sidebar":
            - heading "Sidebar Settings" [level=3]
            - heading "Group unread channels separately" [level=4]
            - button "Group unread channels separately Edit": Edit
            - text: "Off"
            - heading "Number of direct messages to show" [level=4]
            - button "Number of direct messages to show Edit": Edit
            - text: "40"
        `);

        // * Analyze the Sidebar settings panel for accessibility issues
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .include(selectorOf(app.settings.panel('sidebar')))
            .analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

/**
 * @objective Verify the Group unread channels separately section passes accessibility scan when expanded
 */
test(
    'accessibility scan and aria-snapshot of Group unread channels separately section',
    {tag: ['@accessibility', '@settings', '@sidebar_settings', '@snapshots']},
    async ({pw, axe}) => {
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

        // * Settings modal should be visible
        await expect(settingsModal.locator).toBeVisible();

        // # Open Sidebar tab
        await settingsModal.tabs.tab('sidebar').select();
        await expect(app.settings.panel('sidebar').locator).toBeVisible();

        // # Click Edit on Group unread channels separately section
        await app.settings.section('showUnreadsCategory').editButton.click();

        // * Verify aria snapshot of Group unread channels separately section when expanded
        await expandedSection(app).waitFor();
        await expect(expandedSection(app)).toMatchAriaSnapshot({
            name: 'group_unread_channels_section.yml',
        });

        // # Analyze the expanded section for accessibility issues
        const accessibilityScanResults = await axe.builder(page).include(EXPANDED_SECTION).analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

/**
 * @objective Verify the Number of direct messages to show section passes accessibility scan when expanded
 */
test(
    'accessibility scan and aria-snapshot of Number of direct messages to show section',
    {tag: ['@accessibility', '@settings', '@sidebar_settings', '@snapshots']},
    async ({pw, axe}) => {
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

        // * Settings modal should be visible
        await expect(settingsModal.locator).toBeVisible();

        // # Open Sidebar tab
        await settingsModal.tabs.tab('sidebar').select();
        await expect(app.settings.panel('sidebar').locator).toBeVisible();

        // # Click Edit on Number of direct messages to show section
        await app.settings.section('limitVisibleGMsDMs').editButton.click();

        // * Verify aria snapshot of Number of direct messages to show section when expanded
        await expandedSection(app).waitFor();
        await expect(expandedSection(app)).toMatchAriaSnapshot({
            name: 'number_of_direct_messages_section.yml',
        });

        // # Analyze the expanded section for accessibility issues
        const accessibilityScanResults = await axe
            .builder(page)
            .include(EXPANDED_SECTION)
            .exclude('#react-select-2-input') // Exclude react-select input that has a known accessibility issue
            .analyze();

        // * Should have no violation
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, type App} from '@mattermost/playwright-lib';

/** Opens Browse Channels from the sidebar's browse-or-add menu. */
async function openBrowseChannels(app: App) {
    const dialog = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickBrowseChannelsMenuItem();
    await expect(dialog.searchTextbox.locator).toBeVisible();
    return dialog;
}

/**
 * @objective Verify accessibility support in Browse Channels Dialog screen
 */
test(
    'MM-T1467 Accessibility Support in Browse Channels Dialog screen',
    {tag: ['@accessibility', '@browse_channels']},
    async ({pw}) => {
        // # Skip test if no license
        await pw.skipIfNoLicense();

        // # Initialize setup
        const {team, user, adminClient} = await pw.initSetup();

        // # Create two channels with purposes for testing aria-label
        const channel1 = await adminClient.createChannel({
            team_id: team.id,
            name: 'accessibility-' + Date.now(),
            display_name: 'Accessibility',
            type: 'O',
            purpose: 'some purpose',
        });

        const channel2 = await adminClient.createChannel({
            team_id: team.id,
            name: 'z-accessibility-' + Date.now(),
            display_name: 'Z Accessibility',
            type: 'O',
            purpose: 'other purpose',
        });

        // # Log in as regular user
        const {app, page, channelsPage} = await pw.testBrowser.login(user);

        // # Visit town-square channel
        await channelsPage.goto(team.name, 'town-square');
        await channelsPage.toBeVisible();

        // # Open the Browse Channels modal
        const dialog = await openBrowseChannels(app);

        // * Verify the search input exists
        await expect(dialog.searchTextbox.locator).toBeVisible();

        // # Wait for channel list to load
        await expect(dialog.loading.locator).not.toBeVisible();

        // # Hide already joined channels
        await dialog.hideJoinedCheckbox.locator.click();

        // # Focus on Create Channel button and tab through elements
        // Tab order: Close → Search → Channel type filter → Hide Archived → Hide Joined → first channel
        await dialog.createChannelButton.locator.focus();
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Tab');

        // * Verify channel name is highlighted and has proper aria-label
        await expect.poll(async () => (await dialog.list.channelKeys())[0]).toBe(channel1.name);
        const channel1Item = dialog.list.channel(channel1).locator;
        await expect(channel1Item).toBeVisible();
        await expect(channel1Item).toHaveAttribute(
            'aria-label',
            `${channel1.display_name.toLowerCase()}, ${channel1.purpose.toLowerCase()}`,
        );
        await expect(channel1Item).toBeFocused();

        // # Press Tab again to move to next channel
        await page.keyboard.press('Tab');

        // * Verify focus moved to next channel
        await expect.poll(async () => (await dialog.list.channelKeys())[1]).toBe(channel2.name);
        const channel2Item = dialog.list.channel(channel2).locator;
        await expect(channel2Item).toHaveAttribute(
            'aria-label',
            `${channel2.display_name.toLowerCase()}, ${channel2.purpose.toLowerCase()}`,
        );
        await expect(channel2Item).toBeFocused();
    },
);

/**
 * @objective Verify Browse Channels dialog passes accessibility scan and matches aria-snapshot
 */
test(
    'accessibility scan and aria-snapshot of Browse Channels dialog',
    {tag: ['@accessibility', '@browse_channels', '@snapshots']},
    async ({pw, axe}) => {
        // # Skip test if no license
        await pw.skipIfNoLicense();

        // # Initialize setup
        const {team, user} = await pw.initSetup();

        // # Log in as regular user
        const {app, page, channelsPage} = await pw.testBrowser.login(user);

        // # Visit town-square channel
        await channelsPage.goto(team.name, 'town-square');
        await channelsPage.toBeVisible();

        // # Open the Browse Channels modal
        const dialog = await openBrowseChannels(app);

        // * Verify aria snapshot of Browse Channels dialog
        await expect(dialog.locator).toMatchAriaSnapshot(`
            - dialog "Browse Channels":
              - document:
                - heading "Browse Channels" [level=1]
                - button "Create New Channel"
                - button "Close"
                - textbox "Search Channels"
                - /text: \\d+ Results/
                - /status: \\d+ Results/
                - status: Channel type filter set to All
                - button "Channel type filter"
                - checkbox "Hide archived channels" [checked]: Hide Archived
                - checkbox "Hide joined channels": Hide Joined
                - search
        `);

        // * Analyze the Browse Channels dialog for accessibility issues
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .include('[role="dialog"]')
            .analyze();

        // * Should have no violations
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

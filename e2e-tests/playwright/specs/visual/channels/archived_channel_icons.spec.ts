// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify archived channel icons display correctly for public and private channels in various UI contexts
 */
test(
    'displays archive icons for public and private channels in sidebar',
    {tag: ['@visual', '@archived_channels', '@snapshots']},
    async ({pw, browserName, viewport}, testInfo) => {
        // # Initialize setup and create test channels
        const {team, user, adminClient} = await pw.initSetup();

        // # Create public and private channels
        const publicChannel = await adminClient.createChannel(
            pw.random.channel({
                teamId: team.id,
                name: 'public-to-archive',
                displayName: 'Public Archive Test',
                type: 'O',
            }),
        );

        const privateChannel = await adminClient.createChannel(
            pw.random.channel({
                teamId: team.id,
                name: 'private-to-archive',
                displayName: 'Private Archive Test',
                type: 'P',
            }),
        );

        // # Archive both channels
        await adminClient.deleteChannel(publicChannel.id);
        await adminClient.deleteChannel(privateChannel.id);

        // # Log in user
        const {app, page, channelsPage} = await pw.testBrowser.login(user);

        // # Visit town square to ensure we're in a stable state
        await channelsPage.goto(team.name, 'town-square');
        await channelsPage.toBeVisible();

        // # Open browse channels modal to show archived channels
        await page.keyboard.press('ControlOrMeta+K');
        const switcher = app.quickSwitchModal;
        await expect(switcher.searchTextbox.locator).toBeFocused();

        // # Type to search for archived channels
        await page.keyboard.type('archive');
        // (only the public one is listed: the user isn't a member of the private channel)
        await expect(switcher.suggestions.item(publicChannel.id).locator).toBeVisible();

        // # Hide dynamic content
        await pw.hideDynamicChannelsContent(page);

        // * Verify channel switcher shows both archived channels with correct icons
        const testArgs = {page, browserName, viewport};
        await pw.matchSnapshot(testInfo, testArgs);
    },
);

/**
 * @objective Verify archived channel icons display correctly in admin console channel list
 */
test(
    'displays archive icons in admin console channel list',
    {tag: ['@visual', '@archived_channels', '@admin_console', '@snapshots']},
    async ({pw, browserName, viewport}, testInfo) => {
        // # Initialize setup with admin user
        const {team, adminUser, adminClient} = await pw.initSetup();

        // # Create public and private channels
        const publicChannel = await adminClient.createChannel(
            pw.random.channel({
                teamId: team.id,
                name: 'admin-public-archive',
                displayName: 'Admin Public Archive',
                type: 'O',
            }),
        );

        const privateChannel = await adminClient.createChannel(
            pw.random.channel({
                teamId: team.id,
                name: 'admin-private-archive',
                displayName: 'Admin Private Archive',
                type: 'P',
            }),
        );

        // # Archive both channels
        await adminClient.deleteChannel(publicChannel.id);
        await adminClient.deleteChannel(privateChannel.id);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);
        const channels = app.admin.channels;

        // # Navigate to admin console channels list
        await page.goto(`${generated.AdminConsolePage.path()}/user_management/channels`);

        // # Wait for channel list to load
        await expect(channels.searchTextbox.locator).toBeVisible({timeout: 10000});

        // # Search for our test channels to bring them into view
        await channels.searchTextbox.locator.fill('Admin');
        await expect(channels.row(publicChannel.id).icon.locator).toBeVisible();
        await expect(channels.row(privateChannel.id).icon.locator).toBeVisible();

        // * Verify both archived channels are visible with correct icons
        const testArgs = {page, browserName, viewport};
        await pw.matchSnapshot(testInfo, testArgs);
    },
);

/**
 * @objective Verify archived private channel icon displays in channel header when viewing archived channel
 */
test(
    'displays archive icon in channel header for archived private channel',
    {tag: ['@visual', '@archived_channels', '@channel_header', '@snapshots']},
    async ({pw, browserName, viewport}, testInfo) => {
        // # Initialize setup
        const {team, adminUser, adminClient} = await pw.initSetup();

        // # Create a private channel
        const privateChannel = await adminClient.createChannel(
            pw.random.channel({
                teamId: team.id,
                name: 'private-header-test',
                displayName: 'Private Header Test',
                type: 'P',
            }),
        );

        // # Archive the channel
        await adminClient.deleteChannel(privateChannel.id);

        const {app, page, channelsPage} = await pw.testBrowser.login(adminUser);

        // # Visit the archived channel directly
        await channelsPage.goto(team.name, privateChannel.name);

        // # Wait for channel header to load (archived channels don't have post-create)
        // (the first load of a new team's channel can be slow on this server)
        await expect(app.channelHeader.openMenuButton.locator).toBeVisible({timeout: 60000});

        // # Verify archived channel message is visible
        await expect(app.center.archivedNotice.closeButton.locator).toBeVisible();

        // # Hide dynamic content
        await pw.hideDynamicChannelsContent(page);

        // # Focus on channel header area for snapshot
        await expect(app.channelHeader.archivedIconText.locator).toBeVisible();

        // * Verify channel header shows archive-lock icon for private archived channel
        const testArgs = {page, browserName, viewport};
        await pw.matchSnapshot(testInfo, testArgs);
    },
);

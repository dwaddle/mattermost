// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * @objective Verify per-channel suppression of join/leave system messages via
 * the Configuration tab toggle in Channel Settings.
 *
 * The toggle controls `DisableJoinLeaveMessages` on the channel:
 *   - Toggle ON  (checked)   → messages shown (DisableJoinLeaveMessages = false)
 *   - Toggle OFF (unchecked) → messages hidden (DisableJoinLeaveMessages = true)
 *
 * Join system posts are generated server-side when a user is added to a
 * channel, so tests use `adminClient.addToChannel()` to produce them; the post reads
 * "@user added to the channel by you." for the admin and "You were added to the channel by
 * @admin." for the added user.
 *
 * This spec is the reference for the generated page objects: navigation and every element
 * come from `app` (generated from the webapp's routes and testids), saving waits on the request the save
 * button fires (`settle`), and messages come from the i18n catalog (`Msg`).
 */

import {Api, expect, formatMessage, Msg, openChannelSettings, settle, test} from '@mattermost/playwright-lib';

/** The actor in a combined system message when it is the viewer ("… added to the channel by you."). */
const you = formatMessage(Msg.combined_system_message.you).toLowerCase();

test.describe('Channel Settings Modal - Join/Leave System Messages', () => {
    /**
     * @objective Verify the join/leave messages toggle is visible in Channel Settings
     * Configuration tab and defaults to ON (messages shown).
     */
    test('toggle is visible and defaults to ON (messages shown)', {tag: '@channel_settings'}, async ({pw}) => {
        // # Initialize test setup
        const {adminUser, adminClient, team} = await pw.initSetup();

        // # Create a public channel via API
        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: `jl-toggle-default-${Date.now()}`,
            display_name: 'JL Toggle Default',
            type: 'O',
        } as any);

        // # Login as admin and navigate to the channel
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel});
        await expect(app.center.postList.locator).toBeVisible();

        // # Open Channel Settings and navigate to Configuration tab
        const settings = await openChannelSettings(app, 'configuration');

        // * Toggle is visible and defaults to ON (messages shown)
        await expect(settings.configuration.joinLeaveMessagesSwitch.locator).toBeVisible();
        await expect(settings.configuration.joinLeaveMessagesSwitch.locator).toBeChecked();

        await settings.clickCloseButton();
    });

    /**
     * @objective Verify that disabling the join/leave messages toggle hides join system
     * posts from the channel timeline while keeping regular messages visible.
     */
    test(
        'disabling the toggle hides join system posts from the channel timeline',
        {tag: '@channel_settings'},
        async ({pw}) => {
            // # Initialize test setup
            const {adminUser, adminClient, team} = await pw.initSetup();

            // # Create a public channel via API
            const channel = await adminClient.createChannel({
                team_id: team.id,
                name: `jl-disable-${Date.now()}`,
                display_name: 'JL Disable Test',
                type: 'O',
            } as any);

            // # Create a second user, add to team and channel to produce a join system post
            const secondUser = await pw.createNewUserProfile(adminClient, {prefix: 'jl2'});
            await adminClient.addToTeam(team.id, secondUser.id);

            // # Post a normal message to verify it stays visible when system posts are hidden
            const regularMessage = 'This is a regular message that should remain visible';
            const regular = await adminClient.createPost({channel_id: channel.id, message: regularMessage} as any);

            // # Add the second user to the channel — this triggers a server-side join system post
            await adminClient.addToChannel(secondUser.id, channel.id);

            // # Login as admin and navigate to the channel
            const {app} = await pw.testBrowser.login(adminUser);
            await app.channelsPage.goto({team, channel});
            await expect(app.center.postList.locator).toBeVisible();
            const added = {firstUser: `@${secondUser.username}`, actor: you};

            // * The join system post is visible in the timeline before disabling
            await expect(app.center.postList).toContainMessage(
                Msg.combined_system_message.added_to_channel.one._,
                added,
                {
                    timeout: pw.duration.ten_sec,
                },
            );

            // # Open Channel Settings → Configuration tab, turn join/leave messages off and save
            const settings = await openChannelSettings(app, 'configuration');
            await settings.configuration.setJoinLeaveMessagesSwitch(false);
            const saved = await settle(settings.savePanel.saveButton, (b) => b.click(), {wait: Api.PatchChannel});
            await settings.clickCloseButton();

            // * The server stored the setting
            expect(saved.disable_join_leave_messages).toBe(true);

            // * The join system post is no longer visible — the post list re-fetches after the ETag bust
            await expect(app.center.postList).not.toContainMessage(
                Msg.combined_system_message.added_to_channel.one._,
                added,
                {timeout: pw.duration.ten_sec},
            );

            // * Normal messages are still visible (text the user typed)
            await expect(app.center.postList.post(regular).messageText.locator).toHaveText(regularMessage);
        },
    );

    /**
     * @objective Verify that a user added to a channel with DisableJoinLeaveMessages=true
     * receives a sidebar mention count badge (blue dot) even though the add-to-channel
     * system post is suppressed from the timeline.
     */
    test(
        'added user receives sidebar mention badge when join/leave messages are disabled',
        {tag: '@channel_settings'},
        async ({pw}) => {
            // # Initialize test setup
            const {adminUser, adminClient, team} = await pw.initSetup();

            // # Create a public channel and immediately disable join/leave messages
            const channel = await adminClient.createChannel({
                team_id: team.id,
                name: `jl-added-badge-${Date.now()}`,
                display_name: 'JL Added Badge Test',
                type: 'O',
            } as any);
            await adminClient.patchChannel(channel.id, {disable_join_leave_messages: true} as any);

            // # Create a second user and add them to the team (not the channel yet)
            const secondUser = await pw.createNewUserProfile(adminClient, {prefix: 'jl-badge'});
            await adminClient.addToTeam(team.id, secondUser.id);

            // # Login as secondUser and navigate to a channel so the app fully loads and
            // WS connection is established before the add-to-channel event fires
            const {app: secondApp} = await pw.testBrowser.login(secondUser);
            await secondApp.channelsPage.goto({team, channel: 'town-square'});
            await expect(secondApp.center.postList.locator).toBeVisible();

            // # Admin adds secondUser to the channel — a suppressed add-to-channel system post; the
            // server sends a targeted posted WS event only to secondUser for the notification and badge
            await adminClient.addToChannel(secondUser.id, channel.id);

            // * secondUser's sidebar shows the new channel with a mention count badge
            const row = secondApp.lhs.channelList.channel(channel);
            await expect(row.mentionBadgeText.locator).toBeVisible({timeout: pw.duration.ten_sec});

            // * The channel timeline does not contain an add-to-channel system post
            await row.clickLink();
            await expect(secondApp.center.postList).not.toContainMessage(
                Msg.combined_system_message.added_to_channel.one_you._,
                {actor: `@${adminUser.username}`},
                {timeout: pw.duration.ten_sec},
            );
        },
    );

    /**
     * @objective Verify that toggling DisableJoinLeaveMessages live-reloads the channel
     * post list for all users currently viewing the channel (Option 7 / WS reload).
     * A second user already viewing the channel should see join system posts appear or
     * disappear in real time when the admin changes the setting.
     */
    test(
        'toggling join/leave messages live-reloads the channel for other viewers',
        {tag: '@channel_settings'},
        async ({pw}) => {
            // # Initialize test setup
            const {adminUser, adminClient, team} = await pw.initSetup();

            // # Create a public channel and add a second user to produce a join system post
            const channel = await adminClient.createChannel({
                team_id: team.id,
                name: `jl-ws-reload-${Date.now()}`,
                display_name: 'JL WS Reload Test',
                type: 'O',
            } as any);

            const secondUser = await pw.createNewUserProfile(adminClient, {prefix: 'jl-ws'});
            await adminClient.addToTeam(team.id, secondUser.id);
            await adminClient.addToChannel(secondUser.id, channel.id);

            // # Login as secondUser and navigate to the channel
            const {app: secondApp} = await pw.testBrowser.login(secondUser);
            await secondApp.channelsPage.goto({team, channel});
            await expect(secondApp.center.postList.locator).toBeVisible();

            // * secondUser sees the join system post in the channel
            await expect(secondApp.center.postList).toContainMessage(
                Msg.combined_system_message.added_to_channel.one_you._,
                {actor: `@${adminUser.username}`},
                {timeout: pw.duration.ten_sec},
            );

            // # Admin logs in and disables join/leave messages from their browser
            const {app} = await pw.testBrowser.login(adminUser);
            await app.channelsPage.goto({team, channel});
            await expect(app.center.postList.locator).toBeVisible();

            const settings = await openChannelSettings(app, 'configuration');
            await settings.configuration.fill({joinLeaveMessages: false});
            await settle(settings.savePanel.saveButton, (b) => b.click(), {wait: Api.PatchChannel});
            await settings.clickCloseButton();

            // * secondUser's view updates in real time — the join post disappears without a page reload
            await expect(secondApp.center.postList).not.toContainMessage(
                Msg.combined_system_message.added_to_channel.one_you._,
                {actor: `@${adminUser.username}`},
                {timeout: pw.duration.ten_sec},
            );
        },
    );

    /**
     * @objective Verify that re-enabling the join/leave messages toggle restores
     * previously hidden join system posts (two-way door behavior).
     */
    test(
        're-enabling the toggle restores hidden join system posts (two-way door)',
        {tag: '@channel_settings'},
        async ({pw}) => {
            // # Initialize test setup
            const {adminUser, adminClient, team} = await pw.initSetup();

            // # Create a public channel via API
            const channel = await adminClient.createChannel({
                team_id: team.id,
                name: `jl-reenable-${Date.now()}`,
                display_name: 'JL Re-enable Test',
                type: 'O',
            } as any);

            // # Create a second user, add to team and channel to produce a join system post
            const secondUser = await pw.createNewUserProfile(adminClient, {prefix: 'jl3'});
            await adminClient.addToTeam(team.id, secondUser.id);
            await adminClient.addToChannel(secondUser.id, channel.id);
            const added = {firstUser: `@${secondUser.username}`, actor: you};

            // # Login as admin and navigate to the channel
            const {app} = await pw.testBrowser.login(adminUser);
            await app.channelsPage.goto({team, channel});
            await expect(app.center.postList.locator).toBeVisible();

            // # Disable join/leave messages and save
            let settings = await openChannelSettings(app, 'configuration');
            await settings.configuration.setJoinLeaveMessagesSwitch(false);
            await settle(settings.savePanel.saveButton, (b) => b.click(), {wait: Api.PatchChannel});
            await settings.clickCloseButton();

            // * Join system post is hidden after disabling — wait for post-list re-fetch
            await expect(app.center.postList).not.toContainMessage(
                Msg.combined_system_message.added_to_channel.one._,
                added,
                {timeout: pw.duration.ten_sec},
            );

            // # Re-open Channel Settings → Configuration tab and re-enable join/leave messages
            settings = await openChannelSettings(app, 'configuration');
            await settings.configuration.setJoinLeaveMessagesSwitch(true);
            await settle(settings.savePanel.saveButton, (b) => b.click(), {wait: Api.PatchChannel});
            await settings.clickCloseButton();

            // * Join system post is visible again after re-enabling
            await expect(app.center.postList).toContainMessage(
                Msg.combined_system_message.added_to_channel.one._,
                added,
                {
                    timeout: pw.duration.ten_sec,
                },
            );
        },
    );
});

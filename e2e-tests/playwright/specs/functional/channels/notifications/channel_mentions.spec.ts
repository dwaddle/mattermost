// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify disabling "Ignore mentions" counts @channel, @here, and @all as mentions.
 *
 * The channel menu, the notification preferences modal and the sidebar's mention badge are the generated page
 * objects.
 */
test('MM-T568 Channel Notifications turn off Ignore mentions for @channel, @here and @all', async ({pw}) => {
    const {adminClient, team, user} = await pw.initSetup();
    const [sender] = await adminClient.createUsers(team.id, 1, 'channel-mentions');
    const channelA = await adminClient.createPublicChannel(team.id, 'Mention Source');
    const channelB = await adminClient.createPublicChannel(team.id, 'Mention Away');
    await adminClient.addToChannel(user.id, channelA.id);
    await adminClient.addToChannel(user.id, channelB.id);
    await adminClient.addToChannel(sender.id, channelA.id);

    // # Open channel notification preferences and turn off ignore mentions
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: channelA});
    const menu = await app.channelHeader.clickOpenMenuButton();
    const notificationPreferences = await menu.clickNotificationPreferencesMenuItem();
    await notificationPreferences.setIgnoreMentionsCheckbox(false);
    await notificationPreferences.clickSaveButton();
    await expect(notificationPreferences.locator).not.toBeVisible();

    // # Move away and post each channel-wide mention from another user. @here only mentions users who
    // are currently online, so force the receiving user's status online first. Switch channels within the app:
    // a full page load closes the websocket, which marks the user offline until it reconnects. Post the next
    // mention only once the server has counted the last one: back-to-back posts race the per-post async
    // mention-count update.
    await adminClient.updateStatus({user_id: user.id, status: 'online'});
    await app.lhs.channelList.channel(channelB).clickLink();
    await expect(app.channelHeader.openMenuButton.locator).toContainText(channelB.display_name);
    const mentionCount = async () => (await adminClient.getChannelMember(channelA.id, user.id)).mention_count;
    const messages = ['@all test', '@channel test', '@here test'];
    for (const [i, message] of messages.entries()) {
        await pw.postAs(sender, {channel_id: channelA.id, message});
        await expect
            .poll(mentionCount, {message: `the server counts "${message}" as a mention before the next post`})
            .toBe(i + 1);
    }

    // * Verify the channel's mention badge counts all 3 channel-wide mentions exactly
    await expect(app.lhs.channelList.channel(channelA).mentionBadgeText.locator).toHaveText('3');
});

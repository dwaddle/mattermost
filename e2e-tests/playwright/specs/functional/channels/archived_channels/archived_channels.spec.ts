// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify the member list of an archived channel is viewable but read-only (no member management).
 */
test('MM-T1671 shows a read-only member list for an archived channel', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, adminUser, team, user} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Archive ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // * Verify the member list offers member management while the channel is active (the controls checked below)
    await (await app.channelHeader.clickOpenMenuButton()).clickMembersMenuItem();
    await expect(app.rhs.channelMembers.manageButton.locator).toBeVisible();
    await expect(app.rhs.channelMembers.addButton.locator).toBeVisible();

    // # Archive the channel
    const archiveModal = await (await app.channelHeader.clickOpenMenuButton()).clickArchiveChannelMenuItem();
    await archiveModal.confirmButton.commit();
    await expect(app.center.archivedNotice.locator).toBeVisible();

    // # Open the channel members list
    await (await app.channelHeader.clickOpenMenuButton()).clickMembersMenuItem();

    // * Verify the member list is shown with the channel members
    const members = app.rhs.channelMembers;
    await expect(members.member(adminUser).locator).toBeVisible();
    await expect(members.member(user).locator).toBeVisible();

    // * Verify member management controls are not available for the archived channel
    await expect(members.manageButton.locator).not.toBeVisible();
    await expect(members.addButton.locator).not.toBeVisible();
});

/**
 * @objective Verify a post from an archived channel can be found in search and its Jump link opens the
 * archived channel in read-only mode.
 */
test('MM-T1679 opens an archived channel by jumping from search results', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, townSquare} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Archived ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const message = `archived post ${pw.random.id()}`;
    const post = await pw.postAs(user, {channel_id: channel.id, message});
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Archive the channel, then move to another channel
    const archiveModal = await (await app.channelHeader.clickOpenMenuButton()).clickArchiveChannelMenuItem();
    await archiveModal.confirmButton.commit();
    await expect(app.center.archivedNotice.locator).toBeVisible();
    await app.lhs.channelList.channel(townSquare).clickLink();
    await expect(app.channelHeader.openMenuButton.locator).toContainText(townSquare.display_name);
    await expect(app.center.archivedNotice.locator).not.toBeVisible();

    // # Search for the message posted in the archived channel
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.inputSearchbox.fill(message);
    await app.searchBox.inputSearchbox.press('Enter');

    // # Jump to the post from the search results
    const result = app.search.results.post(post);
    await expect(result.messageText.locator).toHaveText(message);
    await result.locator.hover();
    await result.menu.clickJumpLink();

    // * Verify the archived channel is opened in read-only mode
    await expect(app.channelHeader.openMenuButton.locator).toContainText(channel.display_name);
    await expect(app.channelHeader.archivedIconText.locator).toBeVisible();
    await expect(app.center.archivedNotice.locator).toBeVisible();
    await expect(app.center.postCreate.messageTextbox.locator).not.toBeVisible();
});

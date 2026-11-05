// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {duration, expect, generated, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify the RHS thread refreshes replies when the center channel has changed.
 *
 * Written on the generated page objects: sidebar rows by channel name and the thread's posts by id.
 */
test('MM-T94 RHS fetches messages on reconnect while a different channel is in center', async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const [author] = await adminClient.createUsers(team.id, 1, 'reconnect-author');
    const threadChannel = await adminClient.createPublicChannel(team.id, 'RHS Reconnect');
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');
    await adminClient.addToChannel(user.id, threadChannel.id);
    await adminClient.addToChannel(author.id, threadChannel.id);
    const {client: authorClient} = await pw.makeClient({username: author.username, password: author.password});

    // # Open a thread in the RHS and add an initial reply
    const root = await authorClient.createPost({channel_id: threadChannel.id, message: 'reconnect root'});
    const {app, page} = await pw.testBrowser.login(user);
    await pw.mockWebsockets(page);
    await app.channelsPage.goto({team, channel: threadChannel});
    await pw.connectWebsockets(page);
    const rootPost = app.center.postList.post(root);
    await rootPost.locator.hover();
    await rootPost.menu.clickReplyButton();
    await app.rhs.postCreate.fillMessageTextbox('def');
    await app.rhs.postCreate.clickSendButton();
    await expect.poll(async () => (await app.rhs.thread.postKeys()).length).toBe(2);

    // # Change the center channel, then go offline while the author replies
    await app.lhs.channelList.channel(offTopic).clickLink();
    await pw.closeWebsockets(page);
    const missed = await authorClient.createPost({channel_id: threadChannel.id, message: 'ghi', root_id: root.id});
    await pw.wait(duration.four_sec);

    // * The reply posted while disconnected hasn't reached the RHS
    expect(await app.rhs.thread.postKeys()).not.toContain(missed.id);

    // # Reconnect and nudge the client with some activity so it resyncs missed messages
    await pw.connectWebsockets(page);
    await app.lhs.channelList.channel(townSquare).clickLink();
    await app.center.postCreate.fillMessageTextbox('nudge 1');
    await app.center.postCreate.clickSendButton();
    await app.lhs.channelList.channel(offTopic).clickLink();
    await app.center.postCreate.fillMessageTextbox('nudge 2');
    await app.center.postCreate.clickSendButton();

    // * The RHS fetches the missed reply after reconnecting
    await expect.poll(() => app.rhs.thread.postKeys(), {timeout: pw.duration.ten_sec}).toContain(missed.id);
    await expect(app.rhs.thread.post(missed).messageText.locator).toHaveText('ghi');
});

/**
 * @objective Verify channel short-linking still works when the channel reference is surrounded by brackets.
 */
test('MM-T175 Channel short-linking still works when placed in brackets', async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const linkedChannel = await adminClient.createPublicChannel(team.id, 'Shortlink Target');
    await adminClient.addToChannel(user.id, linkedChannel.id);
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const post = await userClient.createPost({channel_id: offTopic.id, message: `(~${linkedChannel.name})`});

    // # Open Off-Topic, where a bracketed channel shortlink was posted
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});

    // # Click the rendered channel link
    const markdown = new generated.Markdown(page, 'markdown', app.center.postList.post(post).locator);
    await expect(markdown.channelMention(linkedChannel.name).locator).toHaveText(`~${linkedChannel.display_name}`);
    await markdown.channelMention(linkedChannel.name).click();

    // * The linked channel opens
    await expect(page).toHavePath(generated.ChannelsPage.path({team, channel: linkedChannel}));
    await expect(app.channelHeader.openMenuButton.locator).toContainText(linkedChannel.display_name);
});

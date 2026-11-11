// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify sending a message in a channel with unread content scrolls to the newly sent message.
 */
test('MM-T216 scrolls to the bottom when sending a message', {tag: '@messaging'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const [sender] = await adminClient.createUsers(team.id, 1, 'sender');
    const testChannel = await adminClient.createPublicChannel(team.id, 'Channel Users Interactions');
    await adminClient.addToChannel(user.id, testChannel.id);
    await adminClient.addToChannel(sender.id, testChannel.id);
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const send = async (message: string) => {
        await app.center.postCreate.fillMessageTextbox(message);
        await app.center.postCreate.clickSendButton();
    };

    // # Log in, post in the test channel once, then move to Off-Topic
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: testChannel});
    await send('Hello');
    await app.lhs.channelList.channel(offTopic).clickLink();

    // # Another user posts a tall message in the test channel; the user posts in Off-Topic
    const {client: senderClient} = await pw.makeClient({username: sender.username, password: sender.password});
    await senderClient.createPost({channel_id: testChannel.id, message: `I'm messaging!${'\n2'.repeat(30)}`});
    await send('Hello');

    // # Return to the test channel
    await app.lhs.channelList.channel(testChannel).clickLink();

    // * The new-messages separator is shown
    await expect(app.center.postList.newMessages.locator).toContainText('New Messages');

    // # Send a message in the test channel
    await send('message123');

    // * The sent message is the visible last post
    const sentId = async () => {
        const {order, posts} = await userClient.getPosts(testChannel.id);
        return order.find((id) => posts[id].message === 'message123');
    };
    await expect.poll(sentId).toBeTruthy();
    const sent = app.center.postList.post({id: (await sentId())!});
    await expect(sent.messageText.locator).toHaveText('message123');
    await expect(sent.locator).toBeInViewport();
    expect((await app.center.postList.postKeys()).at(-1)).toBe(await sentId());
});

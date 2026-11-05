// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a typed draft on one channel persists, restores after switching away through the sidebar and back,
 * and posts only to the origin channel.
 *
 * Written on the generated page objects: sidebar rows are keyed by channel name, and each sent post is checked by
 * its id, read back from the server.
 */
test('typed draft stays on the origin channel after switching away and back', {tag: '@messaging'}, async ({pw}) => {
    const {team, user, userClient} = await pw.initSetup();
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');
    const lastPost = async (channelId: string) => {
        const posts = await userClient.getPosts(channelId);
        return posts.posts[posts.order[0]];
    };

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});
    await expect(app.center.postList.locator).toBeVisible();
    const composer = app.center.postCreate;

    const originDraft = `origin-draft-${pw.random.id()}`;
    const destinationMessage = `town-square-${pw.random.id()}`;

    // # Type a draft in Off-Topic and do not send it
    await composer.fillMessageTextbox(originDraft);

    // # Switch to Town Square via the sidebar
    await app.lhs.channelList.channel(townSquare).clickLink();
    await expect(app.channelHeader.openMenuButton.locator).toContainText('Town Square');

    // * The destination composer doesn't inherit the origin draft
    await expect(composer.messageTextbox.locator).toHaveValue('');

    // * The origin draft was kept: Off-Topic's row shows the draft pencil, and the Drafts link appears
    // (the pencil hides while its row is hovered, and the pointer is still over the sidebar after the click)
    await composer.messageTextbox.locator.hover();
    await expect(app.lhs.channelList.channel(offTopic).draftText.locator).toBeVisible();
    await expect(app.lhs.draftsLink.locator).toBeVisible();

    // # Send a different message from Town Square
    await composer.fillMessageTextbox(destinationMessage);
    await composer.clickSendButton();

    // * Town Square shows the destination message
    await expect.poll(async () => (await lastPost(townSquare.id)).message).toBe(destinationMessage);
    const sent = await lastPost(townSquare.id);
    await expect(app.center.postList.post(sent).messageText.locator).toHaveText(destinationMessage);

    // # Return to Off-Topic
    await app.lhs.channelList.channel(offTopic).clickLink();
    await expect(app.channelHeader.openMenuButton.locator).toContainText('Off-Topic');

    // * The origin draft is back in the composer; send it
    await expect(composer.messageTextbox.locator).toHaveValue(originDraft);
    await composer.clickSendButton();

    // * Off-Topic shows the origin draft as a post, and Town Square's last post is still the destination message
    await expect.poll(async () => (await lastPost(offTopic.id)).message).toBe(originDraft);
    const restored = await lastPost(offTopic.id);
    await expect(app.center.postList.post(restored).messageText.locator).toHaveText(originDraft);
    expect((await lastPost(townSquare.id)).id).toBe(sent.id);
});

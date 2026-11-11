// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify CJK text can be posted as both a channel message and a thread reply.
 */
test('MM-T182 Typing using CJK keyboard', {tag: '@messaging'}, async ({pw}) => {
    const {user, team, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'off-topic');
    const postIdWithText = async (text: string) => {
        const {order, posts} = await userClient.getPosts(channel.id);
        return order.find((id) => posts[id].message === text);
    };
    const message = '안녕하세요';
    const reply = '닥터 카레브';

    // # Log in and post a CJK message
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    await app.center.postCreate.fillMessageTextbox(message);
    await app.center.postCreate.clickSendButton();

    // * The new post holds the CJK text
    await expect.poll(() => postIdWithText(message)).toBeTruthy();
    const rootPost = app.center.postList.post({id: (await postIdWithText(message))!});
    await expect(rootPost.messageText.locator).toHaveText(message);

    // # Open the post's thread and send a CJK reply
    await rootPost.locator.hover();
    await rootPost.menu.clickReplyButton();
    await app.rhs.postCreate.fillMessageTextbox(reply);
    await app.rhs.postCreate.clickSendButton();

    // * The reply holds the CJK text
    await expect.poll(() => postIdWithText(reply)).toBeTruthy();
    await expect(app.rhs.thread.post({id: (await postIdWithText(reply))!}).messageText.locator).toHaveText(reply);
});

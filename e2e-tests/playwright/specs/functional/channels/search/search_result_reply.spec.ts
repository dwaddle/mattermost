// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a user can reply to a post from search results and see the reply in the opened thread.
 *
 * Written on the generated page objects: the search box, the result and the thread's posts by id.
 */
test('MM-T373 replies to a post from search results', {tag: '@search'}, async ({pw}) => {
    // # Create a uniquely searchable post and open its channel
    const {user, team, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'off-topic');
    const message = `asparagus${pw.random.id()}`;
    const post = await userClient.createPost({channel_id: channel.id, message});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Search for the post and open its thread from the result
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.inputSearchbox.locator.fill(message);
    await app.searchBox.inputSearchbox.locator.press('Enter');
    const result = app.search.results.post(post);
    await expect(result.locator).toContainText(message);
    await result.locator.hover();
    await result.menu.clickReplyButton();

    // # Post a reply in the opened thread
    const comment = `Replying to asparagus ${pw.random.id()}`;
    await app.rhs.postCreate.fillMessageTextbox(comment);
    await app.rhs.postCreate.clickSendButton();

    // * The thread shows the original post first and the new reply after it
    await expect.poll(async () => (await app.rhs.thread.postKeys()).length).toBe(2);
    const [rootId, replyId] = await app.rhs.thread.postKeys();
    expect(rootId).toBe(post.id);
    await expect(app.rhs.thread.post({id: replyId}).messageText.locator).toHaveText(comment);
});

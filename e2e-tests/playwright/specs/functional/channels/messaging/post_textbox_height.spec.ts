// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a long reply draft keeps the expanded reply textbox height after switching threads.
 *
 * Written on the generated page objects: the posts are found by id, and the reply box is the thread composer's.
 */
test('MM-T212 keeps a long draft expanded in the reply input', {tag: '@messaging'}, async ({pw}) => {
    const {team, user, userClient} = await pw.initSetup();
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const firstPost = await userClient.createPost({channel_id: offTopic.id, message: 'test post 1'});
    const secondPost = await userClient.createPost({channel_id: offTopic.id, message: 'test post 2'});
    const draft = `test${'\n'.repeat(8)}test`;

    // # Log in and open a post's thread
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});
    const openThread = async (post: typeof firstPost) => {
        const item = app.center.postList.post(post);
        await item.locator.hover();
        await item.menu.clickReplyButton();
        await expect(app.rhs.thread.post(post).locator).toBeVisible();
    };
    await openThread(secondPost);

    // * The reply textbox starts at its single-line height
    const replyInput = app.rhs.postCreate.messageTextbox.locator;
    await expect(replyInput).toHaveCSS('height', '46px');
    const initialHeight = (await replyInput.boundingBox())!.height;

    // # Enter a reply draft with enough line breaks to expand the textbox
    await app.rhs.postCreate.fillMessageTextbox(draft);

    // * The reply textbox grows to more than twice its original height
    await expect.poll(async () => (await replyInput.boundingBox())!.height).toBeGreaterThan(initialHeight * 2);

    // # Switch to the first post's thread, then back to the latest post's thread
    await openThread(firstPost);
    await openThread(secondPost);

    // * The long draft and the expanded height are restored
    await expect(replyInput).toHaveValue(draft);
    await expect.poll(async () => (await replyInput.boundingBox())!.height).toBeGreaterThan(initialHeight * 2);
});

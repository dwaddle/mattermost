// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, Msg, test} from '@mattermost/playwright-lib';

test('MM-T5435_1 Global Drafts link in sidebar should be hidden when another user deleted root post and user removes the deleted post ', async ({
    pw,
}) => {
    const {adminClient, team, user, townSquare: channel} = await pw.initSetup();

    // # Create a post in the default channel by admin
    const adminPost = await adminClient.createPost({
        channel_id: channel.id,
        message: `Admin root post ${pw.random.id()}`,
    });

    // # Log in as user and visit the default channel
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the post sent by admin in the RHS
    const centerPost = app.center.postList.post(adminPost);
    await centerPost.locator.hover();
    await centerPost.menu.clickReplyButton();

    // # Post a message as a user
    const rhsComposer = app.rhs.postCreate;
    await rhsComposer.fillMessageTextbox('Replying to a thread');
    await rhsComposer.clickSendButton();
    await expect.poll(async () => (await app.rhs.thread.postKeys()).length).toBe(2);

    // # Write a message in the reply thread but don't send it now so that it becomes a draft
    const draftMessageByUser = 'I should be in drafts by User';
    await rhsComposer.fillMessageTextbox(draftMessageByUser);

    // # Close the RHS for draft to be saved
    await app.rhs.thread.header.clickCloseButton();

    // * Verify drafts link in channel sidebar is visible
    await expect(app.lhs.draftsLink.locator).toBeVisible();

    // # Delete the post by admin
    await adminClient.deletePost(adminPost.id);

    // # Open the post in the channel sent by admin again
    await centerPost.body.locator.click();

    // * Verify drafts in user's textbox is still visible
    await expect(rhsComposer.messageTextbox.locator).toHaveValue(draftMessageByUser);

    // # Click on remove post
    const rhsPost = app.rhs.thread.post(adminPost);
    await expect(rhsPost).toContainMessage(Msg.post_body.deleted);
    await rhsPost.locator.hover();
    await rhsPost.clickRemoveButton();

    // * Verify the drafts links should also be removed from sidebar
    await expect(app.lhs.draftsLink.locator).not.toBeVisible();
});

/**
 * @objective Verify that Global Drafts link is hidden from sidebar when user deletes the root post of a thread containing a draft
 */
test(
    'MM-T5435_2 Global Drafts link in sidebar should be hidden when user deletes root post ',
    {tag: '@smoke'},
    async ({pw}) => {
        const {user, team, userClient, townSquare} = await pw.initSetup();
        // # Post a message in the channel, then log in and visit it
        const root = await userClient.createPost({channel_id: townSquare.id, message: 'Message which will be deleted'});
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Start a thread from the post's Reply button
        const post = app.center.postList.post(root);
        await post.locator.hover();
        await post.menu.clickReplyButton();

        // # Post a message in the thread
        const rhsComposer = app.rhs.postCreate;
        await rhsComposer.fillMessageTextbox('Replying to a thread');
        await rhsComposer.clickSendButton();
        await expect.poll(async () => (await app.rhs.thread.postKeys()).length).toBe(2);

        // # Write a message in the reply thread but don't send it
        await rhsComposer.fillMessageTextbox('I should be in drafts');

        // # Close the RHS for draft to be saved
        await app.rhs.thread.header.clickCloseButton();

        // * Verify drafts link in channel sidebar is visible
        await expect(app.lhs.draftsLink.locator).toBeVisible();

        // # Delete the post from its dot menu and confirm
        await post.locator.hover();
        const {deletePostModal: deleteModal} = await (await post.menu.clickDotMenuButton()).clickDeleteMenuItem();
        await deleteModal.clickDeleteButton();

        // * Verify drafts link in channel sidebar is no longer visible
        await expect(app.lhs.draftsLink.locator).not.toBeVisible();
    },
);

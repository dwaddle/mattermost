// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify selecting an emoji from the picker inserts it at the current caret position.
 */
test('MM-T95 Selecting an emoji from emoji picker should insert it at the cursor position', async ({pw}) => {
    const {user, team, userClient, offTopic: channel} = await pw.initSetup();
    // # Log in and place the caret between "Hello" and "World"
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const composer = app.center.postCreate;
    await composer.fillMessageTextbox('HelloWorld!');
    for (let i = 0; i < 'World!'.length; i++) {
        await composer.messageTextbox.locator.press('ArrowLeft');
    }

    // # Select the grinning emoji from the picker
    await composer.clickEmojiButton();
    await app.emojiPicker.emoji('grinning').click();

    // * The emoji is inserted at the caret
    await expect(composer.messageTextbox.locator).toHaveValue('Hello 😀 World!');

    // # Send the message
    await composer.clickSendButton();

    // * The server has the message as typed, and it's shown in the channel
    const sentId = async () => {
        const {order, posts} = await userClient.getPosts(channel.id);
        return order.find((id) => posts[id].message === 'Hello 😀 World!');
    };
    await expect.poll(sentId).toBeTruthy();
    await expect(app.center.postList.post({id: (await sentId())!}).messageText.locator).toContainText(
        'Hello 😀 World!',
    );
});

/**
 * @objective Verify an emoji followed by punctuation renders as an emoji without separating the punctuation.
 */
test('MM-T222 Emoji characters followed by punctuation', async ({pw}) => {
    const {user, team, userClient, offTopic: channel} = await pw.initSetup();
    const post = await userClient.createPost({channel_id: channel.id, message: ':)='});

    // # Open the channel with an emoticon followed by punctuation
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const item = app.center.postList.post(post);

    // * The emoticon renders as an emoji, and the punctuation stays right after it with no stray whitespace
    const emoji = new generated.Markdown(page, 'markdown', item.locator).emoji('slightly_smiling_face');
    await expect(emoji.locator).toHaveAttribute('aria-label', ':slightly_smiling_face:');
    await expect(item.messageText.locator).toHaveText(':)=');
});

/**
 * @objective Verify that a leading colon is ignored when searching in the emoji picker.
 */
test('MM-T156 ignores a leading colon when searching the emoji picker', {tag: '@messaging'}, async ({pw}) => {
    const {user, team, userClient, townSquare: channel} = await pw.initSetup();
    const post = await userClient.createPost({
        channel_id: channel.id,
        message: `emoji picker search ${pw.random.id()}`,
    });

    // # Open the channel and the post's reaction picker
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const item = app.center.postList.post(post);
    await item.locator.hover();
    await item.menu.clickAddReactionButton();

    // # Search using a leading colon
    await app.emojiPicker.fillSearchTextbox(':tax');

    // * The leading colon is ignored and the taxi emoji is returned
    await expect(app.emojiPicker.emoji('taxi').locator).toBeVisible();
});

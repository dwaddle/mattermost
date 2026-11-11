// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify an overlong thread reply shows the character-count warning and is not posted.
 */
test('MM-T106 Webapp: Message too long warning text', {tag: '@messaging'}, async ({pw}) => {
    const {user, team, adminClient, userClient} = await pw.initSetup();
    // MaxPostSize is a computed client-config value, so read it rather than hardcoding.
    const clientConfig = await adminClient.getClientConfig();
    const maxReplyLength = parseInt(clientConfig.MaxPostSize, 10);
    const validReply = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit. ';
    const tooLongReply = validReply.repeat(maxReplyLength / validReply.length + 1);
    const tooLongWarning = `Your message is too long. Character count: ${tooLongReply.length}/${maxReplyLength}`;

    // # Post a root message in Off-Topic, log in, and open its thread
    const channel = await userClient.getChannelByName(team.id, 'off-topic');
    const root = await userClient.createPost({channel_id: channel.id, message: `Hello ${pw.random.id()}`});
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const rootPost = app.center.postList.post(root);
    await rootPost.locator.hover();
    await rootPost.menu.clickReplyButton();
    const composer = app.rhs.postCreate;

    // # Post a valid reply
    await composer.fillMessageTextbox(validReply);
    await composer.clickSendButton();

    // * The reply is posted, and no overlong-message warning is shown
    await expect.poll(async () => (await app.rhs.thread.postKeys()).length).toBe(2);
    await expect(composer.errorText.locator).toHaveCount(0);

    // # Enter an overlong reply and try to send it
    await composer.fillMessageTextbox(tooLongReply);

    // * The character-count warning is shown, without replacing the reply textbox
    await expect(composer.errorText.locator).toHaveText(tooLongWarning);
    await expect(composer.messageTextbox.locator).toBeVisible();
    await composer.messageTextbox.locator.press('Enter');

    // * The warning remains, and nothing more was posted
    await expect(composer.errorText.locator).toHaveText(tooLongWarning);
    expect((await app.rhs.thread.postKeys()).length).toBe(2);
    const thread = await userClient.getPostThread(root.id);
    expect(thread.order).toHaveLength(2);
});

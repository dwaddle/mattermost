// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a direct message can be edited and the recipient sees the updated body and edited marker without a mention badge.
 *
 * Posts are found by id, and the inline editor, edited marker and sidebar badge are the generated page objects.
 */
test('MM-T449 edits a direct message body', {tag: '@direct_messages'}, async ({pw}) => {
    const originalMessage = 'Hello';
    const editedMessage = 'Hello World';

    // # Create a direct message and send its initial post
    const {user: sender, team, adminClient} = await pw.initSetup();
    const [recipient] = await adminClient.createUsers(team.id, 1, 'dm-edit');
    const {client: senderClient} = await pw.makeClient(sender);
    const dmChannel = await adminClient.createDirectChannel([sender.id, recipient.id]);
    const post = await senderClient.createPost({
        channel_id: dmChannel.id,
        message: originalMessage,
    });

    // # Open the direct message as the recipient
    const {
        app: recipientApp,
        channelsPage: recipientChannelsPage,
        page: recipientPage,
    } = await pw.testBrowser.login(recipient);
    await recipientChannelsPage.goto(team.name, `@${sender.username}`);
    await recipientChannelsPage.toBeVisible();

    // * Verify the original message is shown, under the post's id (sent, not pending)
    const recipientPost = recipientApp.center.postList.post(post);
    await expect(recipientPost.messageText.locator).toContainText(originalMessage);

    // # Open the direct message as the sender and edit the post with the Up arrow shortcut
    const {app: senderApp, channelsPage: senderChannelsPage} = await pw.testBrowser.login(sender);
    await senderChannelsPage.goto(team.name, `@${recipient.username}`);
    await senderChannelsPage.toBeVisible();
    await senderApp.center.postCreate.messageTextbox.locator.press('ArrowUp');
    const editor = senderApp.postEdit.editor.messageTextbox.locator;
    await expect(editor).toHaveValue(originalMessage);
    await editor.fill(editedMessage);
    await senderApp.postEdit.editor.clickSaveButton();

    // * Verify the sender sees the edited body and marker
    const senderPost = senderApp.center.postList.post(post);
    await expect(senderPost.messageText.locator).toContainText(editedMessage);
    await expect(senderPost.editedButton.locator).toBeVisible();

    // # Reload the recipient's direct message
    await recipientPage.reload();
    await recipientChannelsPage.toBeVisible();

    // * Verify the recipient sees the edit without an unread mention indicator
    await expect(recipientPost.messageText.locator).toContainText(editedMessage);
    // (only the author's marker is a button, opening the edit history; others see text)
    await expect(recipientPost.editedText.locator).toBeVisible();
    await expect(recipientApp.lhs.channelList.channel(dmChannel).mentionBadgeText.locator).not.toBeVisible();
});

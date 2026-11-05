// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that users can edit a message that has an attachment,
 * the attachment is preserved after edit, and the edited indicator appears.
 *
 * Written on the generated page objects: the post by id, its image by file id, the inline editor and the edited marker.
 */
test('MM-T2268 Edit Message with Attachment', async ({pw}) => {
    // # Post a message with an image attachment
    const {team, user, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'town-square');
    const post = await userClient.createTestPost({channel_id: channel.id, message: 'Test'}, ['mattermost.png']);

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // * Verify the post shows its message and attachment, and is not marked edited
    const shown = app.center.postList.post(post);
    await expect(shown.messageText.locator).toHaveText('Test');
    const image = shown.attachments.image({id: post.file_ids![0]});
    await expect(image.locator).toBeVisible();
    await expect(shown.editedButton.locator).not.toBeVisible();

    // # Edit the message with the Up arrow shortcut
    await app.center.postCreate.messageTextbox.locator.press('ArrowUp');
    const editor = app.postEdit.editor.messageTextbox.locator;
    await expect(editor).toHaveValue('Test');
    await editor.fill('Test with some edit');
    await app.postEdit.editor.clickSaveButton();

    // * Verify the edited message keeps its attachment and is marked edited
    // (the edited marker renders inside the message text)
    await expect(shown.messageText.locator).toContainText('Test with some edit');
    await expect(image.locator).toBeVisible();
    await expect(shown.editedButton.locator).toBeVisible();
});

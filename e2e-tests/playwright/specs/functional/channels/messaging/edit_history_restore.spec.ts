// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Api, expect, settle, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a user can view a message's edit history and restore a previous version, and that
 * cancelling the restore confirmation keeps the edited version.
 *
 * Written on the generated page objects: the composer, the inline editor, the post's "Edited" label, the
 * edit history panel (its versions keyed by the ids the server keeps them under) and the restore
 * confirmation come from `app`.
 */
test('MM-T5537 views message edit history and restores a previous version', {tag: '@messaging'}, async ({pw}) => {
    const {team, user, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'town-square');

    // # Log in and open the channel
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Post a message
    const message = `This is a message to post and then edit ${pw.random.id()}`;
    const composer = app.center.postCreate;
    await composer.fillMessageTextbox(message);
    const created = await settle(composer.sendButton, (b) => b.click(), {wait: Api.CreatePost});

    // # Open the last post for editing with the up arrow, append text, and save
    await composer.messageTextbox.locator.press('ArrowUp');
    const editor = app.postEdit.editor;
    await editor.messageTextbox.locator.press('End');
    await editor.messageTextbox.locator.pressSequentially('. I have now edited this message.');
    const edited = await settle(editor.saveButton, (b) => b.click(), {wait: Api.PatchPost});

    // * The post shows the edited text
    const post = app.center.postList.post(created);
    expect(edited.message).toBe(`${message}. I have now edited this message.`);
    await expect(post.messageText.locator).toContainText(edited.message);

    // # Open the edit history from the post's "Edited" label
    await post.clickEditedButton();

    // # Expand the previous version, kept under the id the server gives it
    const [previous] = await userClient.getPostEditHistory(created.id);
    const version = app.rhs.editHistory.version(previous);
    // (the version's title row handles the click and covers its toggle button; Enter on the button reaches it)
    await version.toggleButton.locator.press('Enter');

    // * It shows the original message
    await expect(version.messageText.locator).toContainText(message);

    // # Open the restore confirmation for the previous version, then cancel it
    const cancelled = await version.clickRestoreButton();
    await cancelled.clickCancelButton();
    await expect(cancelled.locator).toHaveCount(0);

    // * The edited version is still displayed
    await expect(post.messageText.locator).toContainText(edited.message);

    // # Restore the previous version and confirm
    const restore = await version.clickRestoreButton();
    const restored = await settle(restore.confirmButton, (b) => b.click(), {wait: Api.RestorePostVersion});

    // * The server and the post have the original message again
    expect(restored.message).toBe(message);
    await expect(post.messageText.locator).toContainText(message);
    await expect(post.messageText.locator).not.toContainText('I have now edited this message');
});

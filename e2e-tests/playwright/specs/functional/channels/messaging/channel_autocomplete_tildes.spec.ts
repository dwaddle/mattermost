// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify channel autocomplete closes when a second tilde turns channel syntax into strikethrough syntax.
 */
test(
    'MM-T173 Edit a post with strikethrough and close channel autocomplete after the second tilde',
    {tag: '@messaging'},
    async ({pw}) => {
        const {user, team, userClient, offTopic} = await pw.initSetup();
        const message = `Hello${pw.random.id()}`;
        const post = await userClient.createPost({channel_id: offTopic.id, message});

        // # Log in and open the post for editing with ArrowUp
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: offTopic});
        await app.center.postCreate.messageTextbox.locator.press('ArrowUp');
        const editInput = app.postEdit.editor.messageTextbox.locator;
        await expect(editInput).toHaveValue(message);
        const suggestions = app.postEdit.editor.message.suggestions.itemItems;

        // # Type one tilde at the start of the message
        await editInput.press('Home');
        await editInput.pressSequentially('~');

        // * Verify channel autocomplete opens
        await expect(suggestions.first()).toBeVisible();

        // # Type a second tilde at the start of the message
        await editInput.press('Home');
        await editInput.press('ArrowRight');
        await editInput.pressSequentially('~');

        // * Verify channel autocomplete closes
        await expect(suggestions).toHaveCount(0);

        // # Type one tilde after a space at the end of the message
        await editInput.press('End');
        await editInput.pressSequentially(' ~');

        // * Verify channel autocomplete opens
        await expect(suggestions.first()).toBeVisible();

        // # Type the second tilde and remove the preceding space
        await editInput.press('End');
        await editInput.pressSequentially('~');
        await expect(suggestions).toHaveCount(0);
        await editInput.press('End');
        await editInput.press('ArrowLeft');
        await editInput.press('ArrowLeft');
        await editInput.press('Backspace');

        // * Verify autocomplete stays closed
        await expect(suggestions).toHaveCount(0);

        // # Save the edited message
        await editInput.press('Enter');
        await expect(editInput).not.toBeVisible();

        // * Verify the original message is rendered as strikethrough
        await expect(app.center.postList.post(post).messageText.locator.getByRole('deletion')).toHaveText(message);
    },
);

/**
 * @objective Verify channel autocomplete closes when the tilde that opened it is deleted.
 */
test('MM-T174 Autocomplete should close if tildes are deleted using backspace', {tag: '@messaging'}, async ({pw}) => {
    const {user, team, userClient, offTopic} = await pw.initSetup();
    await userClient.createPost({channel_id: offTopic.id, message: 'foo'});

    // # Log in and open the post for editing with ArrowUp
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});
    await app.center.postCreate.messageTextbox.locator.press('ArrowUp');
    const editInput = app.postEdit.editor.messageTextbox.locator;
    await expect(editInput).toHaveValue('foo');
    const suggestions = app.postEdit.editor.message.suggestions.itemItems;

    // # Insert a tilde at the start of the message
    await editInput.press('Home');
    await editInput.pressSequentially('~');

    // * Verify channel autocomplete opens
    await expect(suggestions.first()).toBeVisible();

    // # Delete the tilde with Backspace (the caret is already after the inserted tilde)
    await editInput.press('Backspace');

    // * Verify channel autocomplete closes
    await expect(suggestions).toHaveCount(0);

    // # Save the edit
    await app.postEdit.editor.clickSaveButton();
    await expect(editInput).not.toBeVisible();
});

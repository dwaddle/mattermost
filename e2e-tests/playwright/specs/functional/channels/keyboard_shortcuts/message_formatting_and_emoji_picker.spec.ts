// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify Ctrl/Cmd+B and Ctrl/Cmd+I wrap the message text in bold and italic markdown and
 * that the posted message renders the formatting.
 */
test('MM-T3405 formats text as bold and italic with keyboard shortcuts', {tag: '@keyboard_shortcuts'}, async ({pw}) => {
    const {user, team, townSquare: channel} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    const composer = app.center.postCreate;
    const input = composer.messageTextbox.locator;
    const lastPost = async (count: number) => {
        await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThanOrEqual(count);
        return app.center.postList.post({id: (await app.center.postList.postKeys()).at(-1)!});
    };

    // # Type text, select it and press Ctrl/Cmd+B
    await input.fill('bolded text');
    await input.press('ControlOrMeta+A');
    await input.press('ControlOrMeta+B');

    // * Verify the text is wrapped in bold markdown
    await expect(input).toHaveValue('**bolded text**');

    // # Send it
    await composer.clickSendButton();
    await expect(input).toHaveValue('');

    // * Verify the post renders bold text without the markdown
    const boldPost = await lastPost(1);
    await expect(boldPost.messageText.locator.getByRole('strong')).toHaveText('bolded text');
    await expect(boldPost.messageText.locator).not.toContainText('**');

    // # Type text, select it and press Ctrl/Cmd+I
    await input.fill('italic text');
    await input.press('ControlOrMeta+A');
    await input.press('ControlOrMeta+I');

    // * Verify the text is wrapped in italic markdown
    await expect(input).toHaveValue('*italic text*');

    // # Send it
    await composer.clickSendButton();
    await expect(input).toHaveValue('');

    // * Verify the post renders italic text without the markdown
    const italicPost = await lastPost(2);
    await expect(italicPost.messageText.locator.getByRole('emphasis')).toHaveText('italic text');
    await expect(italicPost.messageText.locator).not.toContainText('*');
});

/**
 * @objective Verify the Ctrl/Cmd+Shift+\ shortcut opens the emoji picker to react to the last message,
 * and that it can be dismissed.
 */
test('MM-T4693 opens the emoji picker with the keyboard shortcut', {tag: '@keyboard_shortcuts'}, async ({pw}) => {
    const {user, team, userClient, townSquare: channel} = await pw.initSetup();
    await userClient.createPost({channel_id: channel.id, message: 'this is a test'});
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Press Ctrl/Cmd+Shift+\ in the message box
    const input = app.center.postCreate.messageTextbox.locator;
    await input.focus();
    await input.press('ControlOrMeta+Shift+\\');

    // * Verify the emoji picker opens
    await expect(app.emojiPicker.searchTextbox.locator).toBeVisible();

    // # Press Escape
    await app.emojiPicker.searchTextbox.locator.press('Escape');

    // * Verify the emoji picker closes
    await expect(app.emojiPicker.searchTextbox.locator).not.toBeVisible();
});

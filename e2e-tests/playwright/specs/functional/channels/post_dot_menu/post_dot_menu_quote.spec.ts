// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, lastPost, setWysiwygUserPreference, test} from '@mattermost/playwright-lib';

const TAGS = {tag: '@channels'};

const MESSAGE = ['Ullamcorper eu mi, dictumst nec.', '', 'Diam sapien **pellentesque** vestibulum.'].join('\n');
const QUOTE = ['> Ullamcorper eu mi, dictumst nec.', '>', '> Diam sapien **pellentesque** vestibulum.', '', ''].join(
    '\n',
);

/**
 * @objective Verify that Quote in the post menu quotes the whole message into the channel message
 * box, and that the quote and the reply typed below it are posted together.
 */
test('quotes a post into the channel message box from the post menu', TAGS, async ({pw}) => {
    const {user, userClient, team} = await pw.initSetup();
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');
    const created = await userClient.createPost({channel_id: townSquare.id, message: MESSAGE});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open the post menu and click Quote
    const post = app.center.postList.post(created);
    await post.locator.hover();
    const menu = await post.menu.clickDotMenuButton();
    await menu.quoteMenuItem.click();

    // * Verify the message is quoted with its Markdown, followed by an empty line, and the box is focused
    const composer = app.center.postCreate;
    await expect(composer.messageTextbox.locator).toHaveValue(QUOTE);
    await expect(composer.messageTextbox.locator).toBeFocused();

    // # Type a reply below the quote and send it
    await app.page.keyboard.type('What do you mean?');
    await composer.sendButton.click();

    // * Verify the posted message contains the quote followed by the reply
    const reply = (await lastPost(app.center.postList)).messageText.locator;
    await expect(reply.getByRole('blockquote')).toContainText('Diam sapien pellentesque vestibulum.');
    await expect(reply).toContainText('What do you mean?');
});

/**
 * @objective Verify that pressing Q while the post menu is open quotes the post.
 */
test('quotes a post with the Q shortcut in the post menu', TAGS, async ({pw}) => {
    const {user, userClient, team} = await pw.initSetup();
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');
    const created = await userClient.createPost({channel_id: townSquare.id, message: MESSAGE});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open the post menu and press Q
    const post = app.center.postList.post(created);
    await post.locator.hover();
    const menu = await post.menu.clickDotMenuButton();
    await expect(menu.locator).toBeVisible();
    await app.page.keyboard.press('q');

    // * Verify the menu closed and the message is quoted into the message box
    await expect(menu.locator).toBeHidden();
    await expect(app.center.postCreate.messageTextbox.locator).toHaveValue(QUOTE);
});

/**
 * @objective Verify that quoting a reply from the post menu in the RHS quotes it into the thread's
 * reply box rather than the channel message box.
 */
test('quotes a reply in the RHS into the thread reply box', TAGS, async ({pw}) => {
    const {user, userClient, team} = await pw.initSetup();
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');
    const root = await userClient.createPost({
        channel_id: townSquare.id,
        message: 'What are we doing for the logging points?',
    });
    const replyPost = await userClient.createPost({channel_id: townSquare.id, root_id: root.id, message: MESSAGE});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open the thread in the RHS
    const rootPost = app.center.postList.post(root);
    await rootPost.locator.hover();
    await rootPost.menu.clickReplyButton();
    await expect(app.rhs.thread.post(replyPost).locator).toBeVisible();

    // # Quote the reply from its post menu
    const threadReply = app.rhs.thread.post(replyPost);
    await threadReply.locator.hover();
    const menu = await threadReply.menu.clickDotMenuButton();
    await menu.quoteMenuItem.click();

    // * Verify the quote went into the thread reply box and not the channel message box
    await expect(app.rhs.postCreate.messageTextbox.locator).toHaveValue(QUOTE);
    await expect(app.center.postCreate.messageTextbox.locator).toHaveValue('');
});

test.describe('WYSIWYG editor', {tag: ['@channels', '@wysiwyg_editor']}, () => {
    test.beforeEach(async ({pw}) => {
        await pw.ensureFeatureFlag('WysiwygEditor', true);
    });

    /**
     * @objective Verify that quoting a post from the post menu into an empty WYSIWYG editor adds a
     * blockquote and that the reply typed right after it goes below the quote rather than into it.
     */
    test('quotes a post from the post menu and types the reply below the quote', async ({pw}) => {
        const {user, userClient, team} = await pw.initSetup();
        await setWysiwygUserPreference(userClient, user.id, true);
        const townSquare = await userClient.getChannelByName(team.id, 'town-square');
        const created = await userClient.createPost({
            channel_id: townSquare.id,
            message: 'Diam sapien pellentesque vestibulum.',
        });

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        const composer = app.center.postCreate;
        const editor = composer.messageTextbox.locator;
        await expect(editor).toHaveAttribute('contenteditable', 'true');

        // # Quote the post from its post menu
        const post = app.center.postList.post(created);
        await post.locator.hover();
        const menu = await post.menu.clickDotMenuButton();
        await menu.quoteMenuItem.click();

        // * Verify the editor has the quote and is focused
        await expect(editor.getByRole('blockquote')).toHaveText('Diam sapien pellentesque vestibulum.');
        await expect(editor).toBeFocused();

        // # Type a reply without moving the caret
        await app.page.keyboard.type('What do you mean?');

        // * Verify the reply went below the quote, not into it
        await expect(editor.getByRole('blockquote')).toHaveText('Diam sapien pellentesque vestibulum.');
        await expect(editor.getByRole('paragraph').last()).toHaveText('What do you mean?');

        // # Send the message
        await expect(composer.sendButton.locator).toBeEnabled();
        await composer.messageTextbox.press('Enter');

        // * Verify the posted message contains the quote followed by the reply
        const reply = (await lastPost(app.center.postList)).messageText.locator;
        await expect(reply.getByRole('blockquote')).toHaveText('Diam sapien pellentesque vestibulum.');
        await expect(reply).toContainText('What do you mean?');
    });
});

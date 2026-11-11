// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify pressing Up arrow in an empty message box opens the edit box for the last post in both
 * the center channel and a thread, and that Escape closes the edit box without saving.
 *
 * MM-T1263 covers the same behavior as MM-T1262 and is covered by this test.
 */
test(
    'MM-T1262 MM-T1263 opens and cancels the edit box with Up arrow and Escape',
    {tag: '@keyboard_shortcuts'},
    async ({pw}) => {
        const {user, team, userClient} = await pw.initSetup();
        const townSquare = await userClient.getChannelByName(team.id, 'town-square');
        const message = `edit shortcut ${pw.random.id()}`;
        const root = await userClient.createPost({channel_id: townSquare.id, message});

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});
        const editor = app.postEdit.editor.messageTextbox.locator;

        // # Press Up arrow from the empty center message box
        await app.center.postCreate.messageTextbox.locator.press('ArrowUp');

        // * Verify the edit box opens with the last message
        await expect(editor).toHaveValue(message);

        // # Close the edit box with Escape
        await editor.press('Escape');

        // * Verify the edit box closes and the post remains unchanged
        await expect(editor).not.toBeVisible();
        await expect(app.center.postList.post(root).messageText.locator).toHaveText(message);

        // # Open a thread on the post and post a reply
        const centerPost = app.center.postList.post(root);
        await centerPost.locator.hover();
        await centerPost.menu.clickReplyButton();
        const reply = `reply shortcut ${pw.random.id()}`;
        await app.rhs.postCreate.fillMessageTextbox(reply);
        await app.rhs.postCreate.clickSendButton();
        await expect.poll(async () => (await app.rhs.thread.postKeys()).length).toBe(2);
        const [, replyId] = await app.rhs.thread.postKeys();
        const replyPost = app.rhs.thread.post({id: replyId});
        await expect(replyPost.messageText.locator).toHaveText(reply);

        // # Press Up arrow from the empty thread reply box
        await app.rhs.postCreate.messageTextbox.locator.press('ArrowUp');

        // * Verify the thread edit box opens with the reply, then closes with Escape
        await expect(editor).toHaveValue(reply);
        await editor.press('Escape');
        await expect(editor).not.toBeVisible();

        // * Verify the reply is still present after cancelling the edit
        await expect(replyPost.messageText.locator).toHaveText(reply);
    },
);

/**
 * @objective Verify Shift+Enter adds new lines in the message box to compose a fenced code block, which is
 * then posted as a code block.
 *
 * MM-T1268 covers the same behavior as MM-T1267 and is covered by this test.
 */
test(
    'MM-T1267 MM-T1268 composes and posts a code block using Shift+Enter for new lines',
    {tag: '@keyboard_shortcuts'},
    async ({pw}) => {
        const {user, team, userClient} = await pw.initSetup();
        const townSquare = await userClient.getChannelByName(team.id, 'town-square');
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Compose a fenced code block using Shift+Enter for new lines
        const code = `code ${pw.random.id()}`;
        const input = app.center.postCreate.messageTextbox.locator;
        await input.focus();
        await input.pressSequentially('```');
        await input.press('Shift+Enter');
        await input.pressSequentially(code);
        await input.press('Shift+Enter');
        await input.pressSequentially('```');

        // * Verify Shift+Enter produced the multi-line fenced code block in the message box
        await expect(input).toHaveValue(`\`\`\`\n${code}\n\`\`\``);

        // # Post the code block (Enter inserts a newline inside a fenced block, so use the send button)
        await app.center.postCreate.clickSendButton();
        await expect(input).toHaveValue('');

        // * Verify the code block is posted with the code content and the fence markers consumed (rendered as a code
        // block, not literal backticks)
        await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
        const lastId = (await app.center.postList.postKeys()).at(-1)!;
        const post = app.center.postList.post({id: lastId}).messageText.locator;
        await expect(post).toContainText(code);
        await expect(post).not.toContainText('```');
    },
);

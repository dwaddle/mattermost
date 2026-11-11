// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, setWysiwygUserPreference, test, WysiwygEditor} from '@mattermost/playwright-lib';

import {selectTextWithMouse} from '../messaging/quote_selection_helpers';

const TAGS = {tag: ['@channels', '@wysiwyg_editor']};

test.describe('WYSIWYG editor - quoting selected text', TAGS, () => {
    test.beforeEach(async ({pw}) => {
        await pw.ensureFeatureFlag('WysiwygEditor', true);
    });

    /**
     * @objective Verify that quoting selected text adds a blockquote to the WYSIWYG editor and that
     * the reply typed right after it goes below the quote rather than into it.
     */
    test('quotes selected text and types the reply below the quote', async ({pw}) => {
        const {user, userClient, team, townSquare} = await pw.initSetup();
        await setWysiwygUserPreference(userClient, user.id, true);
        await userClient.createPost({
            channel_id: townSquare.id,
            message: 'Ullamcorper eu mi, dictumst nec. Diam sapien pellentesque vestibulum pretium eget massa.',
        });

        const {channelsPage, page, app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        const editor = new WysiwygEditor(page.getByTestId('center.post_create'));
        await editor.toBeVisible();

        // # Select part of the message and quote it
        const post = await channelsPage.getLastPost();
        await selectTextWithMouse(post.body.locator('.post-message__text'), 'Diam sapien pellentesque');
        await page.getByRole('button', {name: 'Quote selection'}).click();

        // * Verify the editor has the quote and is focused
        await expect(editor.input.locator('blockquote')).toHaveText('Diam sapien pellentesque');
        await expect(editor.input).toBeFocused();

        // # Type a reply without moving the caret
        await page.keyboard.type('What do you mean?');

        // * Verify the reply went below the quote, not into it
        await expect(editor.input.locator('blockquote')).toHaveText('Diam sapien pellentesque');
        await expect(editor.input.locator(':scope > p').filter({hasText: 'What do you mean?'})).toBeVisible();

        // # Send the message
        await editor.sendByEnter();

        // * Verify the posted message contains the quote followed by the reply
        const reply = await channelsPage.getLastPost();
        await expect(reply.body.locator('blockquote')).toHaveText('Diam sapien pellentesque');
        await reply.toContainText('What do you mean?');
    });
});

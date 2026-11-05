// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, type App} from '@mattermost/playwright-lib';

import {lastPostText, openRichComposer, sendRich, typeRich} from './support';

const TAGS = {tag: ['@channels', '@wysiwyg_editor']};

/** Switches channels from the sidebar and waits for the header to show the channel. */
async function switchTo(app: App, name: string, displayName: string) {
    await app.lhs.channelList.channel({name}).clickLink();
    await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
}

test.describe('WYSIWYG editor - drafts', TAGS, () => {
    test.beforeEach(async ({pw}) => {
        await pw.ensureFeatureFlag('WysiwygEditor', true);
    });

    /**
     * @objective Verify drafts typed right before switching channels are kept for each channel,
     * even when the next channel's draft changes before the first one is saved.
     */
    test('keeps drafts typed right before quick channel switches', async ({pw}) => {
        const app = await openRichComposer(pw, await pw.initSetup());
        const composer = app.center.postCreate;

        const offTopicDraft = `off-topic-draft-${pw.random.id()}`;
        const townSquareDraft = `town-square-draft-${pw.random.id()}`;

        // # Type in Off-Topic and switch away without waiting for the draft to save
        await typeRich(composer, offTopicDraft);
        await switchTo(app, 'town-square', 'Town Square');

        // # Type in Town Square and switch back right away
        await typeRich(composer, townSquareDraft);
        await switchTo(app, 'off-topic', 'Off-Topic');

        // * Each channel restores its own draft
        await expect(composer.messageTextbox.locator).toHaveText(offTopicDraft);

        await switchTo(app, 'town-square', 'Town Square');
        await expect(composer.messageTextbox.locator).toHaveText(townSquareDraft);
    });

    /**
     * @objective Verify pressing Enter immediately after typing sends the full text.
     */
    test('Enter sends text typed just before it', async ({pw}) => {
        const app = await openRichComposer(pw, await pw.initSetup());
        const composer = app.center.postCreate;

        const msg = `wysiwyg quick send ${pw.random.id()}`;

        // # Type and press Enter without waiting for the send button to enable
        await typeRich(composer, msg);
        await composer.messageTextbox.press('Enter');

        // * The whole message is posted and the editor is cleared
        await expect.poll(() => lastPostText(app.center.postList)).toContain(msg);
        await expect(composer.messageTextbox.locator).toHaveText('');
    });

    /**
     * @objective Verify a restored draft places the cursor at the end so typing continues it.
     */
    test('continues a restored draft at its end', async ({pw}) => {
        const app = await openRichComposer(pw, await pw.initSetup());
        const composer = app.center.postCreate;

        const draft = `restored-draft-${pw.random.id()}`;

        // # Leave a draft, then switch away and back
        await typeRich(composer, draft);
        await switchTo(app, 'town-square', 'Town Square');
        await switchTo(app, 'off-topic', 'Off-Topic');
        await expect(composer.messageTextbox.locator).toHaveText(draft);

        // # Keep typing without moving the cursor
        await expect(composer.messageTextbox.locator).toBeFocused();
        await app.page.keyboard.type(' continued');

        // * The new text is appended to the draft
        await expect(composer.messageTextbox.locator).toHaveText(`${draft} continued`);
    });

    /**
     * @objective Verify editing a post places the cursor at the end of its message.
     */
    test('continues a message opened for editing at its end', async ({pw}) => {
        const app = await openRichComposer(pw, await pw.initSetup());
        const composer = app.center.postCreate;

        const msg = `edit-me ${pw.random.id()}`;
        await typeRich(composer, msg);
        await sendRich(composer);
        await expect.poll(() => lastPostText(app.center.postList)).toContain(msg);

        // # Open the last post for editing and type without moving the cursor
        await composer.messageTextbox.press('ArrowUp');
        const editInput = app.postEdit.editor.messageTextbox.locator;
        await expect(editInput).toHaveText(msg);
        await expect(editInput).toBeFocused();
        await app.page.keyboard.type(' edited');
        await expect(editInput).toHaveText(`${msg} edited`);

        // # Save the edit
        await editInput.press('Enter');

        // * The post shows the appended text
        await expect(app.postEdit.editor.locator).toHaveCount(0);
        await expect.poll(() => lastPostText(app.center.postList)).toContain(`${msg} edited`);
    });
});

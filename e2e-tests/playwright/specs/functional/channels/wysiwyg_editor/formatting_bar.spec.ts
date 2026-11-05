// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test} from '@mattermost/playwright-lib';

import {expectDocument, openRichComposer, typeRich} from './support';

const TAGS = {tag: ['@channels', '@wysiwyg_editor']};

test.describe('WYSIWYG editor - formatting bar', TAGS, () => {
    test.beforeEach(async ({pw}) => {
        await pw.ensureFeatureFlag('WysiwygEditor', true);
    });

    /**
     * @objective Verify the bold and italic buttons format the selection.
     */
    test('bold and italic toolbar buttons wrap the selection', async ({pw}) => {
        const app = await openRichComposer(pw, await pw.initSetup());
        const composer = app.center.postCreate;

        // # Type a word and select it
        await typeRich(composer, 'formatme');
        await composer.messageTextbox.press('ControlOrMeta+a');

        // # Make it bold
        await composer.formattingBar.control('bold').setPressed(true);

        // * Verify it is bold
        await expectDocument(composer, /<strong>formatme<\/strong>/);

        // # Make it italic too
        await composer.formattingBar.control('italic').setPressed(true);

        // * Verify it is bold and italic
        await expectDocument(composer, /<strong><em>formatme<\/em><\/strong>|<em><strong>formatme<\/strong><\/em>/);
    });
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// These tests only toggle the per-user preference; the server flag is enabled below.

import {expect, setWysiwygUserPreference, test} from '@mattermost/playwright-lib';

import {expectRich, openRichComposer} from './support';

const TAGS = {tag: ['@channels', '@wysiwyg_editor']};

test.beforeEach(async ({pw}) => {
    await pw.ensureFeatureFlag('WysiwygEditor', true);
});

/**
 * @objective Verify the Markdown textarea stays when the user's preference is off.
 */
test('MM-69305 WYSIWYG editor is not mounted when user preference is off', TAGS, async ({pw}) => {
    const {user, team, offTopic} = await pw.initSetup();

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});

    // * Verify the composer is the Markdown textarea
    await expect(app.center.postCreate.messageTextbox.locator).toHaveJSProperty('tagName', 'TEXTAREA');
});

/**
 * @objective Verify the rich-text editor replaces the textarea when the user's preference is on.
 */
test('MM-69305 WYSIWYG editor mounts when the user preference is enabled', TAGS, async ({pw}) => {
    const app = await openRichComposer(pw, await pw.initSetup());

    // * Verify the composer is the rich-text editor
    await expect(app.center.postCreate.messageTextbox.locator).not.toHaveJSProperty('tagName', 'TEXTAREA');
});

/**
 * @objective Verify Settings > Advanced switches the composer from Markdown to rich text.
 */
test('preference toggle in Advanced Settings switches between Markdown and Rich text', TAGS, async ({pw}) => {
    const {user, team, offTopic} = await pw.initSetup();

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});
    await expect(app.center.postCreate.messageTextbox.locator).toHaveJSProperty('tagName', 'TEXTAREA');

    // # Choose rich text in Settings > Advanced and save
    await app.globalHeader.clickSettingsButton();
    await app.userSettingsModal.tabs.tab('advanced').select();
    const section = app.settings.section('wysiwygEditor');
    await section.clickEditButton();
    await section.trueRadio.check();
    await section.clickSaveButton();
    await app.userSettingsModal.clickCloseButton();

    // * Verify the composer is now the rich-text editor
    await expectRich(app.center.postCreate);
});

/**
 * @objective Verify the preference helper can be applied twice.
 */
test('helper: setWysiwygUserPreference is idempotent', TAGS, async ({pw}) => {
    const {user, userClient} = await pw.initSetup();

    await setWysiwygUserPreference(userClient, user.id, true);
    await setWysiwygUserPreference(userClient, user.id, true);

    const prefs = (await userClient.getMyPreferences()) as unknown as Array<{
        category: string;
        name: string;
        value: string;
    }>;
    const match = prefs.find((p) => p.category === 'display_settings' && p.name === 'wysiwyg_editor');
    expect(match?.value).toBe('true');
});

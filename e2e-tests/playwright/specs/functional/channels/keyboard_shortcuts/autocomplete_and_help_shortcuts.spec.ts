// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, suggestionTestKey, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that pressing Tab completes the highlighted at-mention suggestion in the message box.
 */
test('MM-T1273 completes at-mention autocomplete with Tab', {tag: '@keyboard_shortcuts'}, async ({pw}) => {
    const {user, team, townSquare: channel} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Type the start of the username and wait for the user to be the highlighted suggestion
    const composer = app.center.postCreate;
    const input = composer.messageTextbox.locator;
    await input.pressSequentially(`@${user.username.substring(0, 5)}`);
    const suggestion = composer.message.suggestions.item(suggestionTestKey(`@${user.username}`)).locator;
    await expect(suggestion).toHaveAttribute('aria-selected', 'true');

    // # Complete it with Tab
    await input.press('Tab');

    // * Verify the full mention is in the message box
    await expect(input).toHaveValue(new RegExp(`@${user.username}`));
});

/**
 * @objective Verify that pressing Tab completes the highlighted emoji suggestion in the message box.
 */
test('MM-T1274 completes emoji autocomplete with Tab', {tag: '@keyboard_shortcuts'}, async ({pw}) => {
    const {user, team, townSquare: channel} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Type the start of an emoji name and wait for it to be the highlighted suggestion
    const composer = app.center.postCreate;
    const input = composer.messageTextbox.locator;
    await input.pressSequentially(':tomato');
    // (suggestions are keyed by the text they insert: a system emoji's is the character itself)
    const suggestion = composer.message.suggestions.item(suggestionTestKey('🍅')).locator;
    await expect(suggestion).toHaveAttribute('aria-selected', 'true');

    // # Complete it with Tab
    await input.press('Tab');

    // * Verify the emoji is in the message box
    await expect(input).toHaveValue(/🍅/);
});

/**
 * @objective Verify that selecting "Keyboard shortcuts" from the Help menu opens the Keyboard Shortcuts modal.
 */
test('MM-T1279 opens keyboard shortcuts modal from the Help menu', {tag: '@keyboard_shortcuts'}, async ({pw}) => {
    const {user, team, townSquare: channel} = await pw.initSetup();
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open Keyboard shortcuts from the Help menu
    await app.globalHeader.clickHelpButton();
    const modal = await app.globalHeader.helpMenu.clickKeyboardShortcutsButton();

    // * Verify the modal opens
    await expect(modal.body.locator).toBeVisible();

    // # Close it with Escape
    await page.keyboard.press('Escape');

    // * Verify the modal closes
    await expect(modal.body.locator).not.toBeVisible();
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify the keyboard shortcuts modal opens from Ctrl/Cmd+/ and /shortcuts, displays the
 * platform-specific upload shortcut, and can be closed by the shortcut, its close button, or Escape.
 */
test('MM-T1239 CTRL/CMD+/ and /shortcuts open keyboard shortcuts', async ({pw}) => {
    const {user, team, townSquare: channel} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const input = app.center.postCreate.messageTextbox.locator;
    const modal = app.keyboardShortcutsModal;

    // # Press Ctrl/Cmd+/ in the message box
    await input.focus();
    await input.press('ControlOrMeta+/');

    // * Verify the modal opens and shows the platform's upload shortcut (Cmd+U on macOS, Ctrl+U elsewhere)
    await expect(modal.body.locator).toBeVisible();
    const modifier = process.platform === 'darwin' ? '⌘' : 'Ctrl';
    await expect(modal.files.locator).toHaveText(new RegExp(`${modifier}\\s*U\\s*$`));

    // # Press Ctrl/Cmd+/ again
    // * Verify the modal closes
    await modal.body.press('ControlOrMeta+/');
    await expect(modal.body.locator).not.toBeVisible();

    // # Run /shortcuts, then close the modal with its close button
    // * Verify it opens and closes
    await input.fill('/shortcuts');
    await input.press('Enter');
    await expect(modal.body.locator).toBeVisible();
    await modal.clickCloseButton();
    await expect(modal.body.locator).not.toBeVisible();

    // # Run /shortcuts again, then close the modal with Escape
    // * Verify it opens and closes
    await input.fill('/shortcuts');
    await input.press('Enter');
    await expect(modal.body.locator).toBeVisible();
    await modal.body.press('Escape');
    await expect(modal.body.locator).not.toBeVisible();
});

/**
 * @objective Verify Ctrl/Cmd+K channel switch keeps focus so typed characters are not lost.
 */
test('MM-T1242 CTRL/CMD+K typed characters are not lost after switching channels', async ({pw}) => {
    const {user, team, townSquare, offTopic} = await pw.initSetup();
    const message = 'Hello World!';

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    const input = app.center.postCreate.messageTextbox.locator;

    // # Open the channel switcher with Ctrl/Cmd+K and pick Off-Topic
    await input.focus();
    await input.press('ControlOrMeta+K');
    const switcher = app.quickSwitchModal;
    await switcher.searchTextbox.fill('off');
    await switcher.suggestions.item(offTopic.id).select();
    await expect(app.channelHeader.openMenuButton.locator).toContainText(offTopic.display_name);

    // # Type without clicking anywhere
    await page.keyboard.type(message);

    // * Verify the text went into the message box
    await expect(input).toHaveValue(message);
});

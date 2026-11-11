// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that on a licensed server the Bookmarks Bar option is available in the channel menu with
 * an "Add a link" action, even when the channel has no bookmarks yet.
 *
 * MM-T5601 covers the same behavior as MM-T5600 and is covered by this test.
 */
test('MM-T5600 MM-T5601 shows the Bookmarks Bar option in the channel menu', {tag: '@channels'}, async ({pw}) => {
    const {user, team} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: 'town-square'});

    // # Open the channel menu
    const menu = await app.channelHeader.clickOpenMenuButton();

    // * The Bookmarks Bar option is available
    await expect(menu.bookmarksMenuItem.locator).toBeVisible();

    // # Open the Bookmarks Bar submenu
    await menu.bookmarksMenuItem.locator.hover();

    // * The "Add a link" action is available
    await expect(menu.bookmarks.addLinkMenuItem.locator).toBeVisible();
});

/**
 * @objective Verify a user can add a link bookmark from the channel menu's Bookmarks Bar submenu and see it
 * in the channel bookmarks bar.
 */
test('MM-T5602 adds a link bookmark to the channel bookmarks bar', {tag: '@channels'}, async ({pw}) => {
    const {user, team, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'town-square');
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the Bookmarks Bar submenu from the channel menu and choose "Add a link"
    const menu = await app.channelHeader.clickOpenMenuButton();
    await menu.bookmarksMenuItem.locator.hover();
    const dialog = await menu.bookmarks.clickAddLinkMenuItem();

    // # Enter a link and add the bookmark
    await dialog.fillLinkTextbox('https://www.mattermost.com');
    await dialog.clickConfirmButton();

    // * The server has the bookmark, and it appears in the channel bookmarks bar
    await expect.poll(async () => (await userClient.getChannelBookmarks(channel.id)).length).toBe(1);
    const [bookmark] = await userClient.getChannelBookmarks(channel.id);
    expect(bookmark.link_url).toMatch(/mattermost\.com/);
    await expect(app.channelBookmarks.bookmark(bookmark).openLink.locator).toBeVisible();
});

/**
 * @objective Verify a user can add a file bookmark from the channel menu's Bookmarks Bar submenu and see it
 * in the channel bookmarks bar.
 */
test('MM-T5603 adds a file bookmark to the channel bookmarks bar', {tag: '@channels'}, async ({pw}) => {
    const {user, team, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'town-square');
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the Bookmarks Bar submenu and choose "Attach a file", selecting a file
    const menu = await app.channelHeader.clickOpenMenuButton();
    await menu.bookmarksMenuItem.locator.hover();
    const fileChooserPromise = page.waitForEvent('filechooser');
    const dialog = await menu.bookmarks.clickAttachFileMenuItem();
    const fileChooser = await fileChooserPromise;
    await fileChooser.setFiles(path.resolve('asset/mattermost-icon_128x128.png'));

    // # Confirm the file bookmark
    await dialog.clickConfirmButton();

    // * The server has a file bookmark, and it appears in the channel bookmarks bar
    await expect.poll(async () => (await userClient.getChannelBookmarks(channel.id)).length).toBe(1);
    const [bookmark] = await userClient.getChannelBookmarks(channel.id);
    expect(bookmark.type).toBe('file');
    await expect(app.channelBookmarks.bookmark(bookmark).openLink.locator).toContainText(/mattermost-icon/i);
});

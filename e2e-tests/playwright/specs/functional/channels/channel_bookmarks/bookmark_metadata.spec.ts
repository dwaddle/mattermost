// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that entering a link in the bookmark create modal auto-fills the bookmark title from the
 * link.
 */
test('MM-T5604 auto-fills the bookmark title from the entered link', {tag: '@channels'}, async ({pw}) => {
    const {user, team, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'town-square');
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the bookmark dialog from the channel menu's Bookmarks Bar submenu
    const menu = await app.channelHeader.clickOpenMenuButton();
    await menu.bookmarksMenuItem.locator.hover();
    const dialog = await menu.bookmarks.clickAddLinkMenuItem();

    // # Enter a link
    await dialog.fillLinkTextbox('https://www.amazon.com');

    // * The title is auto-filled from the link
    await expect(dialog.titleTextbox.locator).toHaveValue(/amazon/i);

    // # Cancel without saving
    await dialog.clickCancelButton();

    // * The dialog closes and nothing was saved
    await expect(dialog.locator).not.toBeVisible();
    expect(await userClient.getChannelBookmarks(channel.id)).toHaveLength(0);
});

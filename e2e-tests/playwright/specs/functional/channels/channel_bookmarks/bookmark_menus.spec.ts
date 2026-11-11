// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, settle, test} from '@mattermost/playwright-lib';

import {createLinkBookmarks} from './support';

/**
 * @objective Verify a bookmark in the bar can be renamed from its menu, and a bookmark in the overflow
 * menu can be deleted from its own menu.
 */
test('renames a bookmark from the bar and deletes one from the overflow menu', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Bookmarks ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);

    // # Add more bookmarks than the bar can show
    const bookmarks = await createLinkBookmarks(userClient, channel.id, 12);
    const first = bookmarks[0];
    const last = bookmarks[bookmarks.length - 1];

    // # Log in and open the channel
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // * The first bookmark is in the bar
    const item = app.channelBookmarks.bookmark(first);
    await expect(item.openLink.locator).toHaveText('Bookmark 1');

    // # Rename it from its menu
    await item.locator.hover();
    const menu = await item.clickOpenMenuButton();
    const editModal = await menu.clickEditMenuItem();
    await editModal.titleTextbox.fill('Renamed');

    // (opened from Edit, Save sends the update: the type knows it, so settle needs no `wait`)
    const renamed = await settle(editModal.confirmButton, (b) => b.click());
    expect(renamed.updated.display_name).toBe('Renamed');

    // * The bar shows the new name
    await expect(item.openLink.locator).toHaveText('Renamed');

    // # Open the overflow menu
    const overflow = await app.channelBookmarks.clickOpenMenuButton();

    // * The last bookmark is in it, not in the bar
    const hidden = overflow.bookmark(last);
    await expect(hidden.locator).toContainText('Bookmark 12');
    await expect(app.channelBookmarks.bookmark(last).locator).toHaveCount(0);

    // # Delete it from its menu and confirm
    await hidden.locator.hover();
    const hiddenMenu = await hidden.clickOpenMenuButton();
    const deleteModal = await hiddenMenu.clickDeleteMenuItem();
    await deleteModal.clickConfirmButton();

    // * The bookmark is gone from the channel
    await expect
        .poll(async () => (await userClient.getChannelBookmarks(channel.id)).map((b) => b.id))
        .not.toContain(last.id);
    await expect(hidden.locator).toHaveCount(0);
});

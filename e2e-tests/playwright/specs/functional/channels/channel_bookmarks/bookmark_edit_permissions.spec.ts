// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ChannelBookmark} from '@mattermost/types/channel_bookmarks';

import {expect, formatMessage, Msg, test, type App} from '@mattermost/playwright-lib';

import {createLinkBookmark} from './support';

/**
 * Bookmark management is unavailable: the bar has no menu button (it is "Add a bookmark" when the user can add and
 * nothing overflows), the bookmark's menu offers only Open and Copy link, and a keyboard reorder attempt leaves the
 * order and the link unchanged.
 */
async function expectReadOnlyBookmarks(app: App, first: ChannelBookmark, second: ChannelBookmark) {
    const bar = app.channelBookmarks;
    const item = bar.bookmark(first);

    // * Verify add, edit, and delete controls are unavailable
    await expect(item.openLink.locator).toBeVisible();
    await expect(bar.openMenuButton.locator).not.toBeVisible();
    await item.locator.hover();
    const menu = await item.clickOpenMenuButton();
    await expect(menu.openMenuItem.locator).toBeVisible();
    await expect(menu.copyLinkMenuItem.locator).toBeVisible();
    await expect(menu.editMenuItem.locator).not.toBeVisible();
    await expect(menu.deleteMenuItem.locator).not.toBeVisible();
    await app.page.keyboard.press('Escape');

    // * Verify bookmarks render in their original order
    await expect.poll(() => bar.bookmarkKeys()).toEqual([first.id, second.id]);
    const firstLink = item.openLink.locator;
    await firstLink.focus();
    await firstLink.press('Space');
    await firstLink.press('ArrowRight');
    await firstLink.press('Space');

    // * Verify the keyboard reorder attempt did not change the bookmark order or link
    await expect.poll(() => bar.bookmarkKeys()).toEqual([first.id, second.id]);
    await expect(firstLink).toHaveAttribute('href', /^https:\/\/example\.com\/first/);
}

/**
 * @objective Verify a bookmark's URL and title can be edited and saved.
 *
 * Written on the generated page objects: the bookmark (keyed by id), its menu's Edit item and the bookmark dialog.
 */
test('MM-T5610 edits a bookmark URL and title', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Edit ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const bookmark = await createLinkBookmark(
        userClient,
        channel.id,
        'Community Server',
        'https://community.mattermost.com',
    );

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const item = app.channelBookmarks.bookmark(bookmark);

    // * Verify this user can manage bookmarks: the bar's menu button is "Add a bookmark" (the button the other tests
    // expect to be missing)
    await expect(app.channelBookmarks.openMenuButton.locator).toHaveAccessibleName(
        formatMessage(Msg.channel_bookmarks.addBookmark),
    );

    // # Open the bookmark editor and change its URL and title
    await item.locator.hover();
    const editModal = await (await item.clickOpenMenuButton()).clickEditMenuItem();
    await editModal.fillLinkTextbox('https://hub.mattermost.com');
    await expect(editModal.titleTextbox.locator).toHaveValue('hub.mattermost.com');
    await expect(editModal.confirmButton.locator).toBeEnabled();
    await editModal.fillTitleTextbox('Hub Server');
    await editModal.clickConfirmButton();

    // * Verify the updated bookmark title and link
    await expect(item.openLink.locator).toHaveText('Hub Server');
    await expect(item.openLink.locator).toHaveAttribute('href', /^https:\/\/hub\.mattermost\.com/);
});

/**
 * @objective Verify users without bookmark-management permissions can only open or copy bookmarks.
 *
 * Written on the generated page objects: the bookmarks bar's menu button and bookmarks (keyed by id, in order), and
 * the bookmark menu's items.
 */
test('MM-T5615 restricts bookmark management to users with permission', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Permissions ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const first = await createLinkBookmark(userClient, channel.id, 'First link', 'https://example.com/first');
    const second = await createLinkBookmark(userClient, channel.id, 'Second link', 'https://example.com/second');

    await pw.ensurePhase2MigrationCompleted();
    const scheme = await adminClient.createScheme({
        display_name: `Bookmark permissions ${pw.random.id()}`,
        scope: 'team',
    });
    const channelUserRole = await adminClient.getRoleByName(scheme.default_channel_user_role);
    const restrictedPermissions = channelUserRole.permissions.filter((permission) => !permission.includes('bookmark'));

    // # Assign an isolated team scheme without bookmark-management permissions
    await adminClient.patchRole(channelUserRole.id, {permissions: restrictedPermissions});
    await adminClient.updateTeamScheme(team.id, scheme.id);

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // * Verify the bookmarks can be opened and copied but not added, edited, deleted or reordered
    await expectReadOnlyBookmarks(app, first, second);
});

/**
 * @objective Verify archived channels allow opening/copying bookmarks but prevent add, edit, delete, and reorder.
 *
 * Written on the generated page objects: the channel header menu's archive dialog, the bookmarks bar's menu button
 * and bookmarks (keyed by id, in order), and the bookmark menu's items.
 */
test('MM-T5725 prevents bookmark management in an archived channel', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Archived ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const first = await createLinkBookmark(userClient, channel.id, 'First link', 'https://example.com/first');
    const second = await createLinkBookmark(userClient, channel.id, 'Second link', 'https://example.com/second');

    // # Archive a channel containing two bookmarks
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const archiveModal = await (await app.channelHeader.clickOpenMenuButton()).clickArchiveChannelMenuItem();
    await archiveModal.clickConfirmButton();
    await expect(app.center.archivedNotice.locator).toBeVisible();

    // * Verify the bookmarks can be opened and copied but not added, edited, deleted or reordered
    await expectReadOnlyBookmarks(app, first, second);
});

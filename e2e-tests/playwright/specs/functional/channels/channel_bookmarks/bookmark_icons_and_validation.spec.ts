// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {createLinkBookmark} from './support';

/**
 * @objective Verify a bookmark without favicon metadata displays the fallback link icon.
 */
test('MM-T5605 uses a fallback icon when a link has no favicon', {tag: '@channels'}, async ({pw}) => {
    // # Create a link bookmark without favicon metadata
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Fallback ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const bookmark = await createLinkBookmark(userClient, channel.id, 'No favicon', 'https://invalid.example.test');

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // * Verify the fallback link icon is used
    await expect(app.channelBookmarks.bookmark(bookmark).icon.locator).toHaveAttribute(
        'data-icon-kind',
        'link-fallback',
    );
});

/**
 * @objective Verify a bookmark favicon can be changed to an emoji and reverted to its fallback icon.
 */
test(
    'MM-T5606 MM-T5607 changes a bookmark favicon to an emoji and restores the fallback',
    {tag: '@channels'},
    async ({pw}) => {
        const {adminClient, team, user, userClient} = await pw.initSetup();
        const channel = await adminClient.createPublicChannel(team.id, `Icon ${pw.random.id()}`);
        await adminClient.addToChannel(user.id, channel.id);
        const bookmark = await createLinkBookmark(
            userClient,
            channel.id,
            'Editable icon',
            'https://invalid.example.test',
        );

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel});
        const item = app.channelBookmarks.bookmark(bookmark);

        // # Edit the bookmark and choose an emoji icon
        await item.locator.hover();
        let editModal = await (await item.clickOpenMenuButton()).clickEditMenuItem();
        await editModal.clickEmojiButton();
        await app.emojiPicker.emoji('smile').click();
        await editModal.clickConfirmButton();

        // * Verify the bookmark now uses an emoji icon
        await expect(item.icon.locator).toHaveAttribute('data-icon-kind', 'emoji');

        // # Edit again and remove the emoji
        await item.locator.hover();
        editModal = await (await item.clickOpenMenuButton()).clickEditMenuItem();
        await editModal.clickRemoveEmojiButton();
        await editModal.clickConfirmButton();

        // * Verify the fallback icon is restored
        await expect(item.icon.locator).toHaveAttribute('data-icon-kind', 'link-fallback');
    },
);

/**
 * @objective Verify an invalid URL shows an error and cannot be saved as a bookmark.
 */
test('MM-T5608 rejects an invalid bookmark URL', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Invalid ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open Add bookmark and enter invalid URL text
    const menu = await app.channelHeader.clickOpenMenuButton();
    await menu.bookmarksMenuItem.locator.hover();
    const dialog = await menu.bookmarks.clickAddLinkMenuItem();
    await dialog.fillLinkTextbox('this is not a URL');

    // * Verify the validation error appears and saving is disabled
    await expect(dialog.link.messageAlert.locator).toBeVisible();
    await expect(dialog.confirmButton.locator).toBeDisabled();
});

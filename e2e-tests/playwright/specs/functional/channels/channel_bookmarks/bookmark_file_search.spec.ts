// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';

import {expect, getFileFromAsset, test, type App, type PlaywrightExtended} from '@mattermost/playwright-lib';

const fileName = 'sample_text_file.txt';

/** Uploads the sample file as a bookmark file and bookmarks it in the channel. */
async function addFileBookmark(pw: PlaywrightExtended, client: Client4, channelId: string) {
    const formData = new FormData();
    formData.set('channel_id', channelId);
    formData.set('client_ids', pw.random.id());
    formData.set('files', getFileFromAsset(fileName), fileName);
    const {
        file_infos: [file],
    } = await client.uploadFile(formData, true);
    const bookmark = await client.createChannelBookmark(
        channelId,
        {type: 'file', display_name: fileName, file_id: file.id},
        '',
    );
    return {bookmark, file};
}

/** Searches for the sample file's name and shows the Files results. */
async function searchFiles(app: App) {
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.inputSearchbox.locator.fill(fileName);
    await app.searchBox.inputSearchbox.locator.press('Enter');
    await app.search.tabs.filesTab.select();
}

/**
 * @objective Verify a file attached as a bookmark appears in Files search results.
 */
test('MM-T5613 finds a file bookmark in Files search results', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Search ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);

    // # Bookmark a file in the channel, then search for its name
    const {file} = await addFileBookmark(pw, userClient, channel.id);
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    await searchFiles(app);

    // * The bookmarked file is in the Files results
    await expect(app.search.results.file(file).locator).toBeVisible();
});

/**
 * @objective Verify deleting a file bookmark removes its file from Files search results.
 */
test('MM-T5614 removes a deleted file bookmark from Files search results', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Delete ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);

    // # Bookmark a file in the channel and confirm it's searchable
    const {bookmark, file} = await addFileBookmark(pw, userClient, channel.id);
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    await searchFiles(app);
    await expect(app.search.results.file(file).locator).toBeVisible();
    await page.keyboard.press('ControlOrMeta+.');
    await expect(app.search.results.file(file).locator).toHaveCount(0);

    // # Delete the bookmark from its menu and confirm
    const item = app.channelBookmarks.bookmark(bookmark);
    await item.locator.hover();
    const menu = await item.clickOpenMenuButton();
    const deleteModal = await menu.clickDeleteMenuItem();
    await deleteModal.clickConfirmButton();
    await expect.poll(async () => (await userClient.getChannelBookmarks(channel.id)).length).toBe(0);

    // * The deleted file is no longer in the Files results
    await searchFiles(app);
    await expect(app.search.results.file(file).locator).toHaveCount(0);
});

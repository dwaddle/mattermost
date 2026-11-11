// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify clearing a completed search displays search options without removing the existing results.
 */
test('MM-T353 displays search options after clearing the query', {tag: '@search'}, async ({pw}) => {
    // # Create a user with a searchable post and open the channel
    const {user, team, userClient, townSquare: channel} = await pw.initSetup();
    const searchWord = `Hello${pw.random.id()}`;
    const post = await userClient.createPost({channel_id: channel.id, message: searchWord});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const input = app.searchBox.inputSearchbox.locator;

    // # Search for the post, reopen search, and clear the query
    await app.globalHeader.search.clickOpenButton();
    await input.fill(searchWord);
    await input.press('Enter');
    await expect(app.search.results.post(post).locator).toBeVisible();
    await app.globalHeader.search.clickOpenButton();
    await expect(input).toHaveValue(searchWord);
    await app.searchBox.clickClearButton();
    await expect(input).toHaveValue('');

    // * The search options appear, and the existing result stays
    await expect(app.searchBox.hints.locator).toBeVisible();
    await expect(app.search.results.post(post).locator).toBeVisible();

    // # Close and reopen the search box
    await app.searchBox.clickCloseButton();
    await app.globalHeader.search.clickOpenButton();

    // * The search options are still shown
    await expect(app.searchBox.hints.locator).toBeVisible();
});

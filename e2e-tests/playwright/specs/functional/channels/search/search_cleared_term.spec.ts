// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that a cleared search term stays cleared after the search results panel is closed.
 */
test('MM-T352 keeps a cleared search term empty after closing search results', {tag: '@search'}, async ({pw}) => {
    // # Create a user with a searchable post and open the channel
    const {user, team, userClient, offTopic: channel} = await pw.initSetup();
    const term = `London${pw.random.id()}`;
    const post = await userClient.createPost({channel_id: channel.id, message: term});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const input = app.searchBox.inputSearchbox.locator;

    // # Search for the post, reopen search, and clear the query
    await app.globalHeader.search.clickOpenButton();
    await input.fill(term);
    await input.press('Enter');
    await expect(app.search.results.post(post).locator).toBeVisible();
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.clickClearButton();

    // * The query is empty while the search results stay open
    await expect(input).toHaveValue('');
    await expect(app.search.results.post(post).locator).toBeVisible();

    // # Close the search box and the results, then open search again
    await app.searchBox.clickCloseButton();
    await app.search.header.clickCloseButton();
    await app.globalHeader.search.clickOpenButton();

    // * The cleared term doesn't come back
    await expect(input).toHaveValue('');
});

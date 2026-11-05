// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, koreanTestPhrase, test, typeHangulWithIme} from '@mattermost/playwright-lib';

/**
 * @objective Verify the search box composes Korean typed through an IME and suggests the matching channel.
 *
 * Written on the generated page objects: the search box and its suggestions, keyed by channel name.
 */
test('Search box handles Korean IME correctly', async ({pw, browserName}) => {
    test.skip(browserName !== 'chromium', 'The API used to test this is only available in Chrome');

    const {userClient, user, team} = await pw.initSetup();

    // # Create a channel named after the test phrase
    const testChannel = await userClient.createChannel(
        pw.random.channel({
            teamId: team.id,
            name: 'korean-test-channel',
            displayName: koreanTestPhrase,
        }),
    );
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');

    // # Log in and open a default channel
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open the search UI
    await app.globalHeader.search.clickOpenButton();
    const input = app.searchBox.inputSearchbox.locator;
    await input.focus();

    // # Type into the textbox
    const searchText = 'in:' + koreanTestPhrase.substring(0, 3);
    await typeHangulWithIme(page, searchText);

    // * Verify that the text was typed correctly into the search box
    await expect(input).toHaveValue(searchText);

    // * Verify that the channel is suggested and highlighted
    const suggestion = app.searchBox.suggestions.item(testChannel.name).locator;
    await expect(suggestion).toHaveAttribute('aria-selected', 'true');
    await expect(suggestion).toContainText(testChannel.display_name);
});

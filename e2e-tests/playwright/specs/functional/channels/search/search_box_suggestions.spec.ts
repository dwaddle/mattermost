// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, suggestionTestKey, test} from '@mattermost/playwright-lib';

test('Search box suggestion must be case insensitive', async ({pw}) => {
    const {user, team, userClient} = await pw.initSetup();
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');

    // # Log in a user in new browser context and visit a default channel page
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    const searchWord = 'off';
    const searchOutput = `In:${offTopic.name}`;
    const input = app.searchBox.inputSearchbox.locator;
    const suggestion = app.searchBox.suggestions.item(suggestionTestKey(offTopic.name)).locator;

    for (const typed of [searchWord, searchWord.toUpperCase()]) {
        // # Open the search box, clear it, and type the channel filter (lowercase, then uppercase)
        await app.globalHeader.search.clickOpenButton();
        await input.fill('');
        await input.pressSequentially(`In:${typed}`);

        // * The suggestion should be visible and highlighted
        await expect(suggestion).toHaveAttribute('aria-selected', 'true');
        await expect(suggestion).toContainText(offTopic.display_name);

        // # Press Enter to select the suggestion and another Enter to search
        await input.press('Enter');
        await input.press('Enter');

        // * The search bar should contain the selected suggestion
        await expect(app.globalHeader.search.openButton.locator).toContainText(searchOutput);
    }
});

test('remove extra whitespace when selecting a user', async ({pw}) => {
    // # Set up test with two users
    const {user, adminUser: admin, team, userClient} = await pw.initSetup();
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');

    // # Log in as the test user and visit a default channel page
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open the search UI and type "from:" followed by multiple spaces
    await app.globalHeader.search.clickOpenButton();
    const input = app.searchBox.inputSearchbox.locator;
    await input.pressSequentially(`from:    ${admin.username}`);

    // * The suggestion should be visible and highlighted
    const suggestion = app.searchBox.suggestions.item(suggestionTestKey(`@${admin.username}`)).locator;
    await expect(suggestion).toHaveAttribute('aria-selected', 'true');
    await expect(suggestion).toContainText('@' + admin.username);

    // # Press enter to validate the selection
    await input.press('Enter');

    // * Verify the search box shows "from:username" without extra spaces
    await expect(input).toHaveValue(`from:${admin.username} `);
});

/**
 * @objective Verify that grouped search suggestions are trimmed to ten results and retain the selected channel's
 * term/item pairing.
 */
test('limits grouped channel suggestions and preserves the selected channel', {tag: '@search'}, async ({pw}) => {
    const {team, user, adminClient} = await pw.initSetup();
    const prefix = `search-trim-${pw.random.id()}`;
    const channels = [];

    // The search endpoint returns up to 50 channels; the search UI trims the grouped results to 10.
    for (let i = 0; i < 12; i++) {
        const channel = await adminClient.createPublicChannel(team.id, `Search Trim ${i} ${prefix}`, `${prefix}-${i}`);
        await adminClient.addToChannel(user.id, channel.id);
        channels.push(channel);
    }
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    await app.globalHeader.search.clickOpenButton();
    const input = app.searchBox.inputSearchbox.locator;
    await input.fill(`In:${prefix}`);

    // * Verify trimResults applies across the grouped channel results
    const {suggestions} = app.searchBox;
    await expect(suggestions.itemItems).toHaveCount(10);

    // # Select a result that survived trimming and verify the term/item pairing updates the query correctly
    const keys = await suggestions.itemKeys();
    const selectedChannel = channels.find((channel) => keys.includes(suggestionTestKey(channel.name)));
    if (!selectedChannel) {
        throw new Error('Expected at least one created channel to remain in the trimmed suggestions');
    }
    await suggestions.item(suggestionTestKey(selectedChannel.name)).locator.click();
    await expect(input).toHaveValue(new RegExp(`In:${selectedChannel.name}\\s`));
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Post} from '@mattermost/types/posts';

import {expect, generated, test, type App} from '@mattermost/playwright-lib';

/** Searches from the global header for the term. */
async function searchFor(app: App, term: string) {
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.inputSearchbox.fill(term);
    await app.searchBox.inputSearchbox.press('Enter');
}

/** The highlighted search terms in a result: the result's Markdown search highlights. */
function highlightsIn(app: App, post: Pick<Post, 'id'>) {
    return new generated.Markdown(app.page, 'markdown', app.search.results.post(post).locator).searchHighlightText
        .locator;
}

/**
 * @objective Verify that searching with trailing double quotes highlights only the searched terms, with no unexpected highlighting.
 */
test('MM-T354 highlights only the searched terms when searching with double quotes', {tag: '@search'}, async ({pw}) => {
    // # Post a message that contains the two search words plus an unrelated unique word
    const {user, team, userClient, townSquare} = await pw.initSetup();
    const marker = `zzz${pw.random.id()}`;
    const post = await userClient.createPost({channel_id: townSquare.id, message: `test tool ${marker}`});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Search using the two words followed by an empty double-quoted phrase
    await searchFor(app, 'test tool ""');

    // * Verify the message is returned
    await expect(app.search.results.post(post).messageText.locator).toContainText(marker);

    // * Verify only the two searched words are highlighted (no unexpected highlighting)
    await expect(highlightsIn(app, post)).toHaveText(['test', 'tool']);
});

/**
 * @objective Verify that the search result highlighting reflects the submitted query and does not change while the search input is edited before submitting again.
 */
test(
    'MM-T371 keeps search result highlighting unchanged while editing the search input',
    {tag: '@search'},
    async ({pw}) => {
        // # Post a message that contains two distinct words
        const {user, team, userClient, townSquare} = await pw.initSetup();
        const suffix = pw.random.id();
        const firstWord = `apple${suffix}`;
        const secondWord = `banana${suffix}`;
        const post = await userClient.createPost({channel_id: townSquare.id, message: `${firstWord} ${secondWord}`});

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Search for the first word
        await searchFor(app, firstWord);

        // * Verify the result contains both words but highlights only the searched (first) word
        await expect(app.search.results.post(post).messageText.locator).toContainText(secondWord);
        await expect(highlightsIn(app, post)).toHaveText([firstWord]);

        // # Reopen the search box and replace the query with the second word without submitting
        await app.globalHeader.search.clickOpenButton();
        const input = app.searchBox.inputSearchbox.locator;
        await expect(input).toHaveValue(firstWord);
        await input.fill(secondWord);

        // * Verify the search results still highlight the originally searched (first) word
        await expect(highlightsIn(app, post)).toHaveText([firstWord]);
    },
);

/**
 * @objective Verify that search term highlighting appears in the search results panel but does not persist in the saved or pinned message panels.
 */
test(
    'MM-T372 does not persist search highlighting in the saved or pinned message panels',
    {tag: '@search'},
    async ({pw}) => {
        // # Create a channel with a message
        const {user, team, adminClient, userClient} = await pw.initSetup();
        const channel = await adminClient.createPublicChannel(team.id, 'Highlight', 'highlight');
        await adminClient.addToChannel(user.id, channel.id);
        const token = `highlightterm${pw.random.id()}`;
        const post = await userClient.createPost({channel_id: channel.id, message: `test message ${token}`});

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel});
        const result = app.search.results.post(post);

        // # Pin the message to the channel and save it
        const centerPost = app.center.postList.post(post);
        await centerPost.locator.hover();
        await (await centerPost.menu.clickDotMenuButton()).clickPinMenuItem();
        await centerPost.locator.hover();
        await centerPost.menu.clickSaveButton();

        const openPinned = () => app.channelHeader.clickPinnedMessagesButton();

        // # Open the saved messages panel
        await app.globalHeader.clickSavedMessagesButton();
        await expect(result.messageText.locator).toContainText(token);

        // * Verify no search term is highlighted in the saved messages panel
        await expect(highlightsIn(app, post)).toHaveCount(0);

        // # Open the pinned messages panel
        await openPinned();
        await expect(result.messageText.locator).toContainText(token);

        // * Verify no search term is highlighted in the pinned messages panel
        await expect(highlightsIn(app, post)).toHaveCount(0);

        // # Search for the message so the term is highlighted
        await searchFor(app, token);
        await expect(result.messageText.locator).toContainText(token);

        // * Verify the search term is highlighted in the search results panel
        await expect(highlightsIn(app, post).first()).toBeVisible();

        // # Close the search results panel, then reopen the saved messages panel
        await app.search.header.clickCloseButton();
        await app.globalHeader.clickSavedMessagesButton();
        await expect(result.messageText.locator).toContainText(token);

        // * Verify the previously searched term is not highlighted in the saved messages panel
        await expect(highlightsIn(app, post)).toHaveCount(0);

        // # Reopen the pinned messages panel
        await openPinned();
        await expect(result.messageText.locator).toContainText(token);

        // * Verify the previously searched term is not highlighted in the pinned messages panel
        await expect(highlightsIn(app, post)).toHaveCount(0);
    },
);

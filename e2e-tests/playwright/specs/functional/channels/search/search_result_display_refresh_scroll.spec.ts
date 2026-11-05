// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Post} from '@mattermost/types/posts';

import {duration, expect, generated, test, type App} from '@mattermost/playwright-lib';

/**
 * @objective Verify message search displays matching results in the right-hand side, rendering markdown
 * content correctly, and that jumping to the conversation and clearing the query keep results intact.
 *
 * Written on the generated page objects: the search box, the result by post id with its Jump link and its Markdown
 * hashtag; the heading and code block are read by their ARIA roles.
 */
test('MM-T350 Searching displays results in the RHS', async ({pw}) => {
    const {adminClient, team, user} = await pw.initSetup();
    const channel = await adminClient.getChannelByName(team.id, 'off-topic');
    const identifier = pw.random.id();
    const message = [
        `Basic word search: Hello world! #hello ${identifier}`,
        '',
        '##### Hello',
        '',
        '```',
        'Hello',
        '```',
    ].join('\n');

    // # Create and search for a message with markdown content: a heading, a code block, and a hashtag
    const post = await pw.postAs(user, {channel_id: channel.id, message});

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    const query = `hello ${identifier}`;
    await submitSearch(app, query);

    // * Verify the matching result appears in the RHS with each markdown element rendered distinctly
    await expectSearchResult(app, post, query);
    const result = app.search.results.post(post);
    await expect(result.messageText.locator.getByRole('heading', {level: 5})).toContainText('Hello');
    await expect(result.messageText.locator.getByRole('code')).toContainText('Hello');
    await expect(new generated.Markdown(page, 'markdown', result.locator).hashtagLink.locator).toHaveText('#hello');

    // # Jump to the conversation from the search result
    await result.locator.hover();
    await result.menu.clickJumpLink();

    // # Reopen search and clear the query text
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.inputSearchbox.locator.fill('');

    // * Verify the search results remain visible after clearing the query text
    await expect(result.locator).toBeVisible();
});

/**
 * @objective Verify that a new search replaces the previous results instead of combining them.
 *
 * Written on the generated page objects: the search box and the results by post id.
 */
test('MM-T355 replaces old search results with new results', {tag: '@search'}, async ({pw}) => {
    // # Create a message in Town Square and one in Off-Topic
    const {user, team, userClient} = await pw.initSetup();
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const helloToken = `hello${pw.random.id()}`;
    const writingToken = `writing${pw.random.id()}`;
    const hello = await userClient.createPost({channel_id: townSquare.id, message: `${helloToken} there everyone`});
    const writing = await userClient.createPost({channel_id: offTopic.id, message: `${writingToken} to you here`});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Search for the first message
    await submitSearch(app, helloToken);

    // * Verify the first message is shown in the results
    await expect.poll(() => app.search.results.postKeys()).toEqual([hello.id]);

    // # Run a new search for the second message from another channel
    await app.lhs.channelList.channel(offTopic).clickLink();
    await submitSearch(app, writingToken);

    // * Verify the new results are shown and the old results are gone
    await expect.poll(() => app.search.results.postKeys()).toEqual([writing.id]);
});

/**
 * @objective Verify that scrolling the center channel while the search results panel is open does not change the results.
 *
 * Written on the generated page objects: the search box, the results' keys, and the center post list's scrolling
 * element.
 */
test('MM-T382 keeps search results unchanged while scrolling the center channel', {tag: '@search'}, async ({pw}) => {
    // # Create and log in as a test user, and open a channel with many matching posts
    const {user, team, adminClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, 'Search Scroll', 'search-scroll');
    await adminClient.addToChannel(user.id, channel.id);
    const token = `searchfun${pw.random.id()}`;
    const messageCount = 30;
    for (let i = 0; i < messageCount; i++) {
        await adminClient.createPost({channel_id: channel.id, message: `${token} ${i}`});
    }

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Search for the matching posts
    await submitSearch(app, token);
    await expect.poll(async () => (await app.search.results.postKeys()).length).toBeGreaterThan(0);
    const resultsBefore = await app.search.results.postKeys();

    // # Scroll the center channel up to load older messages
    const box = await app.center.postList.scroller.locator.boundingBox();
    expect(box).not.toBeNull();
    await page.mouse.move(box!.x + box!.width / 2, box!.y + box!.height / 2);
    for (let i = 0; i < 6; i++) {
        await page.mouse.wheel(0, -1500);
        await pw.wait(pw.duration.half_sec);
    }

    // * Verify the search results panel is still open and its results are unchanged
    expect(await app.search.results.postKeys()).toEqual(resultsBefore);
    await expect(app.search.results.post({id: resultsBefore[0]}).messageText.locator).toContainText(token);
});

async function submitSearch(app: App, query: string) {
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.inputSearchbox.locator.fill(query);
    await app.searchBox.inputSearchbox.locator.press('Enter');
}

/** The post shows in the results; the search is retried while the server indexes it. */
async function expectSearchResult(app: App, post: Post, query: string, timeout = duration.half_min) {
    const result = app.search.results.post(post).locator;
    await expect(async () => {
        if (await result.isVisible({timeout: duration.one_sec}).catch(() => false)) {
            return;
        }
        await submitSearch(app, query);
        await expect(result).toBeVisible({timeout: duration.one_sec * 5});
    }).toPass({timeout});
}

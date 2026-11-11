// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test, type App} from '@mattermost/playwright-lib';

/** Searches from the global header for the term. */
async function searchFor(app: App, term: string) {
    await app.globalHeader.search.clickOpenButton();
    await app.searchBox.inputSearchbox.fill(term);
    await app.searchBox.inputSearchbox.press('Enter');
}

/**
 * @objective Verify that a full username containing '-' or '_' is shown as a mention link in the mentioned user's search results.
 */
test('MM-T348 shows a full special-character username as a link in search results', {tag: '@search'}, async ({pw}) => {
    // # Create a user whose username contains '-' and '_', plus a user who mentions them
    const {team, adminClient, userClient, townSquare} = await pw.initSetup();
    const [specialUser] = await adminClient.createUsers(team.id, 1, 'test-user_');
    await adminClient.addToChannel(specialUser.id, townSquare.id);

    // # The first user posts a message mentioning the special-character username
    const token = `mention${pw.random.id()}`;
    const post = await userClient.createPost({channel_id: townSquare.id, message: `@${specialUser.username} ${token}`});

    // # Log in as the mentioned user and open Recent Mentions
    const {app, page} = await pw.testBrowser.login(specialUser);
    await app.channelsPage.goto({team, channel: townSquare});
    await app.globalHeader.clickRecentMentionsButton();

    // * Verify the mention shows the full username as a mention of that user (the mention keyed by the user's id,
    // inside its profile popover's button)
    const result = app.search.results.post(post);
    await expect(result.messageText.locator).toContainText(token);
    const mention = new generated.Markdown(page, 'markdown', result.locator).mention(specialUser).locator;
    await expect(mention).toHaveText(`@${specialUser.username}`);
});

/**
 * @objective Verify that jumping from a search result opens a post that is not already displayed in the center channel.
 */
test('MM-T380 jumps from a search result to a post in another channel', {tag: '@search'}, async ({pw}) => {
    // # Create and log in as a test user, and create a channel with many posts
    const {user, team, adminClient, offTopic} = await pw.initSetup();
    const linkChannel = await adminClient.createPublicChannel(team.id, 'Link Test', 'link-test');
    await adminClient.addToChannel(user.id, linkChannel.id);

    // # Post a target message surrounded by many other messages so it is not initially loaded elsewhere
    const token = `asparagus${pw.random.id()}`;
    for (let i = 0; i < 4; i++) {
        await adminClient.createPost({channel_id: linkChannel.id, message: `RF Random Post before ${i}`});
    }
    const target = await adminClient.createPost({channel_id: linkChannel.id, message: token});
    for (let i = 0; i < 8; i++) {
        await adminClient.createPost({channel_id: linkChannel.id, message: `RF Random Post after ${i}`});
    }
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});

    // # Search for the target message from a different channel
    await searchFor(app, token);
    const result = app.search.results.post(target);
    await expect(result.messageText.locator).toHaveText(token);

    // # Jump to the post from the search results
    await result.locator.hover();
    await result.menu.clickJumpLink();

    // * Verify navigation to the target channel and that the target post is displayed in the center
    await expect.poll(() => page.url(), {timeout: pw.duration.ten_sec}).toContain(`/channels/${linkChannel.name}`);
    await expect(app.center.postList.post(target).messageText.locator).toHaveText(token);
});

/**
 * @objective Verify that deleting a parent post from the search results removes both the post and its reply.
 */
test('MM-T381 deletes a parent post from the search results', {tag: '@search'}, async ({pw}) => {
    // # Create a channel with a post and a reply to it
    const {user, team, adminClient, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, 'Delete Parent', 'delete-parent');
    await adminClient.addToChannel(user.id, channel.id);
    const parentToken = `parentpost${pw.random.id()}`;
    const replyToken = `replypost${pw.random.id()}`;
    const parent = await userClient.createPost({channel_id: channel.id, message: parentToken});
    const reply = await userClient.createPost({channel_id: channel.id, root_id: parent.id, message: replyToken});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const results = app.search.results;

    // * Verify both the parent post and its reply are searchable before deletion
    await searchFor(app, replyToken);
    await expect(results.post(reply).messageText.locator).toHaveText(replyToken);
    await searchFor(app, parentToken);
    const parentResult = results.post(parent);
    await expect(parentResult.messageText.locator).toHaveText(parentToken);

    // # Delete the parent post from the search result
    await parentResult.locator.hover();
    const {deletePostModal: deleteModal} = await (await parentResult.menu.clickDotMenuButton()).clickDeleteMenuItem();
    await deleteModal.clickDeleteButton();

    // * Verify the deleted parent post is removed from the open search results in real time
    await expect(parentResult.locator).toHaveCount(0);

    // * Verify the reply was also removed (searching for it returns no results)
    await searchFor(app, replyToken);
    await expect(app.noResults.titleText.locator).toBeVisible();
    await expect(results.post(reply).locator).toHaveCount(0);
});

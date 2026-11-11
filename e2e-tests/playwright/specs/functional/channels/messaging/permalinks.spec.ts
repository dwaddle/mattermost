// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test, testConfig} from '@mattermost/playwright-lib';

/**
 * @objective Verify that clicking a post timestamp in the RHS or center channel highlights the post in the center channel.
 */
test('MM-T176 highlights the center post when its timestamp is clicked', {tag: ['@messaging']}, async ({pw}) => {
    // # Create a root post with a reply, and log in
    const {user, team, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'town-square');
    const root = await userClient.createPost({
        channel_id: channel.id,
        message: `timestamp highlight ${pw.random.id()}`,
    });
    await userClient.createPost({channel_id: channel.id, root_id: root.id, message: 'Reply to test timestamp click'});
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the root's thread
    const centerPost = app.center.postList.post(root);
    await centerPost.locator.hover();
    await centerPost.menu.clickReplyButton();

    // # Click the root post's timestamp in the thread
    await app.rhs.thread.post(root).timeLink.locator.click();

    // * The matching post is highlighted in the center channel
    await expect(centerPost.locator).toHaveClass(/post--highlight/);

    // # Close the thread and wait for the highlight to fade
    await app.rhs.thread.header.clickCloseButton();
    await expect(centerPost.locator).not.toHaveClass(/post--highlight/);

    // # Click the same post's timestamp in the center channel
    await centerPost.timeLink.locator.click();

    // * The post is highlighted again
    await expect(centerPost.locator).toHaveClass(/post--highlight/);
});

/**
 * @objective Verify that following a permalink to the first post in a channel loads the channel start without an endless loading indicator above it.
 */
test('MM-T3308 follows a permalink to the first post without endless loading', {tag: '@messaging'}, async ({pw}) => {
    const messageCount = 10;
    const base = `permalink-${pw.random.id()}`;

    // # Create a private channel with several posts
    const {user, team, adminClient, userClient} = await pw.initSetup();
    const privateChannel = await adminClient.createPrivateChannel(team.id, 'Permalink First');
    await adminClient.addToChannel(user.id, privateChannel.id);
    const created = [];
    for (let i = 1; i <= messageCount; i++) {
        created.push(await adminClient.createPost({channel_id: privateChannel.id, message: `${base}-${i}`}));
    }

    // # Log in to Off-Topic and post a permalink to the first (oldest) post there
    const offTopic = await userClient.getChannelByName(team.id, 'off-topic');
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});
    const permalink = `${testConfig.baseURL}/${team.name}/pl/${created[0].id}`;
    const linkPost = await userClient.createPost({channel_id: offTopic.id, message: permalink});

    // # Click the permalink in the posted message
    await new generated.Markdown(page, 'markdown', app.center.postList.post(linkPost).locator).linkLink.locator.click();

    // * Navigation lands in the private channel
    await expect
        .poll(() => page.url(), {timeout: pw.duration.ten_sec})
        .toContain(`/${team.name}/channels/${privateChannel.name}`);

    // * The channel start intro is shown: the top loaded without an endless loading indicator
    await expect(app.center.postList.channelIntro.locator).toContainText(
        `This is the start of ${privateChannel.display_name}`,
    );

    // * The newest post is the last one created
    await expect.poll(async () => (await app.center.postList.postKeys()).at(-1)).toBe(created[messageCount - 1].id);
});

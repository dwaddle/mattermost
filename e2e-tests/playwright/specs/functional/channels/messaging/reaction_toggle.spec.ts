// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Api, expect, settle, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify clicking a reaction removes the user's own reaction and clicking it again adds it back,
 * each saved on the server.
 *
 * Written on the generated page objects: the reaction button sends its request when its count's animation
 * ends, and declares that request, so `settle` waits for it.
 */
test('removes and re-adds a reaction by clicking it', {tag: '@messaging'}, async ({pw}) => {
    const {adminClient, adminUser, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Reactions ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const post = await userClient.createPost({channel_id: channel.id, message: `react ${pw.random.id()}`});
    await userClient.addReaction(user.id, post.id, 'smile');
    await adminClient.addReaction(adminUser.id, post.id, 'smile');

    // # Log in and open the channel
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // * The post shows the reaction from both users
    const reaction = app.center.postList.post(post).reactions.reaction('smile');
    await expect(reaction.locator).toContainText('2');

    // # Click the reaction to remove the user's own
    await settle(reaction, (b) => b.click(), {wait: Api.DeleteReaction});

    // * One reaction is left, and the server no longer has the user's
    await expect(reaction.locator).toContainText('1');
    expect((await userClient.getReactionsForPost(post.id)).map((r) => r.user_id)).toEqual([adminUser.id]);

    // # Click it again to add the user's reaction back
    const saved = await settle(reaction, (b) => b.click(), {wait: Api.SaveReaction});

    // * The server saved the user's reaction, and the count is back to two
    expect(saved).toMatchObject({user_id: user.id, post_id: post.id, emoji_name: 'smile'});
    await expect(reaction.locator).toContainText('2');
});

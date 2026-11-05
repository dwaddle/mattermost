// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that while the emoji picker is open over a post, scrolling the center channel with
 * PageUp is disabled (the posts stay in place).
 *
 * Written on the generated page objects: the post by id, its Add Reaction button and the emoji picker.
 */
test('MM-T2365 disables center channel scrolling while the emoji picker is open', {tag: '@messaging'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Scrolling ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const [other] = await adminClient.createUsers(team.id, 1, 'filler');
    await adminClient.addToChannel(other.id, channel.id);

    // # Fill the channel so it can scroll, then post the message to react to last
    for (let i = 0; i < 40; i++) {
        await pw.postAs(other, {channel_id: channel.id, message: `filler ${i}`});
    }
    const target = await userClient.createPost({channel_id: channel.id, message: `react target ${pw.random.id()}`});

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the emoji picker from the post's Add Reaction button
    const post = app.center.postList.post(target);
    await post.locator.hover();
    await post.menu.clickAddReactionButton();
    await expect(app.emojiPicker.searchTextbox.locator).toBeVisible();

    // # Press PageUp while the picker is open
    const before = await post.locator.boundingBox();
    await page.keyboard.press('PageUp');
    await pw.wait(pw.duration.one_sec);
    const after = await post.locator.boundingBox();

    // * Verify the posts did not scroll
    if (!before || !after) {
        throw new Error('Expected the post to have a bounding box while the emoji picker is open');
    }
    expect(Math.abs(after.y - before.y)).toBeLessThan(5);

    // # Close the picker and press PageUp again
    await page.keyboard.press('Escape');
    await expect(app.emojiPicker.searchTextbox.locator).not.toBeVisible();
    await page.keyboard.press('PageUp');
    await pw.wait(pw.duration.one_sec);

    // * Verify the posts scrolled this time
    const afterClose = await post.locator.boundingBox();
    if (!afterClose) {
        throw new Error('Expected the post to have a bounding box after the emoji picker is closed');
    }
    expect(Math.abs(afterClose.y - before.y)).toBeGreaterThan(5);
});

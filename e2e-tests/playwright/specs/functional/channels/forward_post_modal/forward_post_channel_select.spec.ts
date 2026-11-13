// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, lastPost, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that the forward-post channel selector normalizes search results, selects a destination, and
 * forwards the post there.
 */
test('forward post channel selector searches and selects a destination channel', {tag: '@channels'}, async ({pw}) => {
    const {team, user, userClient, adminClient, townSquare} = await pw.initSetup();
    const target = await adminClient.createPublicChannel(team.id, `Forward Target ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, target.id);
    const message = `forward-selector-${pw.random.id()}`;
    const post = await userClient.createPost({channel_id: townSquare.id, message});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open Forward from the post's dot menu
    const shown = app.center.postList.post(post);
    await shown.locator.hover();
    const forward = await (await shown.menu.clickDotMenuButton()).clickForwardMenuItem();

    // # Search for the target channel and select it
    await forward.locator.getByRole('combobox').fill(target.display_name);
    await forward.channel(target).locator.click();
    await expect(forward.selectedChannel.locator).toContainText(target.display_name);

    // # Forward the post
    await expect(forward.confirmButton.locator).toBeEnabled();
    await forward.clickConfirmButton();
    await expect(forward.confirmButton.locator).not.toBeVisible();

    // * Verify the target channel's latest post links back to the original. Not the permalink preview: the server
    // * only generates it when the link matches its SiteURL, which isn't the origin the browser uses everywhere.
    await app.channelsPage.goto({team, channel: target});
    await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
    const lastId = (await app.center.postList.postKeys()).at(-1)!;
    await expect(app.center.postList.post({id: lastId}).locator).toContainText(`/pl/${post.id}`);
});

/**
 * @objective Verify that forwarding a post to a public channel the user has not joined joins the user to that
 * channel and posts the forwarded message there.
 */
test(
    'MM-71780 forward post to an unjoined public channel joins the channel and forwards the post',
    {tag: '@channels'},
    async ({pw}) => {
        const {team, user, userClient, adminClient, townSquare} = await pw.initSetup();
        const target = await adminClient.createPublicChannel(team.id, `Unjoined Public ${pw.random.id()}`);
        const post = await userClient.createPost({
            channel_id: townSquare.id,
            message: `forward-unjoined-${pw.random.id()}`,
        });

        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open the Forward message modal from the posted message
        const shown = app.center.postList.post(post);
        await shown.locator.hover();
        const forward = await (await shown.menu.clickDotMenuButton()).clickForwardMenuItem();

        // # Select the public channel the user is not a member of
        await forward.locator.getByRole('combobox').fill(target.display_name);
        await forward.channel(target).locator.click();

        // * Verify forwarding is allowed even though the user has not joined the channel
        await expect(forward.confirmButton.locator).toBeEnabled();

        // # Forward the post
        await forward.clickConfirmButton();
        await expect(forward.confirmButton.locator).not.toBeVisible();

        // * Verify the user was joined to the channel, switched to it, and the forwarded post is there
        await expect(page).toHaveURL(new RegExp(`/${team.name}/channels/${target.name}$`));
        const member = await adminClient.getChannelMember(target.id, user.id);
        expect(member.user_id).toBe(user.id);
        await expect((await lastPost(app.center.postList)).locator).toContainText(`/pl/${post.id}`);
    },
);

/**
 * @objective Verify that forwarding to an unjoined public channel stays disabled when the user is not permitted to
 * join public channels.
 */
test(
    'MM-71780 forward post to an unjoined public channel is disabled without permission to join public channels',
    {tag: '@channels'},
    async ({pw}) => {
        const {team, user, userClient, adminClient, townSquare} = await pw.initSetup();
        const target = await adminClient.createPublicChannel(team.id, `Unjoined Public ${pw.random.id()}`);
        const post = await userClient.createPost({
            channel_id: townSquare.id,
            message: `forward-unjoined-denied-${pw.random.id()}`,
        });

        // # Remove the permission to join public channels from team members
        const teamUserRole = await adminClient.getRoleByName('team_user');
        await adminClient.patchRole(teamUserRole.id, {
            permissions: teamUserRole.permissions.filter((permission) => permission !== 'join_public_channels'),
        });

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open the Forward message modal from the posted message
        const shown = app.center.postList.post(post);
        await shown.locator.hover();
        const forward = await (await shown.menu.clickDotMenuButton()).clickForwardMenuItem();

        // # Select the public channel the user is not a member of
        await forward.locator.getByRole('combobox').fill(target.display_name);
        await forward.channel(target).locator.click();
        await expect(forward.selectedChannel.locator).toContainText(target.display_name);

        // * Verify forwarding is not allowed since the user cannot join the channel
        await expect(forward.confirmButton.locator).toBeDisabled();
    },
);

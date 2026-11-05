// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that the forward-post channel selector normalizes search results, selects a destination, and
 * forwards the post there.
 *
 * Written on the generated page objects: the post's dot menu, the forward dialog's options by channel id, and the
 * forwarded post's permalink preview. The channel search box is react-select's combobox (no testid).
 */
test('forward post channel selector searches and selects a destination channel', {tag: '@channels'}, async ({pw}) => {
    const {team, user, userClient, adminClient} = await pw.initSetup();
    const target = await adminClient.createPublicChannel(team.id, `Forward Target ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, target.id);
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');
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

    // * Verify the target channel's latest post previews the forwarded message
    await app.channelsPage.goto({team, channel: target});
    await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
    const lastId = (await app.center.postList.postKeys()).at(-1)!;
    await expect(app.center.postList.post({id: lastId}).permalinkPreview.messageText.locator).toHaveText(message);
});

/**
 * @objective Verify that forwarding a post to a public channel the user has not joined joins the user to that
 * channel and posts the forwarded message there.
 */
test(
    'MM-71780 forward post to an unjoined public channel joins the channel and forwards the post',
    {tag: '@channels'},
    async ({pw}) => {
        const {team, user, adminClient} = await pw.initSetup();
        const target = await adminClient.createPublicChannel(team.id, `Unjoined Public ${pw.random.id()}`);

        const message = `forward-unjoined-${pw.random.id()}`;
        const {channelsPage, page} = await pw.testBrowser.login(user);
        await channelsPage.goto(team.name, 'town-square');
        await channelsPage.toBeVisible();
        await channelsPage.postMessage(message);

        // # Open the Forward message modal from the posted message
        const post = await channelsPage.getLastPost();
        const postId = await post.getId();
        await post.hover();
        await post.postMenu.toBeVisible();
        await post.postMenu.openDotMenu();
        await channelsPage.postDotMenu.toBeVisible();
        await channelsPage.postDotMenu.forwardMenuItem.click();

        const modal = page.getByRole('dialog', {name: 'Forward message'});
        await expect(modal).toBeVisible();

        // # Select the public channel the user is not a member of
        await modal.getByRole('combobox').fill(target.display_name);
        const option = page.getByRole('option').filter({hasText: target.display_name}).first();
        await expect(option).toBeVisible();
        await option.click();

        // * Verify forwarding is allowed even though the user has not joined the channel
        const forwardButton = modal.getByRole('button', {name: 'Forward', exact: true});
        await expect(forwardButton).toBeEnabled();

        // # Forward the post
        await forwardButton.click();
        await expect(modal).not.toBeVisible();

        // * Verify the user was joined to the channel, switched to it, and the forwarded post is there
        await expect(page).toHaveURL(new RegExp(`/${team.name}/channels/${target.name}$`));
        const member = await adminClient.getChannelMember(target.id, user.id);
        expect(member.user_id).toBe(user.id);
        await channelsPage.centerView.waitUntilLastPostContains(`/pl/${postId}`);
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
        const {team, user, adminClient} = await pw.initSetup();
        const target = await adminClient.createPublicChannel(team.id, `Unjoined Public ${pw.random.id()}`);

        // # Remove the permission to join public channels from team members
        const teamUserRole = await adminClient.getRoleByName('team_user');
        await adminClient.patchRole(teamUserRole.id, {
            permissions: teamUserRole.permissions.filter((permission) => permission !== 'join_public_channels'),
        });

        const {channelsPage, page} = await pw.testBrowser.login(user);
        await channelsPage.goto(team.name, 'town-square');
        await channelsPage.toBeVisible();
        await channelsPage.postMessage(`forward-unjoined-denied-${pw.random.id()}`);

        // # Open the Forward message modal from the posted message
        const post = await channelsPage.getLastPost();
        await post.hover();
        await post.postMenu.toBeVisible();
        await post.postMenu.openDotMenu();
        await channelsPage.postDotMenu.toBeVisible();
        await channelsPage.postDotMenu.forwardMenuItem.click();

        const modal = page.getByRole('dialog', {name: 'Forward message'});
        await expect(modal).toBeVisible();

        // # Select the public channel the user is not a member of
        await modal.getByRole('combobox').fill(target.display_name);
        const option = page.getByRole('option').filter({hasText: target.display_name}).first();
        await expect(option).toBeVisible();
        await option.click();
        await expect(modal.locator(`#post-forward_channel-select_singleValue_${target.id}`)).toBeVisible();

        // * Verify forwarding is not allowed since the user cannot join the channel
        await expect(modal.getByRole('button', {name: 'Forward', exact: true})).toBeDisabled();
    },
);

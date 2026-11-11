// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, formatMessage, Msg, test, DefaultChannel} from '@mattermost/playwright-lib';

/**
 * @objective Verify that a user who belongs to multiple teams can switch between them and log out to the sign-in page.
 *
 * MM-T432 is a duplicate of MM-T430 and is covered by this test.
 */
test('MM-T430 MM-T432 switches between teams and logs out', {tag: '@multi_team'}, async ({pw}) => {
    // # Create a user in one team, then add them to a second team
    const {user, team, adminClient, offTopic} = await pw.initSetup();
    const secondTeam = await pw.createNewTeam(adminClient, {
        name: 'team',
        displayName: 'Second Team',
        type: 'O',
        unique: true,
    });
    await adminClient.addToTeam(secondTeam.id, user.id);
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});

    // # Switch to the second team
    await app.teamSidebar.team(secondTeam.id).locator.click();

    // * Verify the second team is displayed
    await expect.poll(() => page.url(), {timeout: pw.duration.ten_sec}).toContain(`/${secondTeam.name}/`);

    // # Switch back to the first team
    await app.teamSidebar.team(team.id).locator.click();

    // * Verify the first team is displayed
    await expect.poll(() => page.url(), {timeout: pw.duration.ten_sec}).toContain(`/${team.name}/`);

    // # Log out
    await (await app.globalHeader.clickOpenAccountMenuButton()).logOutMenuItem.commit();

    // * Verify the user is returned to the sign-in page
    await expect.poll(() => page.url(), {timeout: pw.duration.ten_sec}).toContain('/login');
});

/**
 * @objective Verify that reopening the app returns the user to the previously viewed team and channel.
 */
test('MM-T431 reopens to the previously viewed team and channel', {tag: '@multi_team'}, async ({pw}) => {
    // # Create a user in one team, then add them to a second team
    const {user, team, adminClient, townSquare} = await pw.initSetup();
    const secondTeam = await pw.createNewTeam(adminClient, {
        name: 'team',
        displayName: 'Second Team',
        type: 'O',
        unique: true,
    });
    await adminClient.addToTeam(secondTeam.id, user.id);
    const secondOffTopic = await adminClient.getChannelByName(secondTeam.id, DefaultChannel.OffTopic);

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Switch to the second team and view its Off-Topic channel
    await app.teamSidebar.team(secondTeam.id).locator.click();
    await app.lhs.channelList.channel(secondOffTopic).clickLink();
    await expect
        .poll(() => page.url(), {timeout: pw.duration.ten_sec})
        .toContain(`/${secondTeam.name}/channels/off-topic`);

    // # Reopen the app by navigating to the root URL
    await page.goto('/');

    // * Verify the app returns to the previously viewed team and channel
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
    await expect
        .poll(() => page.url(), {timeout: pw.duration.ten_sec})
        .toContain(`/${secondTeam.name}/channels/off-topic`);
});

/**
 * @objective Verify that the right-hand-side reply panel can be expanded to overlay the center channel and collapsed back while staying open.
 */
test('MM-T440 expands and collapses the RHS reply panel', {tag: '@multi_team'}, async ({pw}) => {
    // # Create and log in as a test user, and post a message
    const {user, team, userClient, townSquare} = await pw.initSetup();
    const post = await userClient.createPost({channel_id: townSquare.id, message: `rhs expand ${pw.random.id()}`});

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open the post's thread in the RHS
    const centerPost = app.center.postList.post(post);
    await centerPost.locator.hover();
    await centerPost.menu.clickReplyButton();
    const expand = app.rhs.thread.header.expandButton.locator;
    const expandLabel = formatMessage(Msg.rhs_header.expandSidebarTooltip.icon);
    const collapseLabel = formatMessage(Msg.rhs_header.collapseSidebarTooltip.icon);

    // * Verify the RHS starts collapsed with an expand control
    await expect(expand).toHaveAccessibleName(expandLabel);

    // # Expand the RHS
    await app.rhs.thread.header.clickExpandButton();

    // * Verify the RHS is expanded (a collapse control is now shown)
    await expect(expand).toHaveAccessibleName(collapseLabel);

    // # Collapse the RHS again
    await app.rhs.thread.header.clickExpandButton();

    // * Verify the RHS collapses but stays open, and the center channel is visible again
    await expect(expand).toHaveAccessibleName(expandLabel);
    await expect(app.rhs.postCreate.messageTextbox.locator).toBeVisible();
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
});

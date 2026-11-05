// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a member's name in the channel members RHS opens and closes their profile popover.
 *
 * Written on the generated page objects: the channel menu, the member row by user id, and the popover.
 */
test('should open and close profile popover from channel members RHS', async ({pw}) => {
    // # Initialize setup with two users in the same team and channel
    const {user, team, adminClient} = await pw.initSetup();

    const channel = await adminClient.createChannel(
        pw.random.channel({teamId: team.id, displayName: 'Test Channel', name: 'test-channel'}),
    );
    await adminClient.addToChannel(user.id, channel.id);

    const testUser = await adminClient.createUser(await pw.random.user(), '', '');
    await adminClient.addToTeam(team.id, testUser.id);
    await adminClient.addToChannel(testUser.id, channel.id);

    // # Log in and navigate to the channel
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the channel members RHS from the channel menu
    const menu = await app.channelHeader.clickOpenMenuButton();
    await menu.clickMembersMenuItem();

    // # Click the test user's name in the member list to open their profile popover
    const member = app.rhs.channelMembers.member(testUser);
    await expect(member.locator).toBeVisible();
    await member.profile.locator.click();

    // * Verify the profile popover shows the user
    const popover = app.profilePopover;
    await expect(popover.locator).toBeVisible();
    await expect(popover.locator).toContainText(`@${testUser.username}`);

    // # Click outside the popover to close it
    await page.mouse.click(1, 1);

    // * Verify the profile popover is no longer visible
    await expect(popover.locator).not.toBeVisible();
});

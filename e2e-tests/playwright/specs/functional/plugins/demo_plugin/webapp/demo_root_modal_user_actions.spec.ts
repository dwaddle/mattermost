// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import {type App, expect, openChannel, type PlaywrightExtended, test} from '@mattermost/playwright-lib';

import {closeRootModal, expectRootModal} from './support';

/** Sets up the demo plugin, posts as the user and opens that post's author popover. */
async function openOwnProfilePopover(pw: PlaywrightExtended, message: string): Promise<{app: App; user: UserProfile}> {
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');
    const post = await userClient.createPost({channel_id: townSquare.id, message});
    const app = await openChannel(pw, user, {team, channel: 'town-square'});
    await app.center.postList.post({id: post.id}).avatar.locator.click();
    await expect(app.profilePopover.usernameText.locator).toContainText(user.username);
    return {app, user};
}

test('should show Demo Plugin User Attributes link in profile popover and close popover on click', async ({pw}) => {
    // # Open the profile popover from the user's post
    const {app} = await openOwnProfilePopover(pw, 'Test post for user attributes');
    const demo = app.plugins.comMattermostDemoPlugin;

    // * The plugin's attributes link shows in the popover
    await expect(demo.userAttributes.hideButton.locator).toHaveText('Demo Plugin: User Attributes');

    // # Click it: the plugin hides the popover
    await demo.userAttributes.clickHideButton();

    // * The popover is gone
    await expect(app.profilePopover.usernameText.locator).not.toBeVisible();
});

test('should open Root Modal from user profile popover Action button', async ({pw}) => {
    // # Open the profile popover from the user's post
    const {app} = await openOwnProfilePopover(pw, 'Test post for profile popover');
    const demo = app.plugins.comMattermostDemoPlugin;

    // * The plugin's attributes link and Action button show
    await expect(demo.userAttributes.hideButton.locator).toBeVisible();
    await expect(demo.userActions.actionButton.locator).toHaveText('Action');

    // # Click Action: the popover closes and the Root Modal opens
    await demo.userActions.clickActionButton();
    await expect(app.profilePopover.usernameText.locator).not.toBeVisible();
    await expectRootModal(app);
    await closeRootModal(app);
});

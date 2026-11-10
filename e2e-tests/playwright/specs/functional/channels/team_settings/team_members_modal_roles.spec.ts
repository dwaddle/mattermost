// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify an admin can make a team member a Team Admin and back from the team's Members modal, and the
 * server stores each change.
 *
 * Written on the generated page objects: the modal's rows are keyed by user id, and each row's role menu is reached
 * from its role button.
 */
test('changes a member to Team Admin and back from the Members modal', {tag: '@team_settings'}, async ({pw}) => {
    const {adminUser, adminClient, user, team} = await pw.initSetup();

    // # Log in as admin and open the team's Members modal from the team menu
    const {app} = await pw.testBrowser.login(adminUser);
    await app.channelsPage.goto({team, channel: 'town-square'});
    const teamMenu = await app.lhs.header.clickOpenTeamMenuButton();
    const modal = await teamMenu.clickMembersMenuItem();
    await expect(modal.locator).toBeVisible();

    // # Find the member and make them a Team Admin
    await modal.members.fillSearchTextbox(user.username);
    const row = modal.members.user(user);
    await expect(row.roleButton.locator).toHaveText('Member');
    let roleMenu = await row.clickRoleButton();
    await roleMenu.clickMakeAdminMenuItem();

    // * The row and the server show the new role
    await expect(row.roleButton.locator).toHaveText('Team Admin');
    await expect.poll(async () => (await adminClient.getTeamMember(team.id, user.id)).scheme_admin).toBe(true);

    // # Make them a member again
    roleMenu = await row.clickRoleButton();
    await roleMenu.clickMakeMemberMenuItem();

    // * The row and the server show the member role
    await expect(row.roleButton.locator).toHaveText('Member');
    await expect.poll(async () => (await adminClient.getTeamMember(team.id, user.id)).scheme_admin).toBe(false);
});

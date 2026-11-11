// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openSystemUsers, type PlaywrightExtended, searchSystemUsers, test} from '@mattermost/playwright-lib';

test('MM-T5520-1 should activate and deactivate users', async ({pw}) => {
    const {getUser, row} = await setupAndGetRandomUser(pw);

    // # Open menu and deactivate the user, confirming the dialog
    const confirm = await (await row.clickActionsButton()).clickDeactivateMenuItem();
    await confirm.clickConfirmButton();

    // * Verify user is deactivated
    await expect(row.locator).toContainText('Deactivated');
    await expect.poll(async () => (await getUser()).delete_at).toBeGreaterThan(0);

    // # Open menu and reactivate the user
    await (await row.clickActionsButton()).activateMenuItem.commit();

    // * Verify user is activated
    await expect(row.locator).toContainText('Member');
    await expect(row.locator).not.toContainText('Deactivated');
});

test('MM-T5520-2 should change user roles', async ({pw}) => {
    const {getUser, row} = await setupAndGetRandomUser(pw);

    // # Open menu and click Manage roles
    let roles = await (await row.clickActionsButton()).clickManageRolesMenuItem();

    // # Change to System Admin and click Save
    await roles.systemAdminRadio.check();
    await roles.saveButton.commit();

    // * Verify that the role was updated
    await expect(row.locator).toContainText('System Admin');
    await expect.poll(async () => (await getUser()).roles).toContain('system_admin');

    // # Open menu and click Manage roles
    roles = await (await row.clickActionsButton()).clickManageRolesMenuItem();

    // # Change to Member and click Save
    await roles.memberRadio.check();
    await roles.saveButton.commit();

    // * Verify that the role was updated
    await expect(row.locator).toContainText('Member');
    await expect(row.locator).not.toContainText('System Admin');
    await expect.poll(async () => (await getUser()).roles).toContain('system_user');
});

test('MM-T5520-3 should be able to manage teams', async ({pw}) => {
    const {app, row, team} = await setupAndGetRandomUser(pw);

    // # Open menu and click Manage teams
    await (await row.clickActionsButton()).clickManageTeamsMenuItem();
    const teamRow = app.manageTeamsModal.team(team);

    // # Open the role dropdown and click Make Team Admin
    await expect(teamRow.roleButton.locator).toHaveText('Team Member');
    let roleMenu = await teamRow.clickRoleButton();
    await roleMenu.clickMakeAdminMenuItem();

    // * Verify role is updated
    await expect(teamRow.roleButton.locator).toHaveText('Team Admin');

    // # Change back to Team Member
    roleMenu = await teamRow.clickRoleButton();
    await roleMenu.clickMakeMemberMenuItem();

    // * Verify role is updated
    await expect(teamRow.roleButton.locator).toHaveText('Team Member');

    // # Click Remove from Team
    roleMenu = await teamRow.clickRoleButton();
    await roleMenu.removeMenuItem.commit();

    // * The team row is gone
    await expect(teamRow.locator).toHaveCount(0);
});

test('MM-T5520-4 should reset the users password', async ({pw}) => {
    const {row} = await setupAndGetRandomUser(pw);

    // # Open menu and click Reset Password
    const modal = await (await row.clickActionsButton()).clickResetPasswordMenuItem();

    // # Enter a random password and click Reset
    await modal.fillNewPasswordTextbox(pw.newTestPassword());
    await modal.confirmButton.commit();

    // * The dialog closes
    await expect(modal.newPasswordTextbox.locator).not.toBeVisible();
});

test('MM-T5520-5 should change the users email', async ({pw}) => {
    const {getUser, row} = await setupAndGetRandomUser(pw);
    const newEmail = `${pw.random.id()}@example.com`;

    // # Open menu and click Update Email
    const modal = await (await row.clickActionsButton()).clickUpdateEmailMenuItem();

    // # Enter new email and click Update
    await modal.fillNewEmailTextbox(newEmail);
    await modal.confirmButton.commit();

    // * Verify that the email updated
    await expect(row.cell('emailColumn').locator).toHaveText(newEmail);
    await expect.poll(async () => (await getUser()).email).toEqual(newEmail);
});

test('MM-T5520-6 should revoke sessions', async ({pw}) => {
    const {row} = await setupAndGetRandomUser(pw);

    // # Open menu and revoke sessions, confirming the dialog
    const confirm = await (await row.clickActionsButton()).clickRevokeSessionsMenuItem();
    await confirm.clickConfirmButton();
    await expect(confirm.confirmButton.locator).not.toBeVisible();

    // * Verify no error is displayed
    await expect(row.locator).toBeVisible();
    await expect(row.errorText.locator).not.toBeVisible();
});

/**
 * Sets up a new random user in a new team, and searches the System Console's users for it.
 * @returns The app, the user's row, a function to get the refreshed user, and the team
 */
async function setupAndGetRandomUser(pw: PlaywrightExtended) {
    const {adminUser, adminClient} = await pw.initSetup();

    // # Create a random user to edit
    const user = await adminClient.createUser(await pw.random.user(), '', '');
    const team = await adminClient.createTeam(await pw.random.team());
    await adminClient.addToTeam(team.id, user.id);

    // # Log in as admin, open System Console > Users and search for the user
    const app = await openSystemUsers(pw, adminUser);
    await searchSystemUsers(app, user.email, user);
    const row = app.admin.users.table.row(user.id);
    await expect(row.cell('emailColumn').locator).toHaveText(user.email);

    return {app, getUser: () => adminClient.getUser(user.id), row, team};
}

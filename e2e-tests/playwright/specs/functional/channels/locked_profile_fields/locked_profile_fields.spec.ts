// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {Team} from '@mattermost/types/teams';

import {App, expect, extractEmailLink, getRecentEmail, test} from '@mattermost/playwright-lib';

type LockSetting = 'none' | 'name_and_username' | 'all';

test.beforeEach(async ({pw}) => {
    await pw.ensureLicense();
    await pw.skipIfNoLicense();
});

/**
 * @objective Verify pre-set invite profile data survives email signup and is locked for the new member.
 * @precondition An Enterprise license, Inbucket, and email invitations are available.
 */
test(
    'carries admin-provisioned profile data from invite email through signup and enforces the lock',
    {tag: '@locked_profile_fields'},
    async ({pw, page}) => {
        test.setTimeout(90_000);

        // # Invite and register a member with administrator-provided profile details.
        const {adminUser, adminClient, team} = await pw.initSetup();
        await setLockConfig(adminClient, 'name_and_username');
        const uniqueId = pw.random.id(6);
        const invitedEmail = `new.user@${uniqueId}.example.com`;
        const invitedUsername = `jane.doe.${uniqueId}`;

        const {app: admin} = await pw.testBrowser.login(adminUser);
        const invite = await openInvite(admin, team);
        await addEmail(admin, invitedEmail);
        const profile = invite.memberProfiles.member(memberKey(invitedEmail));
        await profile.fillFirstNameTextbox('Jane');
        await profile.fillLastNameTextbox('Doe');
        await profile.fillUsernameTextbox(invitedUsername);
        const invitationStarted = new Date(Date.now() - 5_000);
        await invite.clickSendButton();
        await expect(admin.invitationModal.result.doneButton.locator).toBeVisible();

        const invitationEmail = await getRecentEmail(invitedEmail, {receivedAfter: invitationStarted});
        const signupLink = extractEmailLink(invitationEmail, '/signup_user_complete/');

        await pw.hasSeenLandingPage();
        const app = new App(page);
        await page.goto(signupLink);
        const {card} = app.signup;
        await expect(card.usernameTextbox.locator).toHaveValue(invitedUsername);
        await expect(card.usernameTextbox.locator).toBeDisabled();
        await expect(card.username.messageText.locator).toHaveText('Your username was chosen by your admin.');
        await expect(card.presetNameText.locator).toHaveText("You'll join as Jane Doe.");
        await card.fillPasswordTextbox(pw.newTestPassword());
        await card.setTermsCheckbox(true);
        await card.clickCreateAccountButton();
        await expect(page).not.toHaveURL(/\/signup_user_complete/);

        const createdUser = await adminClient.getUserByEmail(invitedEmail);
        expect(createdUser.username).toBe(invitedUsername);
        expect(createdUser.first_name).toBe('Jane');
        expect(createdUser.last_name).toBe('Doe');

        // * The resulting member cannot edit the managed name or username fields.
        await adminClient.savePreferences(createdUser.id, [
            {user_id: createdUser.id, category: 'tutorial_step', name: createdUser.id, value: '999'},
            {
                user_id: createdUser.id,
                category: 'onboarding_task_list',
                name: 'onboarding_task_list_show',
                value: 'false',
            },
        ]);
        await page.reload();
        await expect(app.globalHeader.openAccountMenuButton.locator).toBeVisible();
        await (await app.globalHeader.clickOpenAccountMenuButton()).clickProfileMenuItem();

        const name = app.settings.section('name');
        await name.clickEditButton();
        await expect(name.managedByAdminText.locator).toBeVisible();
        await expect(name.firstNameTextbox.locator).not.toBeVisible();
        await expect(name.lastNameTextbox.locator).not.toBeVisible();
        await expect(name.saveButton.locator).not.toBeVisible();
        await name.clickCancelButton();

        const username = app.settings.section('username');
        await username.clickEditButton();
        await expect(username.managedByAdminText.locator).toBeVisible();
        await expect(username.usernameTextbox.locator).not.toBeVisible();
        await expect(username.saveButton.locator).not.toBeVisible();
    },
);

/**
 * @objective Verify a System Admin can edit an email user's locked first and last names.
 * @precondition An Enterprise license is available.
 */
test(
    'allows a System Admin to edit locked first and last names from the user detail page',
    {tag: '@locked_profile_fields'},
    async ({pw}) => {
        // # Edit the locked member's name from the System Console.
        const {user, adminUser, adminClient} = await pw.initSetup();
        await setLockConfig(adminClient, 'name_and_username');
        const newFirstName = `AdminFirst${pw.random.id(5)}`;
        const newLastName = `AdminLast${pw.random.id(5)}`;

        const {app, page} = await pw.testBrowser.login(adminUser);
        await page.goto(`/admin_console/user_management/user/${user.id}`);
        const userDetail = app.admin.user;
        await expect(userDetail.firstNameTextbox.locator).toBeEnabled();
        await expect(userDetail.lastNameTextbox.locator).toBeEnabled();
        await userDetail.fillFirstNameTextbox(newFirstName);
        await userDetail.fillLastNameTextbox(newLastName);
        const confirm = await userDetail.clickSaveButton();
        await confirm.clickConfirmButton();

        // * The administrator's changes persist in the UI and API.
        await expect(userDetail.firstNameTextbox.locator).toHaveValue(newFirstName);
        await expect(userDetail.lastNameTextbox.locator).toHaveValue(newLastName);
        const updatedUser = await adminClient.getUser(user.id);
        expect(updatedUser.first_name).toBe(newFirstName);
        expect(updatedUser.last_name).toBe(newLastName);
    },
);

async function setLockConfig(adminClient: Client4, lockSetting: LockSetting) {
    await adminClient.patchConfig({
        ServiceSettings: {EnableEmailInvitations: true},
        TeamSettings: {LockProfileFieldsForEmailUsers: lockSetting},
    });
    await expect
        .poll(async () => {
            const config = await adminClient.getConfig();
            return {
                emailInvitations: config.ServiceSettings?.EnableEmailInvitations,
                profileLock: config.TeamSettings?.LockProfileFieldsForEmailUsers,
            };
        })
        .toEqual({emailInvitations: true, profileLock: lockSetting});
}

/** An invited email's member-profile row key: the email with every character outside [a-z0-9_] made `_`. */
function memberKey(email: string) {
    return email.toLowerCase().replace(/[^a-z0-9_]/g, '_');
}

/** Opens the team's Invite People dialog from the team menu. */
async function openInvite(app: App, team: Team) {
    await app.channelsPage.goto({team, channel: 'town-square'});
    await (await app.lhs.header.clickOpenTeamMenuButton()).clickInvitePeopleMenuItem();
    await expect(app.invitationModal.invite.users.inputCombobox.locator).toBeVisible();
    return app.invitationModal.invite;
}

/** Adds an email to the invite list, taking the menu's suggestion once its search finishes. */
async function addEmail(app: App, email: string) {
    const {users} = app.invitationModal.invite;
    const input = users.inputCombobox.locator;
    await input.click();
    await input.pressSequentially(email, {delay: 50});
    await expect(users.emailOption.locator).toBeVisible({timeout: 15000});
    await input.press('Enter');
    await expect(input).toHaveValue('');
}

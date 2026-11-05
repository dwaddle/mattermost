// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {UserProfile} from '@mattermost/types/users';

import {expect, test, type PlaywrightExtended} from '@mattermost/playwright-lib';

import {openUsers, search} from './support';

// Written on the generated page objects: System Console > Users' row by user id and its actions menu, and the Manage
// Roles dialog (role radios, the delegated roles section and its checkboxes by role, Save).

/**
 * Delegated (granular) administration roles surfaced in the Manage Roles modal.
 * Mirrors DELEGATED_ROLE_NAMES in the manage_roles_modal component.
 */
const USER_MANAGER_ROLE = 'system_user_manager';
const SYSTEM_MANAGER_ROLE = 'system_manager';

/**
 * Open the Manage Roles modal for the given user from System Console > User Management > Users.
 */
async function openManageRolesModal(pw: PlaywrightExtended, admin: UserProfile, user: UserProfile) {
    const app = await openUsers(pw, admin);
    await search(app, user.email, user);
    const roles = await (await app.admin.users.table.row(user.id).clickActionsButton()).clickManageRolesMenuItem();
    await expect(roles.saveButton.locator).toBeVisible();
    return roles;
}

/**
 * Skip when the server license does not enable delegated granular administration.
 * The feature requires an Enterprise/Enterprise Advanced license with the LDAP Groups
 * feature and is not available on the Entry SKU (see utils/license_utils.ts).
 */
async function skipIfNoDelegatedAdminLicense(adminClient: Client4) {
    const license = await adminClient.getClientLicenseOld();
    test.skip(
        license.IsLicensed !== 'true' || license.LDAPGroups !== 'true' || license.SkuShortName === 'entry',
        'Skipping test - server not licensed for delegated granular administration',
    );
}

/**
 * @objective Verify a delegated administration role can be granted from the Manage Roles modal and persists.
 */
test(
    'grants a delegated administration role from the Manage Roles modal',
    {tag: ['@system_console', '@user_management']},
    async ({pw}) => {
        const {adminUser, adminClient, user} = await pw.initSetup();
        await skipIfNoDelegatedAdminLicense(adminClient);

        // # Login as admin and open the Manage Roles modal for a regular user
        const manageRolesModal = await openManageRolesModal(pw, adminUser, user);

        // * Verify the Delegated Administration Roles section is shown for a regular member
        await expect(manageRolesModal.delegatedRoles.locator).toBeVisible();

        // # Grant the User Manager role and save
        const userManagerCheckbox = manageRolesModal.systemUserManagerCheckbox.locator;
        await expect(userManagerCheckbox).not.toBeChecked();
        await userManagerCheckbox.check();
        await manageRolesModal.clickSaveButton();
        await expect(manageRolesModal.saveButton.locator).not.toBeVisible();

        // * Verify the role was persisted via the API
        await expect.poll(async () => (await adminClient.getUser(user.id)).roles).toContain(USER_MANAGER_ROLE);
    },
);

/**
 * @objective Verify the modal pre-selects delegated administration roles the user already has.
 */
test(
    'pre-selects delegated administration roles the user already has',
    {tag: ['@system_console', '@user_management']},
    async ({pw}) => {
        const {adminUser, adminClient, user} = await pw.initSetup();
        await skipIfNoDelegatedAdminLicense(adminClient);

        // # Grant the System Manager role to the user up front
        await adminClient.updateUserRoles(user.id, `system_user ${SYSTEM_MANAGER_ROLE}`);

        // # Login as admin and open the Manage Roles modal for that user
        const manageRolesModal = await openManageRolesModal(pw, adminUser, user);

        // * Verify the already-granted role is pre-checked and others are not
        await expect(manageRolesModal.systemManagerCheckbox.locator).toBeChecked();
        await expect(manageRolesModal.systemUserManagerCheckbox.locator).not.toBeChecked();
    },
);

/**
 * @objective Verify the Delegated Administration Roles section is hidden when System Admin is selected.
 */
test(
    'hides the delegated administration roles section when System Admin is selected',
    {tag: ['@system_console', '@user_management']},
    async ({pw}) => {
        const {adminUser, adminClient, user} = await pw.initSetup();
        await skipIfNoDelegatedAdminLicense(adminClient);

        // # Login as admin and open the Manage Roles modal for a regular user
        const manageRolesModal = await openManageRolesModal(pw, adminUser, user);

        // * Verify the section is initially visible for a member
        await expect(manageRolesModal.delegatedRoles.locator).toBeVisible();

        // # Promote the account to System Admin within the modal
        await manageRolesModal.systemAdminRadio.locator.check();
        await expect(manageRolesModal.systemAdminRadio.locator).toBeChecked();

        // * Verify the delegated roles section is hidden since System Admins already have full access
        await expect(manageRolesModal.delegatedRoles.locator).not.toBeVisible();
    },
);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test, type App} from '@mattermost/playwright-lib';

const SYSTEM_ROLES_PATH = generated.AdminConsolePage.path({section: 'user_management/system_roles'});

/** Opens System Console > Delegated Granular Administration and the role's page. */
async function openRole(app: App, roleId: string) {
    await app.page.goto(SYSTEM_ROLES_PATH);
    await app.admin.roles.row(roleId).clickEditLink();
    await expect(app.admin.role.nameText.locator).toBeVisible();
    return app.admin.role;
}

const roleCases = [{roleId: 'system_shared_channel_manager'}];

for (const {roleId} of roleCases) {
    test(
        `Assigning a user to ${roleId} persists after page reload`,
        {tag: ['@smoke', '@system_console']},
        async ({pw}) => {
            const {adminUser, adminClient, user} = await pw.initSetup();

            // # Log in as admin and open the role
            const {app} = await pw.testBrowser.login(adminUser);
            let role = await openRole(app, roleId);

            // # Add People: search for the test user, pick them, and add
            const {users} = await role.clickAddPeopleButton();
            await users.searchCombobox.locator.click();
            await users.searchCombobox.locator.pressSequentially(user.username, {delay: 50});
            await users.results.user(user).locator.click();
            await users.clickSaveButton();

            // * The user shows in the role's assigned people
            await expect(role.users.row(user.id).locator).toBeVisible();

            // # Save the role assignment, which returns to the roles list
            await role.savePanel.saveButton.click();
            await expect(app.page).toHaveURL(/\/admin_console\/user_management\/system_roles$/);

            // * Reopened, the role still lists the user
            role = await openRole(app, roleId);
            await expect(role.users.row(user.id).locator).toBeVisible();

            // * The server has the role on the user
            const updatedUser = await adminClient.getUser(user.id);
            expect(updatedUser.roles).toContain(roleId);
        },
    );
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openSystemUsers, searchSystemUsers, test, testConfig} from '@mattermost/playwright-lib';


import {expectOnSelectTeam, logIn, openAdminConsole, openLogin} from './support';

/**
 * @objective Verify enforced MFA sends an unenrolled user to MFA setup after login.
 *
 * @precondition
 * A licensed server running in testcontainers.
 */
test(
    'MM-T1778 sends an unenrolled user to MFA setup when MFA is enforced',
    {tag: '@authentication'},
    async ({pw, page}) => {
        await pw.ensureLicense();
        await pw.skipIfNoLicense();
        test.skip(!testConfig.mattermostContainerId, 'Skipping test - requires PW_USE_TESTCONTAINERS=true');

        const {adminUser, adminClient} = await pw.initSetup();
        const user = await pw.createNewUserProfile(adminClient);
        const {app: adminApp} = await pw.testBrowser.login(adminUser);

        try {
            // # Enable and enforce MFA in the System Console
            await openAdminConsole(adminApp, '/authentication/mfa');
            await adminApp.admin.setting('ServiceSettings.EnableMultifactorAuthentication').trueRadio.check();
            await adminApp.admin.setting('ServiceSettings.EnforceMultifactorAuthentication').trueRadio.check();
            await adminApp.admin.clickSaveButton();
            await expect
                .poll(async () => (await adminClient.getConfig()).ServiceSettings.EnforceMultifactorAuthentication)
                .toBe(true);

            // # Log in as an unenrolled user
            const app = await openLogin(pw, page);
            await logIn(app, user.username, user.password);

            // * Verify MFA setup is shown
            await expect(page).toHaveURL(/\/mfa\/setup/);
        } finally {
            await pw.resetConfig(adminClient);
        }
    },
);

/**
 * @objective Verify an admin can remove MFA from an enrolled user, who then logs in without it.
 *
 * @precondition
 * A licensed server.
 */
test('MM-T1781 lets an admin remove MFA from an enrolled user', {tag: '@authentication'}, async ({pw, page}) => {
    await pw.ensureLicense();
    await pw.skipIfNoLicense();

    const {adminUser, adminClient} = await pw.initSetup();
    const user = await pw.createNewUserProfile(adminClient);

    const {restore} = await adminClient.patchConfig({
        ServiceSettings: {EnableMultifactorAuthentication: true, EnforceMultifactorAuthentication: false},
    });

    try {
        await pw.enableUserMfa(adminClient, user.id);

        // # Remove MFA from the user in System Console > Users
        const adminApp = await openSystemUsers(pw, adminUser);
        await searchSystemUsers(adminApp, user.username, user);
        await (await adminApp.admin.users.table.row(user.id).clickActionsButton()).clickRemoveMfaMenuItem();
        await expect.poll(async () => (await adminClient.getUser(user.id)).mfa_active ?? false).toBe(false);

        // # Log in as the user
        const app = await openLogin(pw, page);
        await logIn(app, user.username, user.password);

        // * Verify login goes straight to the team-join page, without MFA
        await expectOnSelectTeam(page);
    } finally {
        await restore();
    }
});

/**
 * @objective Verify Remove MFA isn't offered for a user who never enrolled.
 *
 * @precondition
 * A licensed server.
 */
test('MM-T1782 hides Remove MFA for a user who has not enrolled', {tag: '@authentication'}, async ({pw}) => {
    await pw.ensureLicense();
    await pw.skipIfNoLicense();

    const {adminUser, adminClient} = await pw.initSetup();
    const user = await pw.createNewUserProfile(adminClient);

    const {restore} = await adminClient.patchConfig({
        ServiceSettings: {EnableMultifactorAuthentication: true, EnforceMultifactorAuthentication: false},
    });

    try {
        // # Open the user's actions in System Console > Users
        const app = await openSystemUsers(pw, adminUser);
        await searchSystemUsers(app, user.username, user);
        const actions = await app.admin.users.table.row(user.id).clickActionsButton();

        // * Verify Remove MFA isn't offered
        await expect(actions.deactivateMenuItem.locator).toBeVisible();
        await expect(actions.removeMfaMenuItem.locator).toHaveCount(0);
    } finally {
        await restore();
    }
});

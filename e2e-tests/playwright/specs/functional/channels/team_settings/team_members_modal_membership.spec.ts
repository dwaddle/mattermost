// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * @objective Team Members modal shows membership requirements banner and attribute chips for governed teams
 * @reference MM-69100
 */

import {expect, Msg, newTestPassword, test, type App} from '@mattermost/playwright-lib';

import {
    enableTeamMembershipABACConfig,
    ensureDepartmentAttribute,
    createPublicTeam,
    createTeamMembershipPolicy,
    createTeamAdmin,
    setUserAttribute,
    waitForAttributeViewToInclude,
} from './helpers';

/** Opens the Team Members modal from the team menu and waits for it. */
async function openTeamMembers(app: App) {
    const modal = await (await app.lhs.header.clickOpenTeamMenuButton()).clickMembersMenuItem();
    await expect(modal.locator).toBeVisible();
    return modal;
}

test.describe('Team Members Modal - Membership Policy Banner', {tag: ['@abac', '@team_membership']}, () => {
    const createdTeamIds: string[] = [];
    const createdUserIds: string[] = [];

    test.afterEach(async ({pw}) => {
        const {adminClient} = await pw.getAdminClient();
        for (const id of createdTeamIds.splice(0)) {
            await adminClient.deleteTeam(id).catch(() => {});
        }
        for (const id of createdUserIds.splice(0)) {
            await adminClient.updateUserActive(id, false).catch(() => {});
        }
    });

    test('MM-69100_34 governed team shows the policy banner in the Team Members modal', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminClient, team} = await pw.initSetup();
        await enableTeamMembershipABACConfig(adminClient);
        await ensureDepartmentAttribute(adminClient);

        const teamAdmin = await createTeamAdmin(adminClient, team.id);
        createdUserIds.push(teamAdmin.id);

        await createTeamMembershipPolicy(adminClient, team.id, 'user.attributes.Department == "Engineering"', false);

        const {app} = await pw.testBrowser.login(teamAdmin);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Open Team Members modal from the team menu (Manage members for admins, View members otherwise)
        const modal = await openTeamMembers(app);
        const banner = modal.policyBanner.locator;

        // * Banner present with correct title and description
        await expect(banner).toContainMessage(Msg.team_member_modal.policy_enforced.title);
        await expect(banner).toContainMessage(Msg.team_member_modal.policy_enforced.description);
    });

    test('MM-69100_35 attribute holder sees attribute chips inside the policy banner', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminClient, team} = await pw.initSetup();
        await enableTeamMembershipABACConfig(adminClient);
        await ensureDepartmentAttribute(adminClient);

        // # Create team admin who is an attribute holder (Engineering)
        const teamAdmin = await createTeamAdmin(adminClient, team.id);
        createdUserIds.push(teamAdmin.id);
        await setUserAttribute(adminClient, teamAdmin.id, 'Department', 'Engineering');
        await waitForAttributeViewToInclude(adminClient, 'user.attributes.Department == "Engineering"', [teamAdmin.id]);

        await createTeamMembershipPolicy(adminClient, team.id, 'user.attributes.Department == "Engineering"', false);

        const {app} = await pw.testBrowser.login(teamAdmin);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Open Team Members modal from the team menu (Manage members for admins, View members otherwise)
        const modal = await openTeamMembers(app);
        const banner = modal.policyBanner.locator;

        // * Banner visible
        await expect(banner).toBeVisible();

        // * Attribute chip "Department: Engineering" visible (async — chip text loads after banner)
        await expect(banner).toContainText(/Department: Engineering/i, {timeout: 15000});
    });

    test('MM-69100_36 non-admin team member sees the policy banner in the Team Members modal', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminClient} = await pw.getAdminClient();
        const suffix = pw.random.id();
        await enableTeamMembershipABACConfig(adminClient);
        await ensureDepartmentAttribute(adminClient);

        // # Public team with Engineering policy
        const team = await createPublicTeam(adminClient, suffix);
        createdTeamIds.push(team.id);

        // # Regular user (non-admin) — verifies the banner appears for ordinary members too
        const regularUser = await adminClient.createUser(
            {
                email: `regular${suffix}@sample.mattermost.com`,
                username: `regular${suffix}`,
                password: newTestPassword(),
            } as any,
            '',
            '',
        );
        createdUserIds.push(regularUser.id);
        regularUser.password = newTestPassword();
        await adminClient.savePreferences(regularUser.id, [
            {user_id: regularUser.id, category: 'tutorial_step', name: regularUser.id, value: '999'},
            {user_id: regularUser.id, category: 'onboarding', name: 'complete', value: 'true'},
            {
                user_id: regularUser.id,
                category: 'onboarding_task_list',
                name: 'onboarding_task_list_show',
                value: 'false',
            },
            {
                user_id: regularUser.id,
                category: 'onboarding_task_list',
                name: 'onboarding_task_list_open',
                value: 'false',
            },
        ]);
        await adminClient.addToTeam(team.id, regularUser.id);

        await createTeamMembershipPolicy(adminClient, team.id, 'user.attributes.Department == "Engineering"', false);

        const {app} = await pw.testBrowser.login(regularUser);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Open Team Members modal from the team menu (Manage members for admins, View members otherwise)
        const modal = await openTeamMembers(app);
        const banner = modal.policyBanner.locator;

        // * Banner present with softened advisory copy (public team)
        await expect(banner).toContainMessage(Msg.team_member_modal.policy_advisory.title);
        await expect(banner).toContainMessage(Msg.team_member_modal.policy_advisory.description);
        await expect(banner).not.toContainMessage(Msg.team_member_modal.policy_enforced.title);
    });

    test('MM-69100_37 ungoverned team does not show the policy banner in Team Members modal', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminClient, team} = await pw.initSetup();
        await enableTeamMembershipABACConfig(adminClient);

        const teamAdmin = await createTeamAdmin(adminClient, team.id);
        createdUserIds.push(teamAdmin.id);

        const {app} = await pw.testBrowser.login(teamAdmin);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Open Team Members modal from the team menu (Manage members for admins, View members otherwise)
        const modal = await openTeamMembers(app);
        const banner = modal.policyBanner.locator;

        // * No policy banner for ungoverned team (the governed tests above see it), while the member list loads
        await expect(modal.members.searchTextbox.locator).toBeVisible();
        await expect(banner).not.toBeVisible();
    });
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AdminPermission, Api, duration, expect, test} from '@mattermost/playwright-lib';

import {ensureUserAttributes, deletePermissionPolicyByName} from '../support';
import {createPermissionPolicy, openPermissionPolicies, permissionPolicyIdByName, setAbacEnabled} from '../surface';

/**
 * Permission Policies - System Console (MM-64508)
 *
 * Tests the Permission Policies page under System Attributes > Permission Policies.
 * Requires Enterprise Advanced license and ABAC enabled.
 *
 * Sidebar items (Membership Policies, Permission Policies) are only rendered when
 * ABAC is enabled — all tests turn it on first.
 *
 * This file covers list-page UI and management (delete / search) of existing policies.
 */

test.describe('Permission Policies - List Page', () => {
    test('MM-T5801 admin can navigate to Permission Policies page via sidebar', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        // # Enable ABAC — sidebar items only appear when ABAC is on.
        await setAbacEnabled(app, true);

        // # Click Permission Policies in the sidebar
        await app.admin.sidebar.category('system_attributes').section('permission_policies').clickTitleLink();

        // * Correct URL and heading
        await expect(app.page).toHaveURL(/permission_policies/);
        const list = app.admin.permissionPolicies;
        await expect(list.titleText.locator).toHaveText('Permission Policies');

        // * List columns are present
        await expect(list.header.locator).toContainText('Name');
        await expect(list.header.locator).toContainText('Role');
        await expect(list.header.locator).toContainText('Permissions');
    });

    test('MM-T5802 Permission Policies list page has Add policy button and search input', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        await setAbacEnabled(app, true);
        const list = await openPermissionPolicies(app);

        await expect(list.addButton.locator).toBeVisible();
        await expect(list.searchTextbox.locator).toBeVisible();
    });

    test('MM-T5803 Permission Policies list page subtitle describes file permission scope', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        await setAbacEnabled(app, true);
        const list = await openPermissionPolicies(app);

        await expect(list.subtitleText.locator).toContainText(
            'Create policies to control channel action permissions based on user attributes',
        );
    });
});

test.describe('Permission Policies - Manage Existing Policies', () => {
    test('MM-T5816 admin can delete a permission policy', async ({pw}) => {
        test.setTimeout(duration.two_min);
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        await setAbacEnabled(app, true);

        const policyName = `PP Delete ${pw.random.id()}`;
        const list = await createPermissionPolicy(app, {
            name: policyName,
            cel: 'user.attributes.Department == "Delete"',
            permissions: [AdminPermission.DownloadFileAttachment],
        });
        const row = list.row(await permissionPolicyIdByName(adminClient, policyName));
        await expect(row.locator).toContainText(policyName);

        // # Open the row's action menu and delete — deletion from the list fires immediately, with no confirmation
        await (await row.clickOpenMenuButton()).deleteMenuItem.commit({wait: Api.DeleteAccessControlPolicy});

        // * Policy no longer in list
        await expect(row.locator).toHaveCount(0);

        // # Safety net: API cleanup in case UI deletion failed
        await deletePermissionPolicyByName(adminClient, policyName);
    });

    test('MM-T5817 admin can search for a permission policy by name', async ({pw}) => {
        test.setTimeout(duration.two_min);
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        await setAbacEnabled(app, true);

        const policyName = `PP Search ${pw.random.id()}`;
        try {
            const list = await createPermissionPolicy(app, {
                name: policyName,
                cel: 'user.attributes.Department == "Search"',
                permissions: [AdminPermission.DownloadFileAttachment],
            });
            const id = await permissionPolicyIdByName(adminClient, policyName);

            // # Search by the exact name
            await list.fillSearchTextbox(policyName);

            // * Only the matching policy is listed
            await expect(list.rowItems).toHaveCount(1);
            await expect(list.row(id).locator).toContainText(policyName);
        } finally {
            await deletePermissionPolicyByName(adminClient, policyName);
        }
    });
});

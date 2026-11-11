// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AdminPermission, AdminRole, expect, test, duration, Msg} from '@mattermost/playwright-lib';

import {ensureUserAttributes, deletePermissionPolicyByName} from '../support';
import {
    PERMISSION_POLICIES_PATH,
    createPermissionPolicy,
    openPermissionPolicies,
    permissionPolicyIdByName,
    setAbacEnabled,
} from '../surface';

/**
 * Permission Policies - Create Policy save/cancel flows (MM-64508)
 *
 * Covers end-to-end creation flows that persist a policy (download-only,
 * combined download+upload, guest role) plus the cancel path. Paired with
 * permission_policies_create_form.spec.ts which covers form UI + validation.
 */
test.describe('Permission Policies - Create Policy', () => {
    test('MM-T5812 admin can create a permission policy restricting file downloads', async ({pw}) => {
        test.setTimeout(duration.two_min);

        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);
        await setAbacEnabled(app, true);

        const policyName = `PP Download ${pw.random.id()}`;

        try {
            const list = await createPermissionPolicy(app, {
                name: policyName,
                cel: 'user.attributes.Department == "Engineering"',
                permissions: [AdminPermission.DownloadFileAttachment],
            });

            // * List page shows the new policy with correct role and permissions
            await expect(list.titleText.locator).toHaveText('Permission Policies');
            const row = list.row(await permissionPolicyIdByName(adminClient, policyName));
            await expect(row.cell('name').locator).toHaveText(policyName);

            // Role label was shortened from "Members and system administrators"
            // to just "Members" in the UX pass; the "system admins fall back
            // when no admin-specific rule exists" semantics moved into the
            // role's description copy.
            await expect(row.cell('role').locator).toHaveText('Members');
            await expect(row.cell('policyActions').locator).toContainText('Download Files');
        } finally {
            await deletePermissionPolicyByName(adminClient, policyName);
        }
    });

    test('MM-T5813 admin can create a permission policy with both Download and Upload permissions', async ({pw}) => {
        test.setTimeout(duration.two_min);

        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);
        await setAbacEnabled(app, true);

        const policyName = `PP Both Perms ${pw.random.id()}`;

        try {
            const list = await createPermissionPolicy(app, {
                name: policyName,
                cel: 'user.attributes.Department == "Legal"',
                permissions: [AdminPermission.DownloadFileAttachment, AdminPermission.UploadFileAttachment],
            });

            const row = list.row(await permissionPolicyIdByName(adminClient, policyName));
            await expect(row.cell('policyActions').locator).toContainText('Download Files');
            await expect(row.cell('policyActions').locator).toContainMessage(
                Msg.admin.permission_policies.permission.upload_file.label,
            );
        } finally {
            await deletePermissionPolicyByName(adminClient, policyName);
        }
    });

    test('MM-T5814 created policy appears in list with correct name, role, and permissions', async ({pw}) => {
        test.setTimeout(duration.two_min);

        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);
        await setAbacEnabled(app, true);

        const policyName = `PP List Check ${pw.random.id()}`;

        try {
            const list = await createPermissionPolicy(app, {
                name: policyName,
                cel: 'user.attributes.Department == "Legal"',
                permissions: [AdminPermission.DownloadFileAttachment],
                role: AdminRole.SystemGuest,
            });

            // * Row shows name, Guest role, and Download Files permission
            const row = list.row(await permissionPolicyIdByName(adminClient, policyName));
            await expect(row.cell('name').locator).toHaveText(policyName);
            await expect(row.cell('role').locator).toHaveMessage(Msg.admin.permission_policies.role.system_guest.label);
            await expect(row.cell('policyActions').locator).toContainText('Download Files');
        } finally {
            await deletePermissionPolicyByName(adminClient, policyName);
        }
    });

    test('MM-T5815 admin can cancel policy creation and return to list', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);
        await setAbacEnabled(app, true);

        const list = await openPermissionPolicies(app);
        await list.clickAddButton();
        await expect(app.admin.header.locator).toContainMessage(Msg.admin.permission_policies.edit.title);

        // # Cancel navigates back to list without saving
        await app.admin.permissionPolicy.cancelLink.click();
        await expect(app.page).toHaveURL(new RegExp(`${PERMISSION_POLICIES_PATH}$`));
        await expect(list.titleText.locator).toHaveText('Permission Policies');
    });
});

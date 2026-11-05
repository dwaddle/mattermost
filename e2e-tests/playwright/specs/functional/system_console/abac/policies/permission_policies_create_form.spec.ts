// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {AdminRole, expect, test, type App} from '@mattermost/playwright-lib';

import {ensureUserAttributes} from '../support';
import {openPermissionPolicies, setAbacEnabled, setCelExpression} from '../surface';

/**
 * Permission Policies - Create Policy form UI and validation (MM-64508)
 *
 * Covers the create-form UI elements (name input, role dropdown, CEL editor mode
 * toggle, info banner) and inline validation (empty name / expression / permissions).
 * See permission_policies_create_save.spec.ts for the save/cancel flows that
 * actually persist policies.
 */

/** Turns attribute-based access on and opens a new permission policy. */
async function openNewPermissionPolicy(app: App) {
    await setAbacEnabled(app, true);
    const list = await openPermissionPolicies(app);
    await list.clickAddButton();
    await expect(list.edit.name.valueTextbox.locator).toBeVisible();
    return {name: list.edit.name, policy: app.admin.permissionPolicy};
}

test.describe('Permission Policies - Create Policy', () => {
    test('MM-T5804 admin can open the create permission policy form', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {name} = await openNewPermissionPolicy(app);

        // * Detail page heading and name input visible
        await expect(app.admin.header.locator).toContainText('Attribute-Based Permission Policy');
        await expect(name.valueTextbox.locator).toHaveAttribute('placeholder', 'Add a unique policy name');
    });

    test('MM-T5805 create policy form shows evaluation order info banner', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {policy} = await openNewPermissionPolicy(app);

        // * Banner explains that permission policies override system permission schemes
        const banner = policy.evaluationInfo.locator;
        await expect(banner).toContainText('The permissions defined in this policy override the');
        await expect(banner).toContainText('system permission schemes');
        await expect(banner).toContainText('Permissions evaluation order');
    });

    test('MM-T5806 create policy form shows role dropdown defaulting to Members', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {policy} = await openNewPermissionPolicy(app);

        await expect(policy.roleLabelText.locator).toHaveText('Select a role from the predefined list of system roles');

        // * The dropdown button is visible and shows the default role
        //   (system_user). The label was shortened from "Members and
        //   system administrators" to just "Members" in the UX pass;
        //   the "system admins fall back when no admin-specific rule
        //   exists" semantics moved into the role's description copy.
        //   Use an exact-text matcher so a regression to the longer
        //   "Members and system administrators" label fails the test
        //   instead of silently passing the substring check.
        await expect(policy.roleButton.locator).toBeVisible();
        await expect(policy.roleButton.locator).toHaveText('Members');
    });

    test('MM-T5807 admin can change role selection to System administrators via dropdown', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {policy} = await openNewPermissionPolicy(app);

        // # Open the role dropdown and select System administrators
        await (await policy.clickRoleButton()).role(AdminRole.SystemAdmin).click();

        // * Dropdown button now shows the selected role
        await expect(policy.roleButton.locator).toContainText('System administrators');
    });

    test('MM-T5808 admin can toggle between Simple and Advanced CEL editor modes', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {policy} = await openNewPermissionPolicy(app);
        const toggle = policy.switchModeButton.locator;
        await expect(toggle).toHaveText('Switch to Advanced Mode');
        await expect(policy.rules.addButton.locator).toBeVisible();
        await policy.switchModeButton.click();

        // * Button label flips to Simple Mode, with the CEL editor showing
        await expect(toggle).toHaveText('Switch to Simple Mode');
        await expect(policy.cel.input.locator).toBeVisible();
        await policy.switchModeButton.click();
        await expect(toggle).toHaveText('Switch to Advanced Mode');
        await expect(policy.rules.addButton.locator).toBeVisible();
    });

    test('MM-T5809 Save is blocked when policy name is empty', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {name, policy} = await openNewPermissionPolicy(app);

        // # Type then clear the name to mark the form dirty, enabling the Save button
        await name.fillValueTextbox('x');
        await name.fillValueTextbox('');
        await app.admin.saveButton.click();

        await expect(policy.errorText.locator).toContainText('Please add a name to the policy');
    });

    test('MM-T5810 Save is blocked when CEL expression is empty', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {name, policy} = await openNewPermissionPolicy(app);
        await name.fillValueTextbox(`PP Expr Validate ${pw.random.id()}`);
        await app.admin.saveButton.click();

        await expect(policy.errorText.locator).toContainText('Please add an expression to the policy');
    });

    test('MM-T5811 Save is blocked when no permission is selected', async ({pw}) => {
        test.setTimeout(120000);

        await pw.skipIfNoLicense();
        const {adminUser, adminClient} = await pw.initSetup();
        await ensureUserAttributes(adminClient);
        const {app} = await pw.testBrowser.login(adminUser);

        const {name, policy} = await openNewPermissionPolicy(app);
        await name.fillValueTextbox(`PP Perm Validate ${pw.random.id()}`);

        // # Enter a valid CEL expression but add no permissions
        await setCelExpression(app, policy, 'user.attributes.Department == "Engineering"');
        await app.admin.saveButton.click();

        await expect(policy.errorText.locator).toContainText('Please select at least one permission');
    });

    /**
     * @objective Verify a Members permission policy only offers Simulate rules, disabled until a permission is added, and never the role-blind Test access rule (MM-71299)
     */
    test(
        'keeps Simulate rules disabled until a permission is added without falling back to Test access rule',
        {tag: '@abac'},
        async ({pw}) => {
            test.setTimeout(120000);
            await pw.skipIfNoLicense();
            const {adminUser, adminClient} = await pw.initSetup();
            await ensureUserAttributes(adminClient);
            const {systemConsolePage} = await pw.testBrowser.login(adminUser);
            const page = systemConsolePage.page;

            // # Open the create form, keeping the default Members role
            await enableABAC(page);
            await navigateToPermissionPoliciesPage(page);
            await page.getByRole('button', {name: 'Add policy'}).click();
            await page.waitForLoadState('networkidle');

            // # Enter a valid rule without adding a permission
            await page.getByRole('button', {name: 'Switch to Advanced Mode'}).click();
            await page.locator('.monaco-editor').first().waitFor({state: 'visible', timeout: 5000});
            await page.locator('.monaco-editor .view-lines').first().click({force: true});
            await page.waitForTimeout(300);
            await page.keyboard.press(process.platform === 'darwin' ? 'Meta+a' : 'Control+a');
            await page.waitForTimeout(100);
            await page.keyboard.type('user.attributes.Department == "Engineering"', {delay: 10});

            // * Simulate rules is shown disabled, and the expression-only Test access rule is not offered
            const simulateButton = page.getByRole('button', {name: 'Simulate rules'});
            await expect(simulateButton).toBeVisible();
            await expect(simulateButton).toBeDisabled();
            await expect(page.getByRole('button', {name: 'Test access rule'})).toHaveCount(0);

            // # Add a permission
            await page.getByRole('button', {name: 'Add permission'}).click();
            await page.locator('#pp-add-permission-download_file_attachment').click();

            // * Simulate rules becomes available and opens the simulator, not the membership test results
            await expect(simulateButton).toBeEnabled({timeout: 10000});
            await simulateButton.click();
            await expect(page.getByRole('dialog', {name: 'Simulate access'})).toBeVisible();
            await expect(page.getByText('Access Rule Test Results')).toHaveCount(0);
        },
    );
});

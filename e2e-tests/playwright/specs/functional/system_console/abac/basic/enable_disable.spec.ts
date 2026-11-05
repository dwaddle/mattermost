// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test, duration} from '@mattermost/playwright-lib';

import {ensureUserAttributes} from '../support';
import {ABAC_SETTINGS_PATH, MEMBERSHIP_POLICIES_PATH, PERMISSION_POLICIES_PATH} from '../surface';

/**
 * Check whether the PermissionPolicies feature flag is enabled at runtime.
 * Returns true when the server exposes the permission_policies route.
 */
async function isPermissionPoliciesEnabled(adminClient: any): Promise<boolean> {
    const config = await adminClient.getConfig();
    return config.FeatureFlags?.PermissionPolicies === true || config.FeatureFlags?.PermissionPolicies === 'true';
}

/**
 * ABAC Basic Operations - Enable/Disable
 * Tests basic ABAC system-wide enable/disable functionality
 */

test('MM-T5782 System admin can enable or disable system-wide ABAC', async ({pw}) => {
    test.setTimeout(duration.two_min);

    // # Skip test if no license for ABAC
    await pw.skipIfNoLicense();

    // # Set up admin user and login
    const {adminUser, adminClient} = await pw.initSetup();

    // # Ensure user attributes exist BEFORE logging in
    await ensureUserAttributes(adminClient);

    // # Reset ABAC to disabled via API before testing the UI toggle.
    // Parallel tests may have already enabled it, which would leave the radio
    // pre-selected and the Save button permanently disabled (no dirty state).
    await adminClient.patchConfig({
        AccessControlSettings: {
            EnableAttributeBasedAccessControl: false,
        },
    } as any);

    // # Now login - this ensures the UI will have the attributes loaded
    const {app} = await pw.testBrowser.login(adminUser);

    // # Navigate to the Attribute-Based Access page from the sidebar
    await app.page.goto(generated.AdminConsolePage.path());
    await app.admin.sidebar.category('system_attributes').section('attribute_based_access_control').clickTitleLink();

    // Re-apply the ABAC=false reset right before UI interaction: a concurrent
    // initSetup() on another shard may have re-enabled ABAC between the initial
    // patchConfig call above and here. If it's already enabled when we click
    // enableRadio the radio is a no-op and Save stays disabled.
    await adminClient.patchConfig({
        AccessControlSettings: {
            EnableAttributeBasedAccessControl: false,
        },
    } as any);
    await pw.waitUntil(async () => {
        const cfg = await adminClient.getConfig();
        return cfg.AccessControlSettings?.EnableAttributeBasedAccessControl === false;
    });
    await app.page.reload();

    // * Verify we're on the correct page
    await expect(app.admin.pageElement('AttributeBasedAccessControl').locator).toBeVisible();

    const setting = app.admin.setting('AccessControlSettings.EnableAttributeBasedAccessControl');

    // # Test enable ABAC
    await setting.trueRadio.check();
    await expect(setting.trueRadio.locator).toBeChecked();
    await app.admin.saveButton.click();
    await expect(app.admin.saveButton.locator).toBeSaved();

    // * Verify the Attribute-Based Access page only has the toggle — no policy management here
    await expect(app.admin.accessControl.policies.addButton.locator).toHaveCount(0);

    // * Verify Membership Policies page shows "Add policy" when ABAC is enabled
    // Re-apply enable guard: a concurrent shard may have disabled ABAC between the
    // save above and this navigation, which would cause a redirect to the license page.
    await adminClient.patchConfig({AccessControlSettings: {EnableAttributeBasedAccessControl: true}});
    await pw.waitUntil(async () => {
        const cfg = await adminClient.getConfig();
        return cfg.AccessControlSettings?.EnableAttributeBasedAccessControl === true;
    });
    await app.page.goto(MEMBERSHIP_POLICIES_PATH);
    await expect(app.admin.accessControl.policies.addButton.locator).toBeVisible();

    // * Verify Permission Policies page shows "Add policy" when ABAC is enabled
    // This section is only testable when the PermissionPolicies feature flag is on.
    if (await isPermissionPoliciesEnabled(adminClient)) {
        await app.page.goto(PERMISSION_POLICIES_PATH);
        await expect(app.admin.permissionPolicies.addButton.locator).toBeVisible();
    }

    // # Navigate back to Attribute-Based Access to test disable
    await app.page.goto(ABAC_SETTINGS_PATH);

    // # Test disable ABAC
    await setting.falseRadio.check();
    await expect(setting.falseRadio.locator).toBeChecked();
    await app.admin.saveButton.click();
    await expect(app.admin.saveButton.locator).toBeSaved();

    // * Verify Membership Policies no longer shows "Add policy" when ABAC is disabled
    await app.page.goto(MEMBERSHIP_POLICIES_PATH);
    await expect(app.admin.sidebar.locator).toBeVisible();
    await expect(app.admin.accessControl.policies.addButton.locator).not.toBeVisible();

    // # Re-enable ABAC for subsequent tests via API — avoids the race where a concurrent
    // shard's initSetup() re-enables ABAC between the disable save and here, leaving the
    // radio already checked so the UI save button stays disabled.
    await adminClient.patchConfig({AccessControlSettings: {EnableAttributeBasedAccessControl: true}});
});

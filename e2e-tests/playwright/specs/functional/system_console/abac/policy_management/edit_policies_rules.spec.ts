// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, verifyUserInChannel} from '@mattermost/playwright-lib';

import {
    createPrivateChannelForABAC,
    createUserForABAC,
    enableUserManagedAttributes,
    getUserAttributeFieldByName,
} from '../support';
import {deleteFieldFromDB} from '../masking/masking_db_setup';
import {
    addRule,
    createMembershipPolicy,
    expectAccessTest,
    openPolicy,
    policyIdByName,
    savePolicy,
    setAbacEnabled,
    waitForSyncJob,
} from '../surface';

/**
 * MM-T5791: Editing existing access policy to add another attribute applies access control as specified (with auto-add)
 *
 * Precondition: At least one policy in existence
 *
 * Step 1:
 * 1. Go to ABAC page, click a policy to edit. Ensure Auto-add is TRUE
 * 2. Edit an existing policy rule to add another attribute/value
 * 3. Click Test Access Rule, observe users who satisfy the policy
 * 4. Save the changes
 * 5. User who satisfies NEWLY EDITED policy but not in channel → auto-ADDED
 * 6. User who doesn't satisfy NEWLY EDITED policy and is in channel → auto-REMOVED
 *
 * Expected:
 * - User satisfying new multi-attribute policy IS auto-added
 * - User not satisfying new policy IS auto-removed
 */
test('MM-T5791 Editing policy to add attribute with auto-add enabled', async ({pw}) => {
    test.setTimeout(180000);

    await pw.skipIfNoLicense();

    const {adminUser, adminClient, team} = await pw.initSetup();

    // Ensure Office field exists with correct managed:admin permissions.
    // Fields created by older server versions may lack permission_values, causing 403
    // when setting attribute values — delete and recreate if permission_values is missing.
    // Legacy fields with permission_field=null reject API deletion (403), so fall back to DB.
    const existingFields = await adminClient.getCustomProfileAttributeFields();
    const attributeFieldsMap: Record<string, any> = {};
    for (const field of existingFields) {
        attributeFieldsMap[field.id] = field;
    }
    const existingOffice = existingFields.find((f: any) => f.name === 'Office') as any;
    if (!existingOffice || !(existingOffice as any).permission_values) {
        if (existingOffice) {
            try {
                await adminClient.deleteCustomProfileAttributeField(existingOffice.id);
            } catch {
                await deleteFieldFromDB(existingOffice.id);
            }
            delete attributeFieldsMap[existingOffice.id];
        }
        const officeField = await adminClient.createCustomProfileAttributeField({
            name: 'Office',
            type: 'text',
            attrs: {managed: 'admin', visibility: 'when_set', sort_order: 1},
        } as any);
        attributeFieldsMap[officeField.id] = officeField;
    }

    // Wait until the policy editor's attribute list (the access control fields) has the Office field
    await expect
        .poll(async () => (await adminClient.getAccessControlFields('', 100)).map((field) => field.name), {
            message: 'the access control fields never listed Office',
        })
        .toContain('Office');

    // Create users:
    // 1. engineerRemoteUser: Dept=Engineering, Office=Remote → satisfies BOTH (after edit)
    // 2. engineerOfficeUser: Dept=Engineering, Office=HQ → satisfies ORIGINAL only, NOT the edited policy
    // 3. salesUser: Dept=Sales → doesn't satisfy any policy

    const engineerRemoteUser = await createUserForABAC(adminClient, attributeFieldsMap, [
        {name: 'Department', type: 'text', value: 'Engineering'},
        {name: 'Office', type: 'text', value: 'Remote'},
    ]);

    const engineerOfficeUser = await createUserForABAC(adminClient, attributeFieldsMap, [
        {name: 'Department', type: 'text', value: 'Engineering'},
        {name: 'Office', type: 'text', value: 'HQ'},
    ]);

    const salesUser = await createUserForABAC(adminClient, attributeFieldsMap, [
        {name: 'Department', type: 'text', value: 'Sales'},
    ]);

    // Add users to team
    await adminClient.addToTeam(team.id, engineerRemoteUser.id);
    await adminClient.addToTeam(team.id, engineerOfficeUser.id);
    await adminClient.addToTeam(team.id, salesUser.id);

    // Create channel and add engineerOfficeUser (satisfies original policy)
    const privateChannel = await createPrivateChannelForABAC(adminClient, team.id);
    await adminClient.addToChannel(engineerOfficeUser.id, privateChannel.id);

    const department = await getUserAttributeFieldByName(adminClient, 'Department');
    const office = await getUserAttributeFieldByName(adminClient, 'Office');

    const {app} = await pw.testBrowser.login(adminUser);
    await setAbacEnabled(app, true);

    // ===========================================
    // PRECONDITION: Create ORIGINAL policy with ONE attribute (Department=Engineering)
    // Auto-add ON so users are auto-added
    // ===========================================
    const policyName = `ABAC-AddAttr-Test-${await pw.random.id()}`;
    const createJobId = await createMembershipPolicy(app, {
        name: policyName,
        rules: [{field: department, value: 'Engineering'}],
        channels: [privateChannel],
        autoAdd: true,
    });
    await waitForSyncJob(adminClient, createJobId!);
    const policyId = await policyIdByName(adminClient, policyName);

    // ===========================================
    // STEP 1-2: Edit policy to ADD another attribute (Office=Remote)
    // New expression: Department=Engineering AND Office=Remote
    // ===========================================
    const policy = await openPolicy(app, policyId);
    await expect(policy.channels.autoAddAllCheckbox.locator).toBeChecked();
    await addRule(policy.rules, {field: office, value: 'Remote'});

    // ===========================================
    // STEP 3: Test Access Rule
    // ===========================================
    await expectAccessTest(app, policy, {
        client: adminClient,
        matching: [engineerRemoteUser],
        notMatching: [engineerOfficeUser, salesUser],
    });

    // ===========================================
    // STEP 4: Save the changes, applying the policy, and wait for its sync
    // ===========================================
    const editSyncJobId = await savePolicy(app, policy);
    await waitForSyncJob(adminClient, editSyncJobId!);

    // ===========================================
    // STEP 5 & 6: Verify channel membership after edit
    // ===========================================

    // Poll under PW_WORKERS>=2: another shard's sync job may briefly change
    // membership after we read it, so we retry until stable.
    await expect
        .poll(async () => verifyUserInChannel(adminClient, engineerRemoteUser.id, privateChannel.id), {
            timeout: 30_000,
            intervals: [500, 1000, 2000],
            message: 'engineerRemoteUser should be in channel (satisfies BOTH attributes)',
        })
        .toBe(true);
    await expect
        .poll(async () => verifyUserInChannel(adminClient, engineerOfficeUser.id, privateChannel.id), {
            timeout: 30_000,
            intervals: [500, 1000, 2000],
            message: 'engineerOfficeUser should be REMOVED (does not satisfy new policy)',
        })
        .toBe(false);
    await expect
        .poll(async () => verifyUserInChannel(adminClient, salesUser.id, privateChannel.id), {
            timeout: 30_000,
            intervals: [500, 1000, 2000],
            message: 'salesUser should not be in channel',
        })
        .toBe(false);
});

/**
 * MM-T5792: Editing existing access policy to remove one of the rules applies access control as specified (with auto-add)
 *
 * Precondition: At least one policy with MULTIPLE rules in existence
 *
 * Step 1:
 * 1. Go to ABAC page, click a policy to edit. Ensure Auto-add is TRUE
 * 2. Edit policy to REMOVE one of the rules (attribute/value)
 * 3. Click Test Access Rule, observe users who satisfy the policy
 * 4. Save the changes
 * 5. User who satisfies newly edited (simpler) policy but not in channel → auto-ADDED
 * 6. User who no longer satisfies newly edited policy and is in channel → auto-REMOVED
 *
 * This is the OPPOSITE of MM-T5791:
 * - MM-T5791: ADD rule → policy MORE restrictive
 * - MM-T5792: REMOVE rule → policy LESS restrictive
 */
test('MM-T5792 Editing policy to remove attribute rule with auto-add enabled', async ({pw}) => {
    test.setTimeout(180000);

    await pw.skipIfNoLicense();

    const {adminUser, adminClient, team} = await pw.initSetup();

    // Ensure Office field exists with correct managed:admin permissions.
    // Fields created by older server versions may lack permission_values, causing 403
    // when setting attribute values — delete and recreate if permission_values is missing.
    // Legacy fields with permission_field=null reject API deletion (403), so fall back to DB.
    const existingFields = await adminClient.getCustomProfileAttributeFields();
    const attributeFieldsMap: Record<string, any> = {};
    for (const field of existingFields) {
        attributeFieldsMap[field.id] = field;
    }
    const existingOffice = existingFields.find((f: any) => f.name === 'Office') as any;
    if (!existingOffice || !(existingOffice as any).permission_values) {
        if (existingOffice) {
            try {
                await adminClient.deleteCustomProfileAttributeField(existingOffice.id);
            } catch {
                await deleteFieldFromDB(existingOffice.id);
            }
            delete attributeFieldsMap[existingOffice.id];
        }
        const officeField = await adminClient.createCustomProfileAttributeField({
            name: 'Office',
            type: 'text',
            attrs: {managed: 'admin', visibility: 'when_set', sort_order: 1},
        } as any);
        attributeFieldsMap[officeField.id] = officeField;
    }

    // Wait until the policy editor's attribute list (the access control fields) has the Office field
    await expect
        .poll(async () => (await adminClient.getAccessControlFields('', 100)).map((field) => field.name), {
            message: 'the access control fields never listed Office',
        })
        .toContain('Office');
    await enableUserManagedAttributes(adminClient);

    // Create users:
    // 1. engineerRemoteUser: Dept=Engineering, Office=Remote → satisfies ORIGINAL (both rules)
    // 2. engineerOfficeUser: Dept=Engineering, Office=HQ → satisfies EDITED policy (Dept only)
    // 3. salesRemoteUser: Dept=Sales, Office=Remote → doesn't satisfy (wrong Dept)

    const engineerRemoteUser = await createUserForABAC(adminClient, attributeFieldsMap, [
        {name: 'Department', type: 'text', value: 'Engineering'},
        {name: 'Office', type: 'text', value: 'Remote'},
    ]);

    const engineerOfficeUser = await createUserForABAC(adminClient, attributeFieldsMap, [
        {name: 'Department', type: 'text', value: 'Engineering'},
        {name: 'Office', type: 'text', value: 'HQ'},
    ]);

    const salesRemoteUser = await createUserForABAC(adminClient, attributeFieldsMap, [
        {name: 'Department', type: 'text', value: 'Sales'},
        {name: 'Office', type: 'text', value: 'Remote'},
    ]);

    // Add users to team
    await adminClient.addToTeam(team.id, engineerRemoteUser.id);
    await adminClient.addToTeam(team.id, engineerOfficeUser.id);
    await adminClient.addToTeam(team.id, salesRemoteUser.id);

    // Create channel and add salesRemoteUser (does NOT satisfy any policy)
    const privateChannel = await createPrivateChannelForABAC(adminClient, team.id);
    await adminClient.addToChannel(salesRemoteUser.id, privateChannel.id);

    const office = await getUserAttributeFieldByName(adminClient, 'Office');

    const {app} = await pw.testBrowser.login(adminUser);
    await setAbacEnabled(app, true);

    // ===========================================
    // PRECONDITION: Create ORIGINAL policy with TWO attributes
    // Department=Engineering AND Office=Remote, Auto-add ON
    // ===========================================
    const policyName = `ABAC-RemoveRule-${await pw.random.id()}`;
    const createJobId = await createMembershipPolicy(app, {
        name: policyName,
        cel: 'user.attributes.Department == "Engineering" && user.attributes.Office == "Remote"',
        channels: [privateChannel],
        autoAdd: true,
    });
    await waitForSyncJob(adminClient, createJobId!);
    const policyId = await policyIdByName(adminClient, policyName);

    // ===========================================
    // STEP 1-2: Edit policy to REMOVE the Office rule
    // New expression: Department=Engineering (only)
    // ===========================================
    const policy = await openPolicy(app, policyId);

    // * Auto-add is ON
    await expect(policy.channels.autoAddAllCheckbox.locator).toBeChecked();

    // # Remove the Office rule in Simple mode (table editor). A policy written in Advanced mode
    //   opens in it; the switch stays disabled while the attributes load.
    await expect(policy.switchModeButton.locator).toBeEnabled({timeout: 60_000});
    if ((await policy.switchModeButton.locator.textContent()) === 'Switch to Simple Mode') {
        await policy.switchModeButton.click();
    }
    const officeRule = policy.rules.row(1);
    await expect(officeRule.attributeButton.locator).toContainText(office.name);
    await officeRule.removeButton.click();
    await expect(policy.rules.rowItems).toHaveCount(1);

    // ===========================================
    // STEP 3: Test Access Rule
    // ===========================================
    await expectAccessTest(app, policy, {
        client: adminClient,
        matching: [engineerRemoteUser, engineerOfficeUser],
        notMatching: [salesRemoteUser],
    });

    // ===========================================
    // STEP 4: Save the changes, applying the policy, and wait for its sync
    // ===========================================
    const editSyncJobId = await savePolicy(app, policy);
    await waitForSyncJob(adminClient, editSyncJobId!);

    // ===========================================
    // STEP 5 & 6: Verify channel membership after edit
    // ===========================================

    // Re-apply guard: a concurrent initSetup() may have reset ABAC between the policy save
    // and the sync job completing. Without ABAC enabled the sync job is a no-op.
    await adminClient.patchConfig({
        AccessControlSettings: {
            EnableAttributeBasedAccessControl: true,
            EnableUserManagedAttributes: true,
        },
    } as any);

    // Poll under PW_WORKERS>=2: other shards' sync jobs may briefly change membership.
    await expect
        .poll(async () => verifyUserInChannel(adminClient, engineerOfficeUser.id, privateChannel.id), {
            timeout: 30_000,
            intervals: [500, 1000, 2000],
            message: 'engineerOfficeUser should be AUTO-ADDED (satisfies simpler Dept-only policy)',
        })
        .toBe(true);
    await expect
        .poll(async () => verifyUserInChannel(adminClient, engineerRemoteUser.id, privateChannel.id), {
            timeout: 30_000,
            intervals: [500, 1000, 2000],
            message: 'engineerRemoteUser should still be in channel',
        })
        .toBe(true);
    await expect
        .poll(async () => verifyUserInChannel(adminClient, salesRemoteUser.id, privateChannel.id), {
            timeout: 30_000,
            intervals: [500, 1000, 2000],
            message: 'salesRemoteUser should NOT be in channel',
        })
        .toBe(false);
});

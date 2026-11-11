// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * E2E tests for MM-64357 in the Membership Policy editor.
 *
 * A rule value containing a quote character (e.g. the apostrophe in
 * "Matt's Department") must still be recognized as a simple expression. Before
 * the fix the quoted-value matcher forbade any inner quote, so such a rule was
 * misclassified as complex: the "Switch to Simple Mode" toggle became disabled
 * and the admin was trapped in Advanced mode after a save/reopen.
 *
 * These specs drive the rendered UI (button enabled/disabled state and the
 * save -> reopen round-trip) rather than the helper functions directly, which
 * is the coverage gap flagged in review.
 */

import type {Client4} from '@mattermost/client';
import type {UserProfile} from '@mattermost/types/users';
import type {UserPropertyField} from '@mattermost/types/properties_user';

import {expect, getRandomId, test, duration} from '@mattermost/playwright-lib';

import {deleteCustomProfileAttributes} from '../../../channels/custom_profile_attributes/helpers';
import {addRule, openMembershipPolicies, openPolicy, policyIdByName} from '../surface';

const APOSTROPHE_VALUE = "Matt's Department";

test.describe('System Console - Membership Policy apostrophe values (MM-64357)', () => {
    let adminClient: Client4;
    let adminUser: UserProfile;
    let field: UserPropertyField | undefined;

    test.beforeEach(async ({pw}) => {
        await pw.ensureLicense();
        await pw.skipIfNoLicense();

        const clientInfo = await pw.getAdminClient();
        adminClient = clientInfo.adminClient;
        adminUser = clientInfo.adminUser!;

        // # Create an admin-managed text attribute (admin-managed → usable in ABAC)
        field = await adminClient.createCustomProfileAttributeField({
            name: `department_${getRandomId()}`,
            type: 'text',
            attrs: {
                sort_order: 0,
                managed: 'admin',
            },
        } as any);

        // # Make sure ABAC stays enabled (a concurrent initSetup can reset config)
        await adminClient.patchConfig({
            AccessControlSettings: {EnableAttributeBasedAccessControl: true},
        } as any);
    });

    test.afterEach(async () => {
        if (field) {
            await deleteCustomProfileAttributes(adminClient, {
                [field.id]: field,
                __ownedIds: new Set([field.id]),
            } as any);
            field = undefined;
        }
    });

    /**
     * @objective A rule whose value contains an apostrophe survives a
     * save/reopen round-trip: the stored expression rehydrates as a simple
     * expression so the "Switch to Simple Mode" toggle stays enabled (the admin
     * is not trapped in Advanced mode) and the table editor re-renders the same
     * value.
     *
     * @precondition
     * An admin-managed text attribute exists.
     */
    test('round-trips an apostrophe "is" value and keeps the mode toggle switchable', {tag: '@abac'}, async ({pw}) => {
        const {app} = await pw.testBrowser.login(adminUser);
        const policyName = `Apostrophe RT ${getRandomId()}`;
        let policyId: string | null = null;

        try {
            // # Create a policy and add a text attribute rule with a value containing an apostrophe
            const policies = await openMembershipPolicies(app);
            await policies.clickAddButton();
            const {policy} = app.admin.accessControl;
            await policy.editPolicy.name.fillValueTextbox(policyName);
            const row = await addRule(policy.rules, {field: field!, value: APOSTROPHE_VALUE});

            // * A text attribute defaults to the "is" operator
            await expect(row.operatorButton.locator).toContainText('is');
            await expect(row.valueTextbox.locator).toHaveValue(APOSTROPHE_VALUE);

            // # Save the policy and reopen it
            await app.admin.saveButton.click();
            policyId = await policyIdByName(adminClient, policyName);
            const reopened = await openPolicy(app, policyId);

            // # Switch to Advanced mode so the "Switch to Simple Mode" toggle is present.
            await expect(reopened.switchModeButton.locator).toHaveText('Switch to Advanced Mode');
            await expect(reopened.switchModeButton.locator).toBeEnabled({timeout: duration.one_min});
            await reopened.switchModeButton.click();

            // * The stored apostrophe expression classifies as simple, so the
            //   toggle back to Simple mode stays enabled (before the fix it was
            //   disabled, trapping the admin in Advanced mode).
            await expect(reopened.switchModeButton.locator).toHaveText('Switch to Simple Mode');
            await expect(reopened.switchModeButton.locator).toBeEnabled();

            // # Return to Simple mode and confirm the value round-tripped intact
            await reopened.switchModeButton.click();
            await expect(reopened.rules.row(0).operatorButton.locator).toContainText('is');
            await expect(reopened.rules.row(0).valueTextbox.locator).toHaveValue(APOSTROPHE_VALUE);
        } finally {
            // Clean up the policy. If we didn't capture the ID from the DOM (e.g. because
            // save succeeded but navigation/assertion failed), search for it by name.
            let idToDelete = policyId;
            if (!idToDelete) {
                try {
                    const searchResult = await adminClient.searchAccessControlPolicies(policyName, 'parent', '', 10);
                    const foundPolicy = searchResult.policies?.find((p) => p.name === policyName);
                    if (foundPolicy) {
                        idToDelete = foundPolicy.id;
                    }
                } catch {
                    // Search failed; skip cleanup
                }
            }
            if (idToDelete) {
                await adminClient.deleteAccessControlPolicy(idToDelete).catch(() => {});
            }
        }
    });
});

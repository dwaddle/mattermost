// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * E2E tests for ranked comparison operators in the Membership Policy editor.
 *
 * When the selected attribute is of type `rank`, the simple-mode operator
 * dropdown replaces the standard set with the ordinal comparison operators
 * (is exactly, is not, is at least, is greater than, is at most, is less than).
 */

import type {Client4} from '@mattermost/client';
import type {UserProfile} from '@mattermost/types/users';
import type {UserPropertyField} from '@mattermost/types/properties_user';

import {AdminOperator, expect, getRandomId, test, type App} from '@mattermost/playwright-lib';

import {deleteCustomProfileAttributes} from '../../../channels/custom_profile_attributes/helpers';
import {assertAccessControlAutocompleteContains} from '../support';
import {openMembershipPolicies, openPolicy, policyIdByName} from '../surface';

const RANKED_OPERATORS = [
    AdminOperator.IsExactly,
    AdminOperator.IsNot,
    AdminOperator.IsAtLeast,
    AdminOperator.IsGreaterThan,
    AdminOperator.IsAtMost,
    AdminOperator.IsLessThan,
];
const STANDARD_OPERATORS = [
    AdminOperator.Is,
    AdminOperator.In,
    AdminOperator.HasAnyOf,
    AdminOperator.HasAllOf,
    AdminOperator.StartsWith,
    AdminOperator.EndsWith,
    AdminOperator.Contains,
];

/** Opens a new policy, names it, and adds a rule on the attribute; returns the rule's row. */
async function newPolicyWithAttribute(app: App, name: string, attribute: UserPropertyField) {
    const policies = await openMembershipPolicies(app);
    await policies.clickAddButton();
    const {policy} = app.admin.accessControl;
    await policy.editPolicy.name.fillValueTextbox(name);
    const row = policy.rules.row(0);
    await policy.rules.clickAddButton();
    await row.attributeMenu.attribute(attribute).click();
    await expect(row.attributeButton.locator).toContainText(attribute.name);
    return row;
}

test.describe('System Console - Membership Policy ranked operators', () => {
    let adminClient: Client4;
    let adminUser: UserProfile;
    let field: UserPropertyField | undefined;

    test.beforeEach(async ({pw}) => {
        await pw.ensureLicense();
        await pw.skipIfNoLicense();

        const clientInfo = await pw.getAdminClient();
        adminClient = clientInfo.adminClient;
        adminUser = clientInfo.adminUser!;

        // # Create an admin-managed ranked attribute (admin-managed → usable in ABAC)
        field = await adminClient.createCustomProfileAttributeField({
            name: `clearance_${getRandomId()}`,
            type: 'rank',
            attrs: {
                sort_order: 0,
                managed: 'admin',
                options: [
                    {name: 'Unclassified', rank: 1},
                    {name: 'Secret', rank: 2},
                    {name: 'TopSecret', rank: 3},
                ],
            },
        } as any);

        // # Make sure ABAC stays enabled (a concurrent initSetup can reset config)
        await adminClient.patchConfig({
            AccessControlSettings: {EnableAttributeBasedAccessControl: true},
        } as any);

        await assertAccessControlAutocompleteContains(adminClient, [field.name]);
    });

    test.afterEach(async () => {
        if (field) {
            await deleteCustomProfileAttributes(adminClient, {
                [field.id]: field,
                ownedIds: new Set([field.id]),
            } as any);
            field = undefined;
        }
    });

    /**
     * @objective Selecting a ranked attribute in the policy editor surfaces the
     * ordinal operators and removes the equality/string/list operators; the row
     * defaults to "is at least".
     *
     * @precondition
     * An admin-managed ranked attribute (Unclassified/Secret/TopSecret) exists.
     */
    test('shows ranked comparison operators for a ranked attribute', {tag: '@abac'}, async ({pw}) => {
        const {app} = await pw.testBrowser.login(adminUser);

        // # ABAC is already enabled (see beforeEach): open a new policy, name it, and add a ranked attribute rule
        const row = await newPolicyWithAttribute(app, `Ranked Policy ${getRandomId()}`, field!);

        // * The row defaults to the canonical ranked operator, "is at least"
        await expect(row.operatorButton.locator).toContainText('is at least');

        // # Open the operator dropdown
        await row.operatorButton.click();

        // * All six ranked operators are offered
        for (const operator of RANKED_OPERATORS) {
            await expect(row.operatorMenu.operator(operator).locator).toBeVisible();
        }

        // * The standard (non-ranked) operators are not offered
        for (const operator of STANDARD_OPERATORS) {
            await expect(row.operatorMenu.operator(operator).locator).toHaveCount(0);
        }
    });

    /**
     * @objective An "is at least <option>" rule built in the editor survives a
     * save/reopen round-trip: the stored marker form rehydrates back to the
     * operator form and the table editor re-renders the same operator and value.
     *
     * @precondition
     * An admin-managed ranked attribute (Unclassified/Secret/TopSecret) exists.
     */
    test('round-trips an "is at least" ranked rule through save and reopen', {tag: '@abac'}, async ({pw}) => {
        const {app} = await pw.testBrowser.login(adminUser);
        const policyName = `Ranked RT ${getRandomId()}`;
        let policyId: string | null = null;

        try {
            // # Create a policy and add a ranked attribute rule
            const row = await newPolicyWithAttribute(app, policyName, field!);

            // * Defaults to "is at least"
            await expect(row.operatorButton.locator).toContainText('is at least');

            // # Pick the value "Secret" (the options run Unclassified, Secret, TopSecret)
            const values = await row.clickValueButton();
            await expect(values.option(1).locator).toHaveText('Secret');
            await values.option(1).click();
            await expect(row.valueButton.locator).toContainText('Secret');

            // # Save the policy and reopen it
            await app.admin.saveButton.click();
            policyId = await policyIdByName(adminClient, policyName);
            const policy = await openPolicy(app, policyId);

            // Existing policies open in Advanced mode. The "Switch to Simple Mode"
            // toggle is enabled only when isSimpleExpression accepts the stored
            // expression — proving the marker form rehydrated to `>= "Secret"`
            // (a non-rehydrated `_rank_ge(...)` marker would disable the toggle).
            await expect(policy.switchModeButton.locator).toBeEnabled();
            if ((await policy.switchModeButton.locator.textContent()) === 'Switch to Simple Mode') {
                await policy.switchModeButton.click();
            }

            // * The table editor re-parses the rehydrated rule to the same operator
            //   and value (no rank integer surfaced in the value chip)
            const reopened = policy.rules.row(0);
            await expect(reopened.operatorButton.locator).toContainText('is at least');
            await expect(reopened.valueButton.locator).toContainText('Secret');
            await expect(reopened.valueButton.locator).not.toContainText('2');
        } finally {
            if (policyId) {
                await adminClient.deleteAccessControlPolicy(policyId).catch(() => {});
            }
        }
    });
});

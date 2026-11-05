// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {UserPropertyField} from '@mattermost/types/properties_user';

import {expect, test} from '@mattermost/playwright-lib';

import type {CustomProfileAttribute} from '../../../channels/custom_profile_attributes/helpers';
import {
    deleteCustomProfileAttributes,
    setupCustomProfileAttributeFields,
} from '../../../channels/custom_profile_attributes/helpers';
import {fieldNamed, fillRuleValue, openMembershipPolicies, policyIdByName, setAbacEnabled} from '../surface';

type FieldsMap = Record<string, UserPropertyField>;

async function clearExistingFields(client: Client4): Promise<void> {
    try {
        const existing = await client.getCustomProfileAttributeFields();
        if (existing?.length) {
            const map: FieldsMap = {};
            for (const f of existing) {
                map[f.id] = f;
            }
            await deleteCustomProfileAttributes(client, map);
        }
    } catch {
        // No fields to clean up
    }
}

test.describe('ABAC Attribute Selector - display_name rendering and filtering', () => {
    /**
     * @objective Verify the attribute selector renders display_name when set,
     * falls back to `name`, filters on both, and persists the CEL identifier
     * in saved policy expressions.
     *
     * @precondition
     * Two admin-managed CPA fields seeded via REST: `dept_head` with
     * display_name 'Department Head', and `office` with no display_name.
     */
    test(
        'renders and filters by display_name while persisting CEL identifier',
        {tag: '@user_attributes'},
        async ({pw}) => {
            test.setTimeout(120000);

            await pw.ensureLicense();
            await pw.skipIfNoLicense();

            const {adminUser, adminClient} = await pw.initSetup();

            await clearExistingFields(adminClient);

            const seedAttributes: CustomProfileAttribute[] = [
                {
                    name: 'dept_head',
                    type: 'text',
                    attrs: {
                        display_name: 'Department Head',
                        visibility: 'when_set',
                        managed: 'admin',
                    },
                },
                {
                    name: 'office',
                    type: 'text',
                    attrs: {
                        visibility: 'when_set',
                        managed: 'admin',
                    },
                },
            ];

            const fieldsMap = await setupCustomProfileAttributeFields(adminClient, seedAttributes);

            const policyName = `Display Name Selector ${pw.random.id()}`;
            let policyId: string | null = null;

            try {
                const {app} = await pw.testBrowser.login(adminUser);
                await setAbacEnabled(app, true);

                // # Open the new-policy form
                const policies = await openMembershipPolicies(app);
                await policies.clickAddButton();
                const {policy} = app.admin.accessControl;
                await policy.editPolicy.name.fillValueTextbox(policyName);

                // # Add an attribute rule; its selector opens itself
                const row = policy.rules.row(0);
                await expect(policy.rules.addButton.locator).toBeEnabled();
                await policy.rules.clickAddButton();
                const {attributeMenu} = row;
                const deptHead = attributeMenu.attribute(fieldNamed(fieldsMap, 'dept_head'));
                const office = attributeMenu.attribute(fieldNamed(fieldsMap, 'office'));

                // * Both fields render: 'Department Head' (display_name, shown beside its identifier) and 'office' (name fallback)
                await expect(deptHead.locator).toContainText('Department Head');
                await expect(office.locator).toHaveText('office');

                // * Filter by display_name keeps only 'Department Head'
                await attributeMenu.fillFilterTextbox('department');
                await expect(deptHead.locator).toBeVisible();
                await expect(office.locator).toHaveCount(0);

                // * Filter by CEL identifier keeps only 'Department Head'
                await attributeMenu.fillFilterTextbox('dept_head');
                await expect(deptHead.locator).toBeVisible();
                await expect(office.locator).toHaveCount(0);

                // * Filter on the no-display_name field's `name` keeps only 'office'
                await attributeMenu.fillFilterTextbox('office');
                await expect(office.locator).toBeVisible();
                await expect(deptHead.locator).toHaveCount(0);

                // # Select 'Department Head'
                await attributeMenu.fillFilterTextbox('');
                await deptHead.click();

                // * The trigger button shows display_name, not the CEL identifier
                await expect(row.attributeButton.locator).toContainText('Department Head');

                // # The rule is "is engineering"
                await expect(deptHead.locator).not.toBeVisible();
                await expect(row.operatorButton.locator).toContainText('is');
                await fillRuleValue(row, 'engineering');

                // # Save
                await expect(app.admin.saveButton.locator).toBeEnabled();
                await app.admin.saveButton.click();
                await expect(app.page).toHaveURL(/\/admin_console\/system_attributes\/membership_policies$/);

                // * The persisted CEL uses the canonical identifier, not display_name
                policyId = await policyIdByName(adminClient, policyName);
                const saved = await adminClient.getAccessControlPolicy(policyId);

                const rules = (saved?.rules || []) as Array<{actions?: string[]; expression?: string}>;
                const membershipRule = rules.find((r) => r.actions?.includes('membership')) || rules[0];

                expect(membershipRule).toBeDefined();
                expect(membershipRule?.expression || '').toContain('user.attributes.dept_head');
                expect(membershipRule?.expression || '').not.toContain('Department Head');
            } finally {
                if (policyId) {
                    try {
                        await (adminClient as any).doFetch(
                            `${adminClient.getBaseRoute()}/access_control_policies/${policyId}`,
                            {method: 'DELETE'},
                        );
                    } catch {
                        // best-effort cleanup
                    }
                }

                await deleteCustomProfileAttributes(adminClient, fieldsMap);
            }
        },
    );
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {
    deleteCustomProfileAttributes,
    setupCustomProfileAttributeFields,
} from '../../../channels/custom_profile_attributes/helpers';
import {openPolicy} from '../surface';
import {
    assertAccessControlAutocompleteContains,
    createPrivateChannelForABAC,
    createUserForABAC,
    enableUserManagedAttributes,
} from '../support';

import {
    createChannelTextField,
    createParentPolicyViaAPI,
    deleteParentPolicy,
    deletePropertyFieldQuietly,
    setChannelAttributeValue,
} from './helpers';

/**
 * Test-matching-users channel picker end to end.
 *
 * A parent policy that references resource.attributes.* has no channel scope of
 * its own, so "Test access rule" cannot resolve the rule until the admin picks a
 * concrete channel. The shared test modal therefore opens a channel-picker step
 * first; the picked channel's attribute values are threaded into the matching-users
 * query. This asserts that flow over the real UI + HTTP: the picker finds a
 * channel by name, choosing it resolves the rule against that channel (a matching
 * user appears, a non-matching one does not), and the back arrow returns to the
 * picker.
 *
 * The matching-users query reads the attribute materialized view, refreshed on a
 * throttled (~30s) cadence, so the first read after setting values may lag — the
 * matching assertion re-searches until the view catches up.
 */
test.describe('ABAC resource.attributes - test picker', {tag: ['@abac', '@abac_resource_attributes']}, () => {
    // Fixtures this file created, torn down after each test. The access_control group
    // allows at most 20 user-object fields, so a spec that leaks its fields eventually
    // fails every later spec's setup rather than its own.
    const cleanups: Array<() => Promise<void>> = [];

    test.afterEach(async () => {
        // Reverse order, so a policy goes before the fields its rules reference: while
        // attribute-value masking is on, deleting a policy whose field is already gone
        // is refused outright and the policy can no longer be removed at all.
        for (const cleanup of cleanups.reverse()) {
            await cleanup().catch(() => {});
        }
        cleanups.length = 0;
    });

    test('picker resolves a resource rule against the chosen channel', async ({pw}) => {
        test.setTimeout(120000);
        await pw.skipIfNoLicense();
        await pw.ensureFeatureFlag('ResourceAttributesInPolicies', true);

        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableUserManagedAttributes(adminClient);
        await adminClient.patchConfig({
            AccessControlSettings: {EnableAttributeBasedAccessControl: true},
        } as Parameters<typeof adminClient.patchConfig>[0]);

        // Same field name on both object types so user.attributes.<attr> compares
        // to resource.attributes.<attr>.
        const attr = `region${pw.random.id()}`;
        const fieldsMap = await setupCustomProfileAttributeFields(adminClient, [{name: attr, type: 'text', value: ''}]);
        cleanups.push(() => deleteCustomProfileAttributes(adminClient, fieldsMap));
        const channelFieldId = await createChannelTextField(adminClient, attr);
        cleanups.push(() => deletePropertyFieldQuietly(adminClient, 'channel', channelFieldId));

        const userUS = await createUserForABAC(adminClient, fieldsMap, [{name: attr, type: 'text', value: 'us'}]);
        const userEU = await createUserForABAC(adminClient, fieldsMap, [{name: attr, type: 'text', value: 'eu'}]);
        await adminClient.addToTeam(team.id, userUS.id);
        await adminClient.addToTeam(team.id, userEU.id);

        const channelUS = await createPrivateChannelForABAC(adminClient, team.id);
        await setChannelAttributeValue(adminClient, channelUS.id, channelFieldId, 'us');

        const policyId = await createParentPolicyViaAPI(adminClient, {
            name: `Picker ${pw.random.id()}`,
            expression: `user.attributes.${attr} == resource.attributes.${attr}`,
        });
        cleanups.push(() => deleteParentPolicy(adminClient, policyId));

        // Fail fast if the editor won't see the attribute (keeps the Test button disabled).
        await assertAccessControlAutocompleteContains(adminClient, [attr]);

        const {app} = await pw.testBrowser.login(adminUser);
        const policy = await openPolicy(app, policyId);
        const {testButton} = policy.rules;
        await expect(testButton.locator).toBeEnabled({timeout: 15000});
        await policy.rules.clickTestButton();
        const modal = app.policyTestModal;

        // # Picker step: no channel scope on the parent, so the picker precedes the members list
        const picker = modal.channelPicker;
        await expect(picker.searchTextbox.locator).toBeVisible();
        await picker.fillSearchTextbox(channelUS.display_name);
        await picker.channel(channelUS).click();

        // * Members step: the rule now resolves against channelUS (region == "us")
        await expect(picker.locator).not.toBeVisible();
        await expect(modal.backButton.locator).toBeVisible();

        const {users} = modal;
        await expect(async () => {
            await users.fillSearchTextbox(userUS.username);
            await expect(users.user(userUS).locator).toBeVisible({timeout: 3000});
        }).toPass({timeout: 60000, intervals: [3000]});

        // * The non-matching user (region == "eu") is not admitted against this channel.
        // Wait for the search round-trip before asserting absence: the previous
        // row is cleared the moment the term changes, so toHaveCount(0) would
        // pass on that intermediate empty render even if userEU were admitted.
        const euSearch = app.page.waitForResponse(
            (r) => r.url().includes('/access_control_policies/cel/test') && r.request().method() === 'POST',
            {timeout: 15000},
        );
        await users.fillSearchTextbox(userEU.username);
        await euSearch;
        await expect(users.user(userEU).locator).toHaveCount(0);

        // # The back arrow returns to the picker (only present because it preceded)
        await modal.clickBackButton();
        await expect(picker.searchTextbox.locator).toBeVisible();
    });
});

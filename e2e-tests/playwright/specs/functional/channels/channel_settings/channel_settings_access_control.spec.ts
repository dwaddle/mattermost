// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * @objective E2E tests for the Membership Policy tab (access_rules) in Channel Settings Modal
 * @reference MM-67326 — public and private channels can carry ABAC membership policies
 */

import type {Client4} from '@mattermost/client';

import {Api, expect, test, duration, Msg} from '@mattermost/playwright-lib';

import {
    enableABACConfig,
    ensureDepartmentAttribute,
    createParentPolicy,
    assignChannelsToPolicy,
    createPrivateChannel,
    createGroupConstrainedPrivateChannel,
    setUserAttribute,
    addRule,
    createTeamAdmin,
    waitForAttributeViewToInclude,
} from '../team_settings/helpers';

import {closeSettings, openAccessRules, openChannel, openChannelSettings, saveRules} from './access_rules';
import {waitForJobCompletion} from './helpers';

/** Unique CPA value so only users this test sets match the rule (avoids clashing with leftover Engineering users on the server). */
function uniqueDepartmentValue(testId: string): string {
    return `E2E-${testId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Whether the user is a member of the channel: a 404 means not (yet); any other error fails the poll at once. */
async function isChannelMember(client: Client4, channelId: string, userId: string) {
    try {
        await client.getChannelMember(channelId, userId);
        return true;
    } catch (error) {
        if ((error as {status_code?: number}).status_code === 404) {
            return false;
        }
        throw error;
    }
}

test.describe('Channel Settings Modal - Access Control Tab', () => {
    test('MM-67326_c1 Access Control tab visible for admin on private channel with ABAC enabled', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openChannelSettings(app);

        // * Access Control tab is visible
        await expect(settings.tabs.accessRulesTab.locator).toBeVisible();

        await closeSettings(settings);
    });

    test('MM-67326_c2 Access Control tab hidden when ABAC disabled', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();

        // Explicitly disable ABAC. initSetup() resets to the default config which has
        // EnableAttributeBasedAccessControl:true (required by the ABAC test suite baseline),
        // so we must patch it off. Concurrent tests in other files also call enableABACConfig()
        // and may race to re-enable it before this modal opens.
        await adminClient.patchConfig({
            AccessControlSettings: {EnableAttributeBasedAccessControl: false},
        });

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);

        // Disable ABAC once more right before the modal opens to shrink the race window.
        await adminClient.patchConfig({
            AccessControlSettings: {EnableAttributeBasedAccessControl: false},
        });
        const settings = await openChannelSettings(app);

        // * Access Control tab is NOT visible (the Info tab beside it is)
        await expect(settings.tabs.infoTab.locator).toBeVisible();
        await expect(settings.tabs.accessRulesTab.locator).not.toBeVisible();

        await closeSettings(settings);
    });

    test('MM-67326_c3 Membership Policy tab visible for admin on public channel with ABAC enabled', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);

        const channel = await adminClient.createPublicChannel(team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openChannelSettings(app);

        // * Membership Policy tab is visible on public channels when ABAC is enabled (not group-constrained / not default)
        await expect(settings.tabs.accessRulesTab.locator).toBeVisible();

        await closeSettings(settings);
    });

    test('MM-67326_c4 Access Control tab hidden for group-constrained channel', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);

        const channel = await createGroupConstrainedPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openChannelSettings(app);

        // * Access Control tab is NOT visible for group-constrained channel (the Info tab beside it is)
        await expect(settings.tabs.infoTab.locator).toBeVisible();
        await expect(settings.tabs.accessRulesTab.locator).not.toBeVisible();

        await closeSettings(settings);
    });

    test('MM-67326_c5 Auto-add checkbox disabled when no rules defined', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        await ensureDepartmentAttribute(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // * Auto-add checkbox is disabled — no rules or system policies defined
        await expect(settings.accessRules.autoSyncCheckbox.locator).toBeDisabled();

        await closeSettings(settings);
    });

    test('MM-67326_c6 System policy banner visible when parent policy is applied to channel', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        await ensureDepartmentAttribute(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        // # Create a parent (team-level) policy and assign this channel to it
        const policy = await createParentPolicy(adminClient, `Parent Policy ${Date.now()}`);
        await assignChannelsToPolicy(adminClient, policy.id, [channel.id]);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // * System policy banner is visible
        await expect(settings.accessRules.systemPolicies.locator).toBeVisible();

        await closeSettings(settings);
    });

    test('MM-67326_c7 Add attribute rule and save without auto-add', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        // # Admin's Department must satisfy the rule (self-exclusion check)
        await setUserAttribute(adminClient, adminUser.id, 'Department', 'Engineering');

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // # Add an attribute rule: Department == Engineering
        await addRule(settings.accessRules.rules, department, 'Engineering');

        // # Save (auto-add remains off — no confirmation modal for first-time rules with no member changes)
        await saveRules(app, settings);

        // * The save panel goes away — rules were saved
        await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
        await expect(settings.accessRules.rules.row(0).locator).toBeVisible();

        await closeSettings(settings);
    });

    test('MM-67326_c8 Auto-add checkbox becomes enabled after adding an attribute rule', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // * Checkbox starts disabled — no rules or system policies
        const autoAdd = settings.accessRules.autoSyncCheckbox.locator;
        await expect(autoAdd).toBeDisabled();

        // # Add an attribute rule
        await addRule(settings.accessRules.rules, department, 'Engineering');

        // * Checkbox is now enabled
        await expect(autoAdd).toBeEnabled();

        // # Leave without saving (the first close only warns about the unsaved rule)
        await settings.clickCloseButton();
        await settings.clickCloseButton();
        await expect(settings.tabs.infoTab.locator).not.toBeVisible();
    });

    test('MM-67326_c9 Auto-add members: user matching rule is added to channel via sync job', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        const departmentValue = uniqueDepartmentValue('c9');

        // # Admin's Department satisfies the rule (self-exclusion check passes)
        await setUserAttribute(adminClient, adminUser.id, 'Department', departmentValue);

        // # Private channel — admin is the creator and only member
        const channel = await createPrivateChannel(adminClient, team.id);

        // # Target user: in the team, same Department, NOT yet in the channel
        const targetUser = await createTeamAdmin(adminClient, team.id);
        await setUserAttribute(adminClient, targetUser.id, 'Department', departmentValue);

        // Save will run validateExpressionAgainstRequester and calculateMembershipChanges,
        // both of which query the Postgres materialized AttributeView. The enterprise
        // access-control service gates view refreshes to once per ~30s, so the brand-new
        // unique CPA value above is not yet visible to CEL queries. Without this wait,
        // Save hits the self-exclusion modal (admin appears unmatched against the rule
        // they just satisfied via the API) and the confirmation modal never opens.
        await waitForAttributeViewToInclude(adminClient, `user.attributes.Department == "${departmentValue}"`, [
            adminUser.id,
            targetUser.id,
        ]);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // # Add attribute rule (unique value → preview lists only targetUser to add)
        await addRule(settings.accessRules.rules, department, departmentValue);

        // * Unsaved changes must be committed before save; otherwise handleSave can skip the confirmation path
        await expect(settings.savePanel.saveButton.locator).toBeVisible();

        // # Enable auto-add members
        const autoAdd = settings.accessRules.autoSyncCheckbox;
        await expect(autoAdd.locator).toBeEnabled();
        await autoAdd.check();
        await expect(autoAdd.locator).toBeChecked();

        // # Save — confirmation modal appears because targetUser will be added; confirm it ("Save and apply")
        const confirm = await saveRules(app, settings);
        await expect(confirm.confirmButton.locator).toHaveMessage(
            Msg.channel_settings.access_rules.confirm_modal.save_and_apply,
        );
        await confirm.clickConfirmButton();
        await expect(confirm.confirmButton.locator).not.toBeVisible();

        // * Target user becomes a channel member (sync job runs asynchronously)
        await expect
            .poll(() => isChannelMember(adminClient, channel.id, targetUser.id), {
                timeout: duration.half_min,
                message: `${targetUser.username} should be added to the channel`,
            })
            .toBe(true);

        await closeSettings(settings);
    });

    test('MM-67326_c10 Self-exclusion validation prevents saving rule that excludes current user', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        // # Admin is in Engineering — rule requires Sales, so admin would be excluded
        await setUserAttribute(adminClient, adminUser.id, 'Department', 'Engineering');

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // # Add a rule that excludes the admin: Department == Sales
        await addRule(settings.accessRules.rules, department, 'Sales');

        // # Attempt to save
        await saveRules(app, settings);

        // * Self-exclusion error modal appears
        const selfExclusion = settings.accessRules.selfExclusionModal;
        await expect(selfExclusion.locator).toBeVisible();
        await expect(selfExclusion.locator).toContainText('Cannot save access rules');

        // # Dismiss the modal to go back to editing
        await expect(selfExclusion.confirmButton.locator).toHaveText('Back to editing');
        await selfExclusion.clickConfirmButton();
        await expect(selfExclusion.locator).not.toBeVisible();

        // * Still editing: the unsaved rule is there to fix
        await expect(settings.savePanel.saveButton.locator).toBeVisible();

        await settings.clickCloseButton();
        await settings.clickCloseButton();
        await expect(settings.tabs.infoTab.locator).not.toBeVisible();
    });

    test('MM-67326_c11 Unsaved changes — closing modal without saving keeps it open on first click', async ({pw}) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // # Add a rule to create unsaved changes
        await addRule(settings.accessRules.rules, department, 'Engineering');

        // * The save panel is visible — there are unsaved changes
        await expect(settings.savePanel.saveButton.locator).toBeVisible();

        // # First close click — modal stays open (unsaved-changes two-step close)
        await settings.clickCloseButton();
        await expect(settings.tabs.infoTab.locator).toBeVisible();

        // # Second click — modal closes
        await settings.clickCloseButton();
        await expect(settings.tabs.infoTab.locator).not.toBeVisible();
    });

    test('MM-67326_c12 View users — Restricted tab shows member count and user when rule removes a channel member', async ({
        pw,
    }) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        // # Admin satisfies the rule
        await setUserAttribute(adminClient, adminUser.id, 'Department', 'Engineering');

        const channel = await createPrivateChannel(adminClient, team.id);

        // # Add a second member who will NOT satisfy the rule (no Department attribute)
        const memberToRemove = await createTeamAdmin(adminClient, team.id);
        await adminClient.addToChannel(memberToRemove.id, channel.id);
        // memberToRemove has no Department set → will not match "Department == Engineering"

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // # Add rule: Department == Engineering (memberToRemove doesn't match → will be removed)
        await addRule(settings.accessRules.rules, department, 'Engineering');

        // # Click Save — confirmation modal appears because memberToRemove will be removed
        const confirm = await saveRules(app, settings);

        // * Summary message shows 1 member removed
        await expect(confirm.messageText.locator).toContainText('remove 1 current channel member');

        // # Click "View users" to open the detailed user list
        await confirm.clickViewUsersButton();

        // * "Restricted (1)" tab is visible — one member will be removed
        await expect(confirm.restrictedButton.locator).toHaveText('Restricted (1)');

        // # Switch to the Restricted tab
        await confirm.clickRestrictedButton();

        // * memberToRemove's username appears in the restricted list
        await expect(confirm.users.user(memberToRemove).locator).toContainText(memberToRemove.username);

        // # Cancel — don't actually apply
        await confirm.clickCancelButton();
        await expect(confirm.cancelButton.locator).not.toBeVisible();

        await settings.clickCloseButton();
        await settings.clickCloseButton();
        await expect(settings.tabs.infoTab.locator).not.toBeVisible();
    });

    test('MM-67326_c13 View users — Allowed tab shows member count and user when auto-add brings new members', async ({
        pw,
    }) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        const departmentValue = uniqueDepartmentValue('c13');

        // # Admin satisfies the rule
        await setUserAttribute(adminClient, adminUser.id, 'Department', departmentValue);

        // # Private channel — admin is the only member
        const channel = await createPrivateChannel(adminClient, team.id);

        // # Target user: in the team, same Department, NOT yet in the channel
        const memberToAdd = await createTeamAdmin(adminClient, team.id);
        await setUserAttribute(adminClient, memberToAdd.id, 'Department', departmentValue);

        // See c9: wait for the materialized AttributeView to surface admin and
        // memberToAdd as matching the freshly-written CPA value before clicking Save.
        await waitForAttributeViewToInclude(adminClient, `user.attributes.Department == "${departmentValue}"`, [
            adminUser.id,
            memberToAdd.id,
        ]);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // # Add rule (unique value → only memberToAdd appears in "to add" with this server data)
        await addRule(settings.accessRules.rules, department, departmentValue);
        await expect(settings.savePanel.saveButton.locator).toBeVisible();

        // # Enable auto-add so memberToAdd appears in the "to add" list
        const autoAdd = settings.accessRules.autoSyncCheckbox;
        await expect(autoAdd.locator).toBeEnabled();
        await autoAdd.check();
        await expect(autoAdd.locator).toBeChecked();

        // # Click Save — confirmation modal appears because memberToAdd will be added
        const confirm = await saveRules(app, settings);

        // * Summary shows 0 members removed (no one in this channel lacks the attribute)
        await expect(confirm.messageText.locator).toContainText('remove 0 current channel members');

        // # Click "View users" to open the detailed user list
        await confirm.clickViewUsersButton();

        // * Allowed tab is visible with at least one user (memberToAdd)
        await expect(confirm.allowedButton.locator).toContainText('Allowed');

        // # The Allowed tab is active by default — verify memberToAdd's username is shown (unique Dept avoids other matches)
        await expect(confirm.users.user(memberToAdd).locator).toContainText(memberToAdd.username);

        // # Cancel — don't actually apply
        await confirm.clickCancelButton();
        await expect(confirm.cancelButton.locator).not.toBeVisible();

        await settings.clickCloseButton();
        await settings.clickCloseButton();
        await expect(settings.tabs.infoTab.locator).not.toBeVisible();
    });

    test('MM-67326_c14 Applying access rules removes non-matching member from channel and RHS members', async ({
        pw,
    }) => {
        await pw.skipIfNoLicense();
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        const department = await ensureDepartmentAttribute(adminClient);

        const departmentValue = uniqueDepartmentValue('c14');

        // # Admin satisfies the rule
        await setUserAttribute(adminClient, adminUser.id, 'Department', departmentValue);

        const channel = await createPrivateChannel(adminClient, team.id);

        // # Existing member does not satisfy the rule and should be removed when it is applied
        const memberToRemove = await createTeamAdmin(adminClient, team.id);
        await setUserAttribute(adminClient, memberToRemove.id, 'Department', `${departmentValue}-other`);
        await adminClient.addToChannel(memberToRemove.id, channel.id);

        // See c9: wait for the materialized AttributeView to surface the admin's
        // freshly-written CPA value before clicking Save.
        await waitForAttributeViewToInclude(adminClient, `user.attributes.Department == "${departmentValue}"`, [
            adminUser.id,
        ]);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openAccessRules(app);

        // # Add rule (unique value -> only admin remains allowed in the private channel)
        await addRule(settings.accessRules.rules, department, departmentValue);

        // # Click Save - confirmation modal appears because memberToRemove will be removed
        const confirm = await saveRules(app, settings);

        // * Summary message shows 1 member removed
        await expect(confirm.messageText.locator).toContainText('remove 1 current channel member');

        // # Confirm ("Save", auto-add being off) and wait for the access-control sync job that applies the removal
        await expect(confirm.confirmButton.locator).toHaveMessage(Msg.channel_settings.access_rules.confirm_modal.save);
        const syncJob = await confirm.confirmButton.commit({wait: Api.CreateJob});
        await expect(confirm.confirmButton.locator).not.toBeVisible();
        const syncJobId = syncJob.id;
        const finished = await waitForJobCompletion(adminClient, syncJobId, {timeoutMs: 90_000});
        expect(finished.status, `sync job did not succeed: ${JSON.stringify(finished)}`).toBe('success');

        // * memberToRemove is no longer a channel member
        await expect
            .poll(() => isChannelMember(adminClient, channel.id, memberToRemove.id), {
                timeout: duration.half_min,
                intervals: [500, 1000, 1000, 2000],
                message: `${memberToRemove.username} should be removed from the channel`,
            })
            .toBe(false);

        await closeSettings(settings);

        // * The ABAC removal system message is the last post in the channel
        const {postList} = app.center;
        const lastPost = async () => postList.post({id: (await postList.postKeys()).at(-1)!}).locator.textContent();
        await expect.poll(lastPost, {timeout: duration.half_min}).toContain('was removed from the channel');
        await expect.poll(lastPost).toContain(memberToRemove.username);

        // # Open channel members RHS from the channel menu
        await (await app.channelHeader.clickOpenMenuButton()).clickMembersMenuItem();

        // * Admin remains in the RHS members list, and removed member is absent
        const members = app.rhs.channelMembers;
        await expect(members.member(adminUser).locator).toBeVisible();
        await expect(members.member(memberToRemove).locator).not.toBeVisible();
    });
});

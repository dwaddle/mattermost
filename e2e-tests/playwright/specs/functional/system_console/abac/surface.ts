// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {UserPropertyField} from '@mattermost/types/properties_user';
import type {UserProfile} from '@mattermost/types/users';

import {
    Api,
    expect,
    generated,
    type AdminOperator,
    type AdminPermission,
    type AdminRole,
    type App,
} from '@mattermost/playwright-lib';

import type {CpaFieldsMap} from '../../channels/custom_profile_attributes/helpers';
import {waitForAttributeViewToInclude} from '../../channels/team_settings/helpers';

/**
 * Attribute-based access on the generated page objects: the ABAC setting, the membership policy list (rows by policy
 * id), the policy editor (its name, the rules table with rows by position and their attribute, operator and value
 * menus, the CEL editor, the channels and their auto-add, Save and its apply dialog) and the access test dialog.
 */

const SYSTEM_ATTRIBUTES = `${generated.AdminConsolePage.path()}/system_attributes`;
export const ABAC_SETTINGS_PATH = `${SYSTEM_ATTRIBUTES}/attribute_based_access_control`;
export const MEMBERSHIP_POLICIES_PATH = `${SYSTEM_ATTRIBUTES}/membership_policies`;
export const PERMISSION_POLICIES_PATH = `${SYSTEM_ATTRIBUTES}/permission_policies`;

export type Rule = {field: {id: string}; operator?: AdminOperator; value: string};

/** The attribute field named `name` among the ones a test set up. */
export function fieldNamed(fields: CpaFieldsMap, name: string): UserPropertyField {
    const field = Object.values(fields).find((f): f is UserPropertyField => !(f instanceof Set) && f.name === name);
    if (!field) {
        throw new Error(`No attribute field named ${name}`);
    }
    return field;
}

/** Turns attribute-based access on (or off) on its System Console page, saving when that changes it. */
export async function setAbacEnabled(app: App, enabled: boolean) {
    await app.page.goto(ABAC_SETTINGS_PATH);
    const setting = app.admin.setting('AccessControlSettings.EnableAttributeBasedAccessControl');
    const radio = enabled ? setting.trueRadio : setting.falseRadio;
    await expect(radio.locator).toBeVisible();
    if (!(await radio.isChecked())) {
        await radio.check();
        await app.admin.saveButton.click();
        await expect(app.admin.saveButton.locator).toBeSaved();
    }
}

/** Opens System Console > Membership Policies, waiting for its list. */
export async function openMembershipPolicies(app: App) {
    await app.page.goto(MEMBERSHIP_POLICIES_PATH);
    const {policies} = app.admin.accessControl;
    await expect(policies.searchTextbox.locator).toBeVisible();
    return policies;
}

/** Opens a membership policy's editor. */
export async function openPolicy(app: App, policyId: string) {
    await app.page.goto(`${MEMBERSHIP_POLICIES_PATH}/edit_policy/${policyId}`);
    const {policy} = app.admin.accessControl;
    await expect(policy.editPolicy.name.valueTextbox.locator).toBeVisible();
    return policy;
}

/** Fills a rule row's value: a free-text value inline, or one typed into the value menu (Enter adds it to a list). */
export async function fillRuleValue(row: generated.RulesRow, value: string) {
    await expect(row.valueTextbox.locator.or(row.valueButton.locator)).toBeVisible();
    if (await row.valueTextbox.locator.isVisible()) {
        await row.fillValueTextbox(value);
        await row.valueTextbox.locator.press('Tab');
        await expect(row.valueTextbox.locator).toHaveValue(value);
        return;
    }
    const menu = await row.clickValueButton();
    const input = menu.valueTextbox.locator.or(menu.filterTextbox.locator);
    await input.fill(value);

    // Tab commits a single value and closes the menu; a list takes each value on Enter, then Tab closes it (the
    // list's filter box keeps every other key, Escape included, from reaching the menu)
    if (await menu.valueTextbox.locator.isVisible()) {
        await input.press('Tab');
    } else {
        await input.press('Enter');
        await input.press('Tab');
    }
    await expect(input).not.toBeVisible();
}

/** Adds a rule to a rules table: its attribute, its operator (when not the default) and its value. */
export async function addRule(rules: generated.Rules, rule: Rule) {
    const row = rules.row((await rules.rowKeys()).length);
    await rules.clickAddButton();
    await row.attributeMenu.attribute(rule.field).click();
    if (rule.operator) {
        await row.operatorButton.click();
        await row.operatorMenu.operator(rule.operator).clickMenuItemRadio();
        await expect(row.operatorMenu.operator(rule.operator).locator).not.toBeVisible();
    }
    await fillRuleValue(row, rule.value);
    return row;
}

/** Picks channels in the channel selector dialog, by name then by id, and adds them. */
export async function addChannels(
    app: App,
    policy: generated.AdminAccessControlPolicy,
    channels: Array<{id: string; name: string}>,
) {
    await policy.clickAddChannelsButton();
    const {channels: picker} = app.channelSelectorModal;
    for (const channel of channels) {
        await picker.searchCombobox.locator.fill(channel.name);
        await picker.results.channel(channel).locator.click();
    }
    await picker.clickSaveButton();
    await expect(picker.saveButton.locator).not.toBeVisible();
    for (const channel of channels) {
        await expect(policy.channels.row(channel.id).locator).toBeVisible();
    }
}

/**
 * Saves the policy editor. With channels assigned, Save asks to apply the policy first; confirming starts a sync job,
 * whose id this returns (null when there were no channels, so no job).
 */
export async function savePolicy(app: App, policy: generated.AdminAccessControlPolicy): Promise<string | null> {
    const hasChannels = (await policy.channels.rowItems.count()) > 0;
    await app.admin.saveButton.click();
    if (!hasChannels) {
        await expect(app.page).toHaveURL(new RegExp(`${MEMBERSHIP_POLICIES_PATH}$`));
        return null;
    }
    const {confirmModal} = policy;

    // applying it now is what starts the sync
    await expect(confirmModal.enforceCheckbox.locator).toBeChecked();
    // the scanner doesn't see the dialog start the sync job (it is called through the editor's save handler)
    const job = await confirmModal.confirmButton.commit({wait: Api.CreateJob, unlisted: true});
    await expect(app.page).toHaveURL(new RegExp(`${MEMBERSHIP_POLICIES_PATH}$`));
    return job.id;
}

export type NewPolicy = {
    name: string;

    // Rules in the table editor, or an expression in the CEL editor
    rules?: Rule[];
    cel?: string;
    channels?: Array<{id: string; name: string}>;

    // Auto-add members to every channel (the channel list's header checkbox)
    autoAdd?: boolean;
};

/** Creates a membership policy in the table editor; returns its sync job's id (null with no channels). */
export async function createMembershipPolicy(app: App, options: NewPolicy) {
    const policies = await openMembershipPolicies(app);
    await policies.clickAddButton();
    const {policy} = app.admin.accessControl;
    await policy.editPolicy.name.fillValueTextbox(options.name);
    for (const rule of options.rules ?? []) {
        await addRule(policy.rules, rule);
    }
    if (options.cel) {
        await setCelExpression(app, policy, options.cel);
    }
    if (options.channels?.length) {
        await addChannels(app, policy, options.channels);
        if (options.autoAdd) {
            await policy.channels.autoAddAllCheckbox.check();
        }
    }
    return savePolicy(app, policy);
}

/** A policy editor with a table and a CEL editor: membership policies' and permission policies'. */
type PolicyEditor = generated.AdminAccessControlPolicy | generated.AdminPermissionPolicy;

/** Switches a policy editor to its CEL editor and types an expression, waiting for it to validate. */
export async function setCelExpression(app: App, policy: PolicyEditor, expression: string) {
    // the switch waits for the editor to load the attributes
    await expect(policy.switchModeButton.locator).toBeEnabled({timeout: 60_000});
    await policy.switchModeButton.click();
    await policy.cel.input.locator.click();
    await app.page.keyboard.press('ControlOrMeta+a');

    // Monaco closes brackets and quotes as they open, and types over the closing ones; typed at full
    // speed it can drop the overtyped quote, so pace the keys as master's helper did
    await app.page.keyboard.type(expression, {delay: 10});
    await expect(policy.cel.statusText.locator).toHaveText('Valid');
}

/**
 * Opens a policy's access test (the table editor's or the CEL editor's, whichever it shows) and checks who it lists:
 * every user expected, none of the others.
 */
export async function expectAccessTest(
    app: App,
    policy: PolicyEditor,
    {client, matching = [], notMatching = []}: {client: Client4; matching?: UserProfile[]; notMatching?: UserProfile[]},
) {
    const testButton = policy.rules.testButton.locator.or(policy.cel.testButton.locator);
    await expect(testButton).toBeEnabled();

    // the dialog lists who its expression matches as soon as it opens
    const listed = app.page.waitForRequest((r) => r.url().includes('/access_control_policies/cel/test'));
    await testButton.click();
    const {expression} = (await listed).postDataJSON() as {expression: string};
    const {users} = app.policyTestModal;
    await expect(users.searchTextbox.locator).toBeVisible();

    // The test reads the server's attribute view, which refreshes on its own schedule and so can trail users just
    // given attributes (by design): wait until it lists them, then one search finds each
    if (matching.length) {
        await waitForAttributeViewToInclude(
            client,
            expression,
            matching.map((user) => user.id),
        );
    }
    for (const user of matching) {
        await users.fillSearchTextbox(user.username);
        await expect(users.user(user).locator).toContainText(`@${user.username}`);
    }
    for (const user of notMatching) {
        await users.fillSearchTextbox(user.username);
        await expect(users.noUsersText.locator).toBeVisible();
        await expect(users.user(user).locator).toHaveCount(0);
    }
    await app.policyTestModal.clickCloseButton();
    await expect(users.searchTextbox.locator).not.toBeVisible();
}

/** Waits for a sync job to succeed (failing at once if it fails). */
export async function waitForSyncJob(client: Client4, jobId: string, timeout = 90_000) {
    await expect
        .poll(
            async () => {
                const job = await client.getJob(jobId);
                if (['error', 'canceled', 'cancel_requested'].includes(job.status)) {
                    throw new Error(`Sync job ${jobId} failed: ${job.status}`);
                }
                return job.status;
            },
            {timeout, intervals: [500, 1000, 2000], message: `sync job ${jobId} did not succeed`},
        )
        .toBe('success');
}

/** The id of the membership policy named `name` (exactly), once search lists it. */
export async function policyIdByName(client: Client4, name: string): Promise<string> {
    let id = '';
    await expect
        .poll(
            async () => {
                const result = await client.searchAccessControlPolicies(name, 'parent', '', 100);
                id = (result?.policies ?? []).find((p) => p.name === name)?.id ?? '';
                return id;
            },
            {timeout: 30_000, message: `policy ${name} not found`},
        )
        .not.toBe('');
    return id;
}

/** Runs the membership policies' sync job from their page; returns the job's id. */
export async function runSyncJob(app: App): Promise<string> {
    await openMembershipPolicies(app);
    const job = await app.admin.accessControl.runSyncButton.commit({wait: Api.CreateJob});
    return job.id;
}

/** Opens System Console > Permission Policies, waiting for its list. */
export async function openPermissionPolicies(app: App) {
    await app.page.goto(PERMISSION_POLICIES_PATH);
    const list = app.admin.permissionPolicies;
    await expect(list.addButton.locator).toBeVisible();
    return list;
}

export type NewPermissionPolicy = {
    name: string;
    cel: string;
    permissions: AdminPermission[];

    // Who it applies to; members (system_user) when left out
    role?: AdminRole;
};

/** Creates a permission policy (its rule in the CEL editor), returning to the list. */
export async function createPermissionPolicy(app: App, options: NewPermissionPolicy) {
    const list = await openPermissionPolicies(app);
    await list.clickAddButton();
    await list.edit.name.fillValueTextbox(options.name);
    const policy = app.admin.permissionPolicy;
    if (options.role) {
        await (await policy.clickRoleButton()).role(options.role).click();
        await expect(policy.roleMenu.role(options.role).locator).not.toBeVisible();
    }
    await setCelExpression(app, policy, options.cel);
    for (const permission of options.permissions) {
        await (await policy.clickAddPermissionButton()).permission(permission).click();
        await expect(policy.permissionMenu.permission(permission).locator).not.toBeVisible();
    }
    await app.admin.saveButton.click();
    await expect(app.page).toHaveURL(new RegExp(`${PERMISSION_POLICIES_PATH}$`));
    return list;
}

/** The id of the permission policy named `name` (exactly), once search lists it. */
export async function permissionPolicyIdByName(client: Client4, name: string): Promise<string> {
    let id = '';
    await expect
        .poll(
            async () => {
                const result = await client.searchPermissionPolicies(name, '', 100);
                id = (result?.policies ?? []).find((p) => p.name === name)?.id ?? '';
                return id;
            },
            {timeout: 30_000, message: `permission policy ${name} not found`},
        )
        .not.toBe('');
    return id;
}

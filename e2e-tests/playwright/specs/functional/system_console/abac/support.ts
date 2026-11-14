// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Shared ABAC test helper functions
 * These functions are used across multiple ABAC test files to reduce duplication
 */

import {expect, type Page} from '@playwright/test';
import type {Client4} from '@mattermost/client';
import type {UserProfile} from '@mattermost/types/users';
import type {Channel} from '@mattermost/types/channels';
import type {UserPropertyField} from '@mattermost/types/properties_user';

import {duration, getRandomId, newTestPassword} from '@mattermost/playwright-lib';

import type {CustomProfileAttribute} from '../../channels/custom_profile_attributes/helpers';
import {setupCustomProfileAttributeValuesForUser} from '../../channels/custom_profile_attributes/helpers';

import {permissionPolicyIdByName} from './surface';

// The access rule table's controls, in whichever rule table is on the page: every table is `<area>.rules`, each rule
// `<area>.rules.row:<n>` with these parts.
export const RULE_ATTRIBUTE_BUTTON = /\.rules\.row\.attribute--button$/;
export const RULE_OPERATOR_BUTTON = /\.rules\.row\.operator--button$/;
export const RULE_VALUE_BUTTON = /\.rules\.row\.value--button$/;
export const RULE_VALUE_TEXTBOX = /\.rules\.row\.value--textbox$/;
export const RULE_VALUE_CONTROL = /\.rules\.row\.value--(button|textbox)$/;

/**
 * Create user attribute field via API
 */
export async function createUserAttributeField(client: Client4, name: string, type: string = 'text'): Promise<any> {
    const url = `${client.getBaseRoute()}/custom_profile_attributes/fields`;
    const field = {
        name,
        type,
        attrs: {
            managed: 'admin', // Admin-managed attribute
            visibility: 'when_set',
        },
    };

    const response = await (client as any).doFetch(url, {
        method: 'POST',
        body: JSON.stringify(field),
    });
    return response;
}

/**
 * Membership policy UI loads CPA fields from GET .../cel/autocomplete/fields.
 * Fail fast here instead of timing out on disabled "Test access rule" when fields lag.
 */
export async function assertAccessControlAutocompleteContains(
    adminClient: Client4,
    fieldNames: string[],
): Promise<void> {
    const fields = await adminClient.getAccessControlFields('', 100);
    const names = new Set(fields.map((f) => f.name));
    for (const n of fieldNames) {
        expect(
            names.has(n),
            `ABAC autocomplete API missing "${n}" — policy editor will treat attributes as unusable. Got: ${[...names].join(', ')}`,
        ).toBe(true);
    }
}

export async function enableUserManagedAttributes(client: Client4): Promise<void> {
    try {
        await client.patchConfig({
            AccessControlSettings: {
                EnableUserManagedAttributes: true,
            },
        } as any);
    } catch {
        // console.warn('Failed to enable EnableUserManagedAttributes:', _error.message || String(_error));
    }
}

/**
 * Ensure required user attributes exist via API
 */
export async function ensureUserAttributes(client: Client4, attributeNames?: string[]): Promise<void> {
    const attributesToCreate = attributeNames || ['Department'];
    await enableUserManagedAttributes(client);

    let existingAttributes: any[] = [];
    try {
        existingAttributes = await (client as any).doFetch(
            `${client.getBaseRoute()}/custom_profile_attributes/fields`,
            {method: 'GET'},
        );
    } catch {
        // console.warn(`Failed to fetch existing attributes:`, _error.message);
    }

    for (const attrName of attributesToCreate) {
        const exists = existingAttributes.some((attr: any) => attr.name === attrName);

        if (!exists) {
            try {
                await createUserAttributeField(client, attrName);
            } catch {
                throw new Error(`Cannot proceed: Attribute "${attrName}" does not exist and could not be created`);
            }
        }
    }

    // The policy editor lists attributes from the access control fields, which can trail a new field: wait until they
    // list every attribute. The endpoint isn't gated on the attribute-based access setting, so an error is a real
    // failure (expect.poll retries it and reports the last one).
    await expect
        .poll(async () => {
            const names = new Set((await client.getAccessControlFields('', 100)).map((f) => f.name));
            return attributesToCreate.every((name) => names.has(name));
        })
        .toBe(true);
}

/**
 * Resolve a user (CPA) attribute field by name. Attribute-picker menu items are
 * keyed by field id (`#attribute-<id>`), so callers targeting a specific user
 * attribute must look up its id rather than hardcoding its name.
 */
export async function getUserAttributeFieldByName(client: Client4, name: string): Promise<UserPropertyField> {
    const fields = await client.getCustomProfileAttributeFields();
    const field = fields.find((f) => f.name === name);
    if (!field) {
        throw new Error(`User attribute "${name}" not found`);
    }
    return field;
}

/**
 * ABAC-specific helper to create user and set attributes using proper CPA helpers
 */
export async function createUserForABAC(
    adminClient: Client4,
    attributeFieldsMap: Record<string, UserPropertyField>,
    attributes: CustomProfileAttribute[],
): Promise<UserProfile> {
    // Username must start with a letter
    const username = `user${getRandomId()}`.toLowerCase();
    const password = newTestPassword();

    // Create the user
    const user = await adminClient.createUser(
        {
            email: `${username}@example.com`,
            username,
            password,
        } as any,
        '',
        '',
    );

    await setupCustomProfileAttributeValuesForUser(adminClient, attributes, attributeFieldsMap, user.id);

    // Attach the password back to the user object so pw.testBrowser.login() can authenticate.
    // The API response does not include the password field.
    (user as any).password = password;

    return user;
}

/**
 * Create private channel with unique ID for ABAC testing
 */
export async function createPrivateChannelForABAC(client: Client4, teamId: string): Promise<Channel> {
    // Generate unique ID - lowercase alphanumeric only
    const uniqueId = Date.now().toString(36) + Math.random().toString(36).substring(2, 7);
    const channel = await client.createChannel({
        team_id: teamId,
        name: `abac${uniqueId}`,
        display_name: `ABAC-${uniqueId}`,
        type: 'P', // Private channel
    });
    return channel;
}

/**
 * Activate a policy (set active: true)
 */
export async function activatePolicy(client: Client4, policyId: string): Promise<void> {
    const url = `${client.getBaseRoute()}/access_control_policies/${policyId}/activate?active=true`;
    await (client as any).doFetch(url, {method: 'GET'});
}

/**
 * Wait for a policy-specific access_control_sync job to complete.
 *
 * Queries the server API directly with a policy_id filter so it is race-safe
 * under PW_WORKERS >= 2: another shard's sync job cannot be mistaken for ours.
 *
 * Uses `expect.poll` with 500 ms intervals and a 30 s timeout so jobs that are
 * briefly delayed in the queue do not cause spurious failures.
 */
export async function waitForPolicySyncJob(client: Client4, policyId: string, timeoutMs = 60_000): Promise<void> {
    await expect
        .poll(
            async () => {
                try {
                    const jobs: any[] = await (client as any).doFetch(
                        `${client.getBaseRoute()}/jobs/type/access_control_sync?policy_id=${encodeURIComponent(policyId)}&page=0&per_page=5`,
                        {method: 'GET'},
                    );
                    if (!Array.isArray(jobs) || jobs.length === 0) {
                        return 'pending';
                    }
                    // Sort by create_at descending so jobs[0] is the latest.
                    // The API does not guarantee order, so without this sort
                    // jobs[0] can be an older already-successful job, causing
                    // us to return early before the newest sync has finished.
                    jobs.sort((a: any, b: any) => (b.create_at ?? 0) - (a.create_at ?? 0));
                    const status: string = jobs[0].status ?? 'pending';
                    if (status === 'error' || status === 'canceled' || status === 'cancel_requested') {
                        throw new Error(`Policy sync job failed: ${status}`);
                    }
                    return status;
                } catch (err) {
                    if (err instanceof Error && err.message.startsWith('Policy sync job')) {
                        throw err;
                    }
                    return 'pending'; // network hiccup — keep polling
                }
            },
            {
                timeout: timeoutMs,
                intervals: [500, 500, 500, 1000, 1000, 2000],
                message: `Policy sync job for ${policyId} did not reach success within ${timeoutMs / 1000} s`,
            },
        )
        .toBe('success');
}

/**
 * Rewrite the CEL expression on every rule of an existing permission policy.
 *
 * API rather than the CEL editor: SavePolicy publishes permission_policy_updated whichever
 * surface issued the change, and driving the admin UI would test the editor instead.
 *
 * Revoke by narrowing the expression, never by removing an action. An action no rule grants is
 * implicitly allowed, so dropping one widens access instead of withdrawing it.
 */
export async function updatePermissionPolicyExpression(
    client: Client4,
    policyName: string,
    expression: string,
): Promise<void> {
    const policyId = await permissionPolicyIdByName(client, policyName);

    const policy = await (client as any).doFetch(`${client.getBaseRoute()}/access_control_policies/${policyId}`, {
        method: 'GET',
    });

    policy.rules = (policy.rules || []).map((rule: any) => ({...rule, expression}));

    await (client as any).doFetch(`${client.getBaseRoute()}/access_control_policies`, {
        method: 'PUT',
        body: JSON.stringify(policy),
    });
}

/**
 * Delete a permission policy by name via the REST API: searches for it by name, then deletes it by id.
 * Safe to call even if the policy does not exist (no-op).
 */
export async function deletePermissionPolicyByName(client: Client4, policyName: string): Promise<void> {
    try {
        const searchUrl = `${client.getBaseRoute()}/access_control_policies/search`;
        const result = await (client as any).doFetch(searchUrl, {
            method: 'POST',
            body: JSON.stringify({term: policyName, type: 'permission'}),
        });

        // Response may be the array directly or wrapped in {policies: [...]}
        const policies: any[] = Array.isArray(result) ? result : result?.policies || [];
        const match = policies.find((p: any) => p.name === policyName && p.type === 'permission');

        if (match?.id) {
            await (client as any).doFetch(`${client.getBaseRoute()}/access_control_policies/${match.id}`, {
                method: 'DELETE',
            });
        }
    } catch {
        // Policy may not exist or deletion may have already occurred — safe to ignore
    }
}

/**
 * Delete ALL permission policies in the system, so stale policies from previous runs don't interfere with the
 * "no-policy = implicit allow" assertions. Uses the typed searchPermissionPolicies client method which sends the correct
 * cursor + limit payload. Falls back to a doFetch approach if needed.
 * Safe to call when no policies exist.
 */
export async function cleanupAllPermissionPolicies(client: Client4): Promise<void> {
    let cursor = '';
    const limit = 100;

    while (true) {
        let policies: any[] = [];
        try {
            // Use the typed method (available in the rebuilt @mattermost/client dist)
            const result = await (client as any).searchPermissionPolicies('', cursor, limit);
            policies = result?.policies || [];
        } catch {
            // Typed method unavailable — fall back to raw doFetch with explicit limit
            try {
                const searchUrl = `${client.getBaseRoute()}/access_control_policies/search`;
                const result = await (client as any).doFetch(searchUrl, {
                    method: 'POST',
                    body: JSON.stringify({term: '', type: 'permission', cursor: {id: cursor}, limit}),
                });
                policies = Array.isArray(result) ? result : result?.policies || [];
            } catch {
                break;
            }
        }

        if (policies.length === 0) {
            break;
        }

        await Promise.all(
            policies.map(async (policy: any) => {
                if (policy?.id) {
                    try {
                        await (client as any).doFetch(`${client.getBaseRoute()}/access_control_policies/${policy.id}`, {
                            method: 'DELETE',
                        });
                    } catch {
                        // ignore individual delete failures
                    }
                }
            }),
        );

        if (policies.length < limit) {
            break;
        }

        cursor = policies[policies.length - 1].id;
    }
}

export interface TestAccessRuleResult {
    totalMatches: number;
    matchingUsernames: string[];
    expectedUsersMatch: boolean;
    unexpectedUsersMatch: boolean;
}

// Master's permission policy bot scope and team advanced rules specs drive these on the page itself.
/**
 * Test Access Rule Helper
 * Clicks the "Test access rule" button and verifies which users match the policy
 */
export async function testAccessRule(
    page: Page,
    options: {
        expectedMatchingUsers?: string[]; // usernames that SHOULD match
        expectedNonMatchingUsers?: string[]; // usernames that should NOT match
        searchForUser?: string; // optional: search for a specific user in the modal
    } = {},
): Promise<TestAccessRuleResult> {
    const testButton = page.getByRole('button', {name: /test access rule/i});
    await expect(testButton).toBeVisible();
    await expect(testButton).toBeEnabled({timeout: duration.half_min});
    await testButton.click();

    const modal = page.locator('[role="dialog"], .modal').filter({hasText: 'Access Rule Test Results'});
    await modal.waitFor({state: 'visible', timeout: duration.ten_sec});

    await page.waitForTimeout(1000);
    let totalMatches = 0;

    const countText = await modal
        .locator('text=/\\d+.*(?:members|total|match)/i')
        .first()
        .textContent({timeout: duration.ten_sec})
        .catch(() => null);

    if (countText) {
        const totalMatch = countText.match(/of\s*(\d+)\s*total/i);
        if (totalMatch) {
            totalMatches = parseInt(totalMatch[1], 10);
        } else {
            const matchesMatch = countText.match(/(\d+)\s*match/i);
            if (matchesMatch) {
                totalMatches = parseInt(matchesMatch[1], 10);
            }
        }
    }

    const matchingUsernames: string[] = [];
    const userButtons = modal.locator('.more-modal__name button, [class*="more-modal__name"] button');
    const count = await userButtons.count();

    for (let i = 0; i < count; i++) {
        const username = await userButtons.nth(i).textContent();
        if (username) {
            const cleanUsername = username.replace('@', '').trim();
            matchingUsernames.push(cleanUsername);
        }
    }

    if (options.searchForUser) {
        const searchInput = modal.locator('input[placeholder*="Search" i]').first();
        if (await searchInput.isVisible({timeout: duration.two_sec})) {
            await searchInput.fill(options.searchForUser);
            await page.waitForTimeout(500);
        }
    }

    let expectedUsersMatch = true;
    if (options.expectedMatchingUsers && options.expectedMatchingUsers.length > 0) {
        for (const expectedUser of options.expectedMatchingUsers) {
            const searchInput = modal.locator('input[placeholder*="Search" i]').first();
            if (await searchInput.isVisible({timeout: duration.two_sec})) {
                await searchInput.fill(expectedUser);
                await page.waitForTimeout(1000);

                const userInResults = modal.locator(`text=@${expectedUser}`).first();
                const isVisible = await userInResults.isVisible({timeout: duration.ten_sec});

                if (!isVisible) {
                    // console.error(`✗ Expected user "${expectedUser}" NOT found in matching results`);
                    expectedUsersMatch = false;
                }

                await searchInput.fill('');
                await page.waitForTimeout(500);
            }
        }
    }

    let unexpectedUsersMatch = false;
    if (options.expectedNonMatchingUsers && options.expectedNonMatchingUsers.length > 0) {
        for (const unexpectedUser of options.expectedNonMatchingUsers) {
            const searchInput = modal.locator('input[placeholder*="Search" i]').first();
            if (await searchInput.isVisible({timeout: duration.two_sec})) {
                await searchInput.fill(unexpectedUser);
                await page.waitForTimeout(500);

                const userInResults = modal.locator(`text=@${unexpectedUser}`).first();
                const isVisible = await userInResults.isVisible({timeout: duration.two_sec});

                if (isVisible) {
                    // console.error(`✗ Non-matching user "${unexpectedUser}" FOUND in results (should NOT be there)`);
                    unexpectedUsersMatch = true;
                }

                await searchInput.fill('');
                await page.waitForTimeout(300);
            }
        }
    }

    const closeButton = modal.locator('button[aria-label*="Close" i], button:has-text("×"), .close').first();
    if (await closeButton.isVisible({timeout: duration.one_sec})) {
        await closeButton.click();
        await page.waitForTimeout(500);
    } else {
        await page.keyboard.press('Escape');
        await page.waitForTimeout(500);
    }

    return {
        totalMatches,
        matchingUsernames,
        expectedUsersMatch,
        unexpectedUsersMatch,
    };
}

/**
 * Get policy ID by name using search API (with retry)
 */
export async function getPolicyIdByName(
    client: Client4,
    policyName: string,
    retries: number = 3,
): Promise<string | null> {
    const searchUrl = `${client.getBaseRoute()}/access_control_policies/search`;

    // Extract the base name without the random ID suffix for search
    // e.g., "Auto-Add Policy 48b0141" -> "Auto-Add Policy"
    const baseNameMatch = policyName.match(/^(.+?)\s+[a-z0-9]+$/i);
    const searchTerm = baseNameMatch ? baseNameMatch[1] : policyName;

    for (let attempt = 1; attempt <= retries; attempt++) {
        try {
            // Use the search API
            const result = await (client as any).doFetch(searchUrl, {
                method: 'POST',
                body: JSON.stringify({
                    term: searchTerm,
                }),
            });

            const policies = result?.policies || [];

            if (policies.length > 0) {
                // Try exact match first
                let policy = policies.find((p: any) => p.name === policyName);

                // If no exact match, try partial match
                if (!policy) {
                    policy = policies.find((p: any) => p.name.includes(searchTerm));
                }

                // If still no match, just take the first result
                if (!policy && policies.length > 0) {
                    policy = policies[0];
                }

                if (policy) {
                    return policy.id;
                }
                // Wait before retrying
                if (attempt < retries) {
                    await new Promise((resolve) => setTimeout(resolve, 2000));
                }
            } else if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        } catch {
            // console.error(`Failed to search policies (attempt ${attempt}):`, _error.message || String(_error));

            if (attempt < retries) {
                await new Promise((resolve) => setTimeout(resolve, 2000));
            }
        }
    }

    return null;
}

/**
 * Create a permission policy using the CEL (Advanced) editor.
 * Caller must already be on the Permission Policies list page.
 * Available permissions: 'Download Files' | 'Upload Files' | 'Create Burn-on-Read Message'
 * Available roles: 'system_guest' | 'system_user' | 'system_admin' | 'system_bot' (Bot accounts)
 */
export async function createPermissionPolicy(
    page: Page,
    options: {
        name: string;
        celExpression: string;
        permissions: Array<'Download Files' | 'Upload Files' | 'Create Burn-on-Read Message'>;
        role?: 'system_guest' | 'system_user' | 'system_admin' | 'system_bot';
        adminClient?: Client4;
    },
): Promise<void> {
    // Ensure user attributes exist — a parallel test may have deleted all CPA fields,
    // which disables the "Switch to Advanced Mode" button in the permission policy editor.
    if (options.adminClient) {
        await ensureUserAttributes(options.adminClient);
    }

    await navigateToPermissionPoliciesPage(page);

    const addPolicyButton = page.getByRole('button', {name: 'Add policy'});
    await addPolicyButton.waitFor({state: 'visible', timeout: duration.half_min});
    await addPolicyButton.click();
    await page.waitForLoadState('networkidle');

    // Fill policy name
    await page.getByPlaceholder('Add a unique policy name').fill(options.name);

    // Set role if not the default (system_user) using the role dropdown
    if (options.role && options.role !== 'system_user') {
        await page.locator('#pp-role-selector-btn').click();
        await page.locator(`#pp-role-option-${options.role}`).click();
    }

    // Switch to Advanced (CEL) mode and enter expression.
    // The button is disabled when no user-attribute fields exist. If another test's
    // afterEach deleted all CPA fields between our ensureUserAttributes call and now,
    // re-create them and reload the "Add policy" form before clicking.
    const switchBtn = page.getByRole('button', {name: 'Switch to Advanced Mode'});
    if (await switchBtn.isDisabled()) {
        if (options.adminClient) {
            await ensureUserAttributes(options.adminClient);
        }
        await navigateToPermissionPoliciesPage(page);
        const addPolicyRetry = page.getByRole('button', {name: 'Add policy'});
        await addPolicyRetry.waitFor({state: 'visible', timeout: duration.half_min});
        await addPolicyRetry.click();
        await page.waitForLoadState('networkidle');
        // Re-fill policy name and role after the form reload.
        await page.getByPlaceholder('Add a unique policy name').fill(options.name);
        if (options.role && options.role !== 'system_user') {
            await page.locator('#pp-role-selector-btn').click();
            await page.locator(`#pp-role-option-${options.role}`).click();
        }
    }
    await expect(switchBtn).toBeEnabled();
    await switchBtn.click();

    const monacoContainer = page.locator('.monaco-editor').first();
    await monacoContainer.waitFor({state: 'visible', timeout: duration.ten_sec});

    const editorLines = page.locator('.monaco-editor .view-lines').first();
    await editorLines.click({force: true});
    await page.waitForTimeout(300);

    const isMac = process.platform === 'darwin';
    await page.keyboard.press(isMac ? 'Meta+a' : 'Control+a');
    await page.waitForTimeout(100);
    await page.keyboard.type(options.celExpression, {delay: 10});

    // Add each permission via the menu.
    // Items are keyed by their action value, e.g. pp-add-permission-download_file_attachment.
    const permissionIdMap: Record<string, string> = {
        'Download Files': 'pp-add-permission-download_file_attachment',
        'Upload Files': 'pp-add-permission-upload_file_attachment',
        'Create Burn-on-Read Message': 'pp-add-permission-create_burn_on_read_post',
    };
    for (const permission of options.permissions) {
        await page.getByRole('button', {name: 'Add permission'}).click();
        await page.locator(`#${permissionIdMap[permission]}`).click();
    }

    await page.getByRole('button', {name: 'Save'}).last().click();
    await page.waitForLoadState('networkidle');
}

/**
 * Navigate to Permission Policies and ensure the route is available.
 * Throws a clear error when the webapp bundle does not include this page.
 */
export async function navigateToPermissionPoliciesPage(page: Page): Promise<void> {
    await page.goto('/admin_console/system_attributes/permission_policies');
    await page.waitForLoadState('networkidle');

    if (page.url().includes('/admin_console/about/license')) {
        throw new Error(
            'Permission Policies page is unavailable and redirected to License. Rebuild and run webapp from a branch that includes the permission policies route before running ABAC tests.',
        );
    }
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Shared ABAC test helper functions
 * These functions are used across multiple ABAC test files to reduce duplication
 */

import {expect} from '@playwright/test';
import type {Client4} from '@mattermost/client';
import type {UserProfile} from '@mattermost/types/users';
import type {Channel} from '@mattermost/types/channels';
import type {UserPropertyField} from '@mattermost/types/properties_user';

import {getRandomId, newTestPassword, duration} from '@mattermost/playwright-lib';

import type {CustomProfileAttribute} from '../../channels/custom_profile_attributes/helpers';
import {setupCustomProfileAttributeValuesForUser} from '../../channels/custom_profile_attributes/helpers';

import {permissionPolicyIdByName} from './surface';

/**
 * Create user attribute field via API
 */
async function createUserAttributeField(client: Client4, name: string, type: string = 'text'): Promise<any> {
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
    // list every attribute (with attribute-based access off that endpoint fails, and there is nothing to wait for).
    await expect
        .poll(async () => {
            try {
                const names = new Set((await client.getAccessControlFields('', 100)).map((f) => f.name));
                return attributesToCreate.every((name) => names.has(name));
            } catch {
                return true;
            }
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

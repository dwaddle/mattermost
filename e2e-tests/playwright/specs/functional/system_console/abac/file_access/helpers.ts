// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import type {Client4} from '@mattermost/client';

import {
    assetPath,
    expect,
    getRandomId,
    newTestPassword,
    type App,
    type generated,
    duration,
} from '@mattermost/playwright-lib';

import {createPrivateChannelForABAC, ensureUserAttributes, getPolicyIdByName} from '../support';

export async function setupUserAndChannel(
    adminClient: any,
    team: any,
): Promise<{
    testUser: any;
    channelName: string;
    channelId: string;
}> {
    // Ensure at least one user attribute field exists so the permission policy
    // CEL editor's "Switch to Advanced Mode" button is enabled in the UI.
    await ensureUserAttributes(adminClient, ['Department']);

    const username = `user${getRandomId()}`;
    const password = newTestPassword();
    const testUser = await adminClient.createUser(
        {email: `${username}@example.com`, username, password} as any,
        '',
        '',
    );
    (testUser as any).password = password;

    await adminClient.addToTeam(team.id, testUser.id);

    const channel = await createPrivateChannelForABAC(adminClient, team.id);
    await adminClient.addToChannel(testUser.id, channel.id);

    return {testUser, channelName: channel.name, channelId: channel.id};
}

/**
 * Every initSetup() rewrites the shared server config, so an earlier spec can leave ABAC off.
 * Without this the policy is created but never enforced, and the allow-side tests pass blindly.
 */
export async function ensureABACEnabled(adminClient: Client4): Promise<void> {
    await adminClient.patchConfig({
        AccessControlSettings: {EnableAttributeBasedAccessControl: true},
    } as any);

    await expect
        .poll(
            async () => {
                const cfg = await adminClient.getConfig();
                return cfg.AccessControlSettings?.EnableAttributeBasedAccessControl === true;
            },
            {timeout: duration.half_min, intervals: [500, 1000, 2000]},
        )
        .toBe(true);
}

/** Block until a just-created policy is readable through the search API. */
export async function waitForPolicy(adminClient: Client4, policyName: string): Promise<void> {
    await expect
        .poll(async () => Boolean(await getPolicyIdByName(adminClient, policyName, 1)), {
            timeout: duration.half_min,
            intervals: [500, 1000, 2000],
        })
        .toBe(true);
}

/** Posts a message with an asset file attached through the composer's file chooser, waiting for the post. */
export async function postWithFile(app: App, client: Client4, channelId: string, message: string) {
    const composer = app.center.postCreate;
    const chooser = app.page.waitForEvent('filechooser');
    await composer.clickAttachButton();
    await (await chooser).setFiles(path.join(assetPath, 'sample_text_file.txt'));
    await expect(composer.filePreviews.fileItems).toHaveCount(1);
    await composer.fillMessageTextbox(message);
    await composer.clickSendButton();
    return postNamed(app, client, channelId, message);
}

/** The center post showing `message`, and its id (found through the API: other posts arrive around it). */
export async function postNamed(app: App, client: Client4, channelId: string, message: string) {
    let id = '';
    await expect
        .poll(async () => {
            const {order, posts} = await client.getPosts(channelId);
            id = order.find((postId) => posts[postId].message === message) ?? '';
            return id;
        })
        .not.toBe('');
    const post = app.center.postList.post({id});
    await expect(post.locator).toContainText(message);
    return Object.assign(post, {postId: id});
}

/** A post (or a permalink preview, which carries the same parts) with attachments. */
type WithFiles = Pick<generated.PostItem, 'attachments' | 'redactedFiles'>;

/** A post's files render (and not the redacted placeholder). */
export async function expectFilesVisible(post: WithFiles) {
    await expect(post.attachments.locator).toBeVisible();
    await expect(post.redactedFiles.locator).toHaveCount(0);
}

/** A post's files are replaced by the redacted placeholder. */
export async function expectFilesRedacted(post: WithFiles) {
    await expect(post.redactedFiles.locator).toBeVisible();
    await expect(post.attachments.locator).toHaveCount(0);
}

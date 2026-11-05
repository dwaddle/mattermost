// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {expect, type App} from '@mattermost/playwright-lib';

/**
 * Posts with mm_blocks on the generated page objects. A post's blocks are `<post>.blocks`, an action button
 * `<post>.action:<action_id>--button`, a select `<post>.select:<action_id>` (its input and suggestions inside), and a
 * collapsible `<post>.collapsible` (its toggle and content).
 */

export type CenterPost = ReturnType<App['center']['postList']['post']>;
export type ThreadPost = ReturnType<App['rhs']['thread']['post']>;

/** The id a keyed element's testid ends with (`rhs.thread.post:<id>` -> `<id>`). */
async function keyOf(item: Locator) {
    const testId = await item.getAttribute('data-testid');
    return testId!.slice(testId!.lastIndexOf(':') + 1);
}

/** The center channel's most recent post, once it shows. */
export async function lastCenterPost(app: App): Promise<CenterPost> {
    const {postList} = app.center;
    await expect(postList.postItems.last()).toBeVisible();
    const post = postList.post({id: (await postList.postKeys()).at(-1)!});
    await expect(post.locator).toBeVisible();
    return post;
}

/** The most recent center post whose text contains `text`, once it shows. */
export async function centerPostContaining(app: App, text: string | RegExp): Promise<CenterPost> {
    const item = app.center.postList.postItems.filter({hasText: text}).last();
    await expect(item).toBeVisible();
    return app.center.postList.post({id: await keyOf(item)});
}

/** Opens a center post's thread from its Reply button, and waits for the thread to show. */
export async function openThread(app: App, post: CenterPost) {
    await post.locator.hover();
    await post.menu.clickReplyButton();
    await expect(app.rhs.thread.postItems.first()).toBeVisible();
}

/** The most recent thread post whose text contains `text`, once it shows. */
export async function threadPostContaining(app: App, text: string | RegExp): Promise<ThreadPost> {
    const item = app.rhs.thread.postItems.filter({hasText: text}).last();
    await expect(item).toBeVisible();
    return app.rhs.thread.post({id: await keyOf(item)});
}

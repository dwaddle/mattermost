// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import type {BodyOf, Effect} from './aria/effects';
import {waitForApiIn, type ApiWaitOptions} from './aria/settle';
import {Api} from './ui/generated/api';

// `settle` lives with the drivers (aria/settle.ts), whose `commit()`/`submit()` use it.
export {settle, settleAll, SettleError, type ApiWaitOptions, type SettleOptions} from './aria/settle';

/** The generated operations: a placeholder skips `me` where one of them is the `/me` form (`GetChannelMemberMe`). */
const API_OPERATIONS: readonly Effect[] = Object.values(Api);

/**
 * Waits for a response to an API operation that the page issues on its own, not one an action of the test causes
 * (that is `settle`): a websocket event that makes the page refetch, a view loading its data. It starts listening
 * when called, so start it before whatever makes the page fetch and await it after, like `page.waitForResponse`:
 *
 *   const thread = waitForApi(page, Api.GetPostThread, {params: {post_id: root.id}});
 *   await otherClient.createPost({channel_id, root_id: root.id, message: 'reply'});
 *   const {order} = await thread;
 *
 * It returns the response body, typed from the operation. `params` binds path placeholders to one entity,
 * `predicate` skips responses until one holds, `status` expects a non-2xx, `timeout` (default 30 s) counts from the
 * call. Requests are matched as `settle` matches them: on the app path (so under a subpath too), only requests issued
 * after the call, redirects followed, a network failure giving way to a retry, an HTTP error failing at once with its
 * body, and a placeholder not matching `me` where `Api` has the operation's `/me` form. A timeout lists the last API
 * requests the page issued.
 */
export function waitForApi<W extends Effect<unknown, string, string>>(
    page: Page,
    op: W,
    opts?: ApiWaitOptions<W>,
): Promise<BodyOf<W>> {
    return waitForApiIn(page, op, opts, API_OPERATIONS);
}

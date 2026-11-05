// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

import BurnOnReadConcealedPlaceholder from './burn_on_read_concealed_placeholder';
import LinkPreview from './link_preview';

import {duration, wait} from '@/util';

// "<26-char id>:<timestamp>" — a pending_post_id before the server acks, but also the permanent
// DOM id of a combined post (see ChannelsCenterView.postById). Indistinguishable by shape.
const SUFFIXED_POST_ID_RE = /^([a-z0-9]{26}):\d+$/;

// Both assert the positive case first: a lone "placeholder is absent" check also passes
// against a region that has not rendered at all.
export async function expectFilesVisible(scope: Locator) {
    await expect(scope.getByTestId(/\.attachments$/)).toBeVisible();
    await expect(scope.getByTestId(/\.redacted_files$/)).toHaveCount(0);
}

export async function expectFilesRedacted(scope: Locator) {
    await expect(scope.getByTestId(/\.redacted_files$/)).toBeVisible();
    await expect(scope.getByTestId(/\.attachments$/)).toHaveCount(0);
}

export default class ChannelsPost {
    readonly container: Locator;

    readonly body;
    readonly concealedPlaceholder;

    constructor(container: Locator) {
        this.container = container;

        this.body = container.getByTestId(/\.post\.body$/);
        this.concealedPlaceholder = new BurnOnReadConcealedPlaceholder(container.getByTestId(/\.reveal--button$/));
    }

    /**
     * Returns the post's permanent ID.
     *
     * A just-sent post renders optimistically under its pending_post_id, which is the author's ID,
     * not the post's — so retry briefly to give the server ack time to land. A combined post is
     * suffixed the same way but is already permanent, so fall back to the prefix rather than
     * failing: waiting cannot improve it.
     */
    async getId(attempts = 3) {
        let id: string | null = null;
        let postId = '';

        for (let attempt = 0; attempt < attempts; attempt++) {
            if (attempt > 0) {
                await wait(duration.one_sec);
            }

            id = await this.container.getAttribute('id');
            postId = (id ?? '').substring('post_'.length);

            if (postId && !SUFFIXED_POST_ID_RE.test(postId)) {
                return postId;
            }
        }

        const suffixed = SUFFIXED_POST_ID_RE.exec(postId);
        if (suffixed) {
            return suffixed[1];
        }

        throw new Error(`No post ID found after ${attempts} attempts, last saw id="${id}".`);
    }

    getLinkPreview() {
        return new LinkPreview(this.body.getByTestId(/\.link_preview--link$/));
    }
}

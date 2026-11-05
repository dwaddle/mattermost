// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

import ChannelsHeader from './header';
import ChannelsPostCreate from './post_create';
import ChannelsPost from './post';

import {duration} from '@/util';
import {waitUntil} from '@/test_action';

export default class ChannelsCenterView {
    readonly container: Locator;

    readonly header;
    readonly postCreate;

    constructor(container: Locator) {
        this.container = container;

        this.header = new ChannelsHeader(this.container.locator('#channel-header'));
        this.postCreate = new ChannelsPostCreate(container.getByTestId('center.composer'));
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await this.postCreate.toBeVisible();
    }

    async postMessage(message: string, files?: string[]) {
        await this.postCreate.postMessage(message, files);
    }

    /**
     * Return the last post in the Center
     */
    async getLastPost() {
        const lastPost = this.container.getByTestId(/^center\.post_list\.post:/).last();
        await lastPost.waitFor();
        return new ChannelsPost(lastPost);
    }

    /**
     * Returns the Center post by post's id
     * @param postId Just the ID without the prefix
     * Note: Handles both simple posts (post_id) and combined posts (post_id:timestamp)
     */
    postById(id: string) {
        // Match either exact ID or ID with timestamp suffix (for combined posts)
        // Use CSS selector that matches: post_id OR post_id:*
        return this.container.locator(`[id="post_${id}"], [id^="post_${id}:"]`).first();
    }

    async getPostById(id: string) {
        const postById = this.postById(id);
        await postById.waitFor();
        return new ChannelsPost(postById);
    }

    async waitUntilLastPostContains(text: string, timeout = duration.ten_sec) {
        await waitUntil(
            async () => {
                const post = await this.getLastPost();
                const content = await post.container.textContent();
                return content?.includes(text);
            },
            {timeout},
        );
    }

    async waitUntilPostWithIdContains(id: string, text: string, timeout = duration.ten_sec) {
        // A single retrying assertion, rather than polling around getPostById(): that helper waits
        // on the locator itself, so a post that has not rendered yet consumes the whole budget in
        // one iteration and the outer timeout reports nothing about what the post actually held.
        await expect(this.postById(id)).toContainText(text, {timeout});
    }
}

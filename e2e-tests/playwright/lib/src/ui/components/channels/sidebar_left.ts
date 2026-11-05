// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class ChannelsSidebarLeft {
    readonly container: Locator;
    readonly browseOrCreateChannelButton: Locator;
    readonly findChannelButton;

    constructor(container: Locator) {
        this.container = container;
        this.browseOrCreateChannelButton = container.locator('#browseOrAddChannelMenuButton');
        this.findChannelButton = container.getByRole('button', {name: 'Find Channels'});
    }

    /**
     * Locates the sidebar link with the given name.
     * It can be any sidebar item name including channels, direct messages, or group messages, threads, etc.
     * Falls back to matching by visible text since some sidebar items (e.g. DMs) may not resolve by the plain ID.
     * @param name
     */
    item(name: string): Locator {
        return this.container
            .locator(`#sidebarItem_${name}`)
            .or(this.container.locator('.SidebarLink').filter({hasText: name}))
            .first();
    }

    /**
     * Verifies the sidebar item with the given name is in the unread state.
     * @param name
     */
    async assertItemUnread(name: string) {
        await expect(this.item(name)).toHaveClass(/unread|unread-title/);
    }
}

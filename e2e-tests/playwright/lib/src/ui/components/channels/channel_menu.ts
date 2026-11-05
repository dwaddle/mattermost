// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * The channel header dropdown menu, opened from the channel name at the top of the center channel.
 * Its accessible name is "<channel> Channel Menu", so it is located by role with a name matcher.
 */
export default class ChannelMenu {
    readonly container: Locator;
    readonly channelSettings: Locator;
    readonly members: Locator;
    readonly leaveChannel: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.channelSettings = this.item('Channel Settings');
        this.members = this.item('Members');
        this.leaveChannel = this.item('Leave Channel');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Locates a menu item by its accessible name.
     */
    item(name: string | RegExp): Locator {
        return this.container.getByRole('menuitem', {name});
    }
}

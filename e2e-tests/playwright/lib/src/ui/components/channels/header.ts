// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class ChannelsHeader {
    readonly container: Locator;

    readonly title: Locator;
    readonly channelMenuDropdown;

    constructor(container: Locator) {
        this.container = container;

        this.title = container.locator('#channelHeaderTitle');
        this.channelMenuDropdown = container.locator('#channelHeaderDropdownButton');
    }

    async toHaveTitle(title: string) {
        await expect(this.title).toContainText(title);
    }
}

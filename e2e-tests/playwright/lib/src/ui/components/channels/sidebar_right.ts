// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class ChannelsSidebarRight {
    readonly container: Locator;
    readonly addMembersButton;

    constructor(container: Locator) {
        this.container = container;
        this.addMembersButton = container.getByRole('button', {name: 'Add'});
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * System Console Sidebar Header component
 */
export default class SystemConsoleSidebarHeader {
    readonly container: Locator;
    readonly title: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.title = container.getByText('System Console');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.title).toBeVisible();
    }
}

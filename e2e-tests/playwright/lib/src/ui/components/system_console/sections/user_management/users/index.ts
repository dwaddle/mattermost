// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * System Console -> User Management -> Users
 */
export default class Users {
    readonly container: Locator;

    // Header
    readonly header: Locator;

    constructor(container: Locator) {
        this.container = container;

        this.header = container.getByText('Mattermost Users', {exact: true});
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.header).toBeVisible();
    }
}

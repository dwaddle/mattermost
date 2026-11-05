// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * The User Groups list modal, opened from the product menu's "User Groups" item.
 */
export default class UserGroupsModal {
    readonly container: Locator;

    constructor(container: Locator) {
        this.container = container;
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Locates a group row by its display name.
     */
    getGroup(displayName: string): Locator {
        return this.container
            .getByTestId(/^user_groups_modal\.group:/)
            .filter({has: this.container.page().getByText(displayName, {exact: true})});
    }
}

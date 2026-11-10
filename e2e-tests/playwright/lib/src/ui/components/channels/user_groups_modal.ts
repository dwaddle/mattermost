// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * The User Groups list modal, opened from the product menu's "User Groups" item.
 */
export default class UserGroupsModal {
    readonly container: Locator;

    readonly createGroupButton;
    readonly searchInput;
    readonly filterButton;

    constructor(container: Locator) {
        this.container = container;

        this.createGroupButton = container.getByTestId('user_groups_modal.create--button');
        this.searchInput = container.getByTestId('user_groups_modal.search--textbox');
        this.filterButton = container.getByTestId('user_groups_modal.filter--button');
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

    async openGroup(displayName: string) {
        await this.getGroup(displayName).click();
    }

    /**
     * Switches the list filter to show archived groups.
     */
    async filterArchived() {
        await this.filterButton.click();
        await this.container.page().getByTestId('user_groups_modal.filter_menu.archived--menuitem').click();
    }
}

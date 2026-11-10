// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * The single-group view modal, shown after opening a group from the User Groups list.
 */
export default class ViewUserGroupModal {
    readonly container: Locator;

    readonly actionsButton;
    readonly archiveGroupItem;
    readonly restoreGroupButton;
    readonly addPeopleButton;

    constructor(container: Locator) {
        this.container = container;

        this.actionsButton = container.getByTestId('view_user_group_modal.menu--button');
        this.restoreGroupButton = container.getByTestId('view_user_group_modal.restore--button');
        this.addPeopleButton = container.getByTestId('view_user_group_modal.add_people--button');

        // The group actions menu renders in a portal outside the modal.
        this.archiveGroupItem = container.page().getByTestId('view_user_group_modal.menu.archive--menuitem');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async archive() {
        await this.actionsButton.click();
        await this.archiveGroupItem.click();
    }

    async restore() {
        await this.restoreGroupButton.click();
    }
}

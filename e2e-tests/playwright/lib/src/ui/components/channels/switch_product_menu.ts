// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type Locator, expect} from '@playwright/test';

export default class SwitchProductMenu {
    readonly container: Locator;
    readonly userGroupsMenuItem: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.userGroupsMenuItem = container.getByRole('menuitem', {name: 'User Groups'});
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async openUserGroups() {
        await this.userGroupsMenuItem.click();
    }
}

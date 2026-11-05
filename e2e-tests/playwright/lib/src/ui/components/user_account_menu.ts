// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

export default class UserAccountMenu {
    readonly container: Locator;
    readonly logout;

    constructor(container: Locator) {
        this.container = container;
        this.logout = container.getByRole('menuitem', {name: 'Log out'});
    }
}

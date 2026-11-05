// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class MainHeader {
    readonly container: Locator;

    readonly logo;
    readonly backButton;

    /** `backButtonTestId`: the public pages' header renders `public.header.back--link`; other pages pass their own. */
    constructor(container: Locator, backButtonTestId = 'public.header.back--link') {
        this.container = container;

        this.logo = container.getByTestId('public.header.logo--link');
        this.backButton = container.getByTestId(backButtonTestId);
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class SearchBox {
    readonly container: Locator;
    readonly searchInput;

    constructor(container: Locator) {
        this.container = container;
        this.searchInput = container.getByLabel('Search messages');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Fills the search input with the given term and submits the search.
     */
    async search(term: string) {
        await expect(this.searchInput).toBeVisible();
        await this.searchInput.fill(term);
        await this.searchInput.press('Enter');
    }
}

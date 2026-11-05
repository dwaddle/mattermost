// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class LinkPreview {
    readonly container: Locator;
    readonly removeButton;

    constructor(container: Locator) {
        this.container = container;
        this.removeButton = container.getByRole('button', {name: 'Remove'});
    }

    async toBeVisible(timeout?: number) {
        await expect(this.container).toBeVisible({timeout});
    }

    async remove() {
        await this.container.hover();
        await this.removeButton.click();
        await this.toNotBeVisible();
    }

    async toNotBeVisible() {
        await expect(this.container).not.toBeVisible();
    }
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class BurnOnReadConcealedPlaceholder {
    readonly container: Locator;

    constructor(container: Locator) {
        this.container = container;
    }

    /**
     * Click to reveal the concealed message
     * The container itself is the clickable button
     */
    async clickToReveal() {
        await expect(this.container).toBeAttached();
        await expect(this.container).toBeEnabled();
        await this.container.click();
    }

    /**
     * Wait for the reveal process to complete
     * The placeholder should disappear after successful reveal
     */
    async waitForReveal(timeout = 5000) {
        await expect(this.container).not.toBeVisible({timeout});
    }
}

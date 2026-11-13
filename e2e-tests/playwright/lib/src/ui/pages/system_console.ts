// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import GlobalAttributes from '@/ui/components/system_console/sections/system_attributes/global_attributes';

/**
 * What master's new global attribute listing specs and the permission policy bot scope spec still use: the page and the
 * hand-written Global Attributes object. Everything else of the System Console is on the generated objects (`app.admin`).
 */
export default class SystemConsolePage {
    readonly page: Page;
    readonly globalAttributes: GlobalAttributes;

    constructor(page: Page) {
        this.page = page;
        this.globalAttributes = new GlobalAttributes(page.locator('#adminConsoleWrapper'));
    }

    async goto() {
        await this.page.goto('/admin_console');
    }
}

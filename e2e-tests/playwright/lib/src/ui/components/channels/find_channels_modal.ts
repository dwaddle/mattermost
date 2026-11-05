// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class FindChannelsModal {
    readonly container: Locator;
    readonly input;
    readonly searchList;

    constructor(container: Locator) {
        this.container = container;

        this.input = container.getByTestId('quick_switch_modal.search--textbox');
        this.searchList = container.getByTestId(/^quick_switch_modal\.suggestions\.item:[^.:]+--option$/);
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /** A channel's result, keyed by channel id (a DM not yet created is keyed by the other user's id). */
    getResult(channel: {id: string}) {
        return this.container.getByTestId(`quick_switch_modal.suggestions.item:${channel.id}--option`);
    }

    async selectChannel(channel: {id: string}) {
        await this.getResult(channel).click();
    }
}

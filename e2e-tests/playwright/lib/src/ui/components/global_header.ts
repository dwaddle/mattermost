// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

import type {ChannelsPage} from '../pages';

export default class GlobalHeader {
    readonly channelsPage: ChannelsPage;
    readonly switchProductMenuButton;
    readonly recentMentionsButton;
    readonly searchBox;

    constructor(channelsPage: ChannelsPage, container: Locator) {
        this.channelsPage = channelsPage;
        this.switchProductMenuButton = container.getByRole('button', {name: 'Open product menu'});
        this.recentMentionsButton = container.getByRole('button', {name: 'Recent mentions'});
        this.searchBox = container.locator('#searchFormContainer');
    }

    async openSwitchProductMenu() {
        await this.switchProductMenuButton.click();
        await this.channelsPage.switchProductMenu.toBeVisible();

        return this.channelsPage.switchProductMenu;
    }

    /**
     * Opens the product switch menu and selects the "User Groups" item.
     */
    async openUserGroups() {
        const menu = await this.openSwitchProductMenu();
        await menu.openUserGroups();
    }

    async openRecentMentions() {
        await expect(this.recentMentionsButton).toBeVisible();
        await this.recentMentionsButton.click();
    }

    async openSearch() {
        await expect(this.searchBox).toBeVisible();
        await this.searchBox.click();
    }
}

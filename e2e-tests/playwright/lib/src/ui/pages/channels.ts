// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';
import {expect} from '@playwright/test';

import {
    ChannelsCenterView,
    ChannelSettingsModal,
    NewChannelModal,
    components,
    ChannelsSidebarLeft,
} from '@/ui/components';

export default class ChannelsPage {
    readonly page: Page;

    readonly globalHeader;
    readonly userAccountMenuButton;
    readonly searchBox;
    readonly centerView;
    readonly sidebarLeft;
    readonly sidebarRight;

    readonly channelSettingsModal;
    readonly newChannelModal;
    readonly searchResultsPanel;
    readonly userGroupsModal;
    readonly switchProductMenu;
    readonly channelMenu;
    readonly userAccountMenu;

    constructor(page: Page) {
        this.page = page;

        // The main areas of the app
        this.globalHeader = new components.GlobalHeader(this, page.locator('#global-header'));
        this.searchBox = new components.SearchBox(page.locator('#searchBox'));
        this.centerView = new ChannelsCenterView(page.getByTestId('channel_view'));
        this.sidebarLeft = new ChannelsSidebarLeft(page.locator('#SidebarContainer'));
        this.sidebarRight = new components.ChannelsSidebarRight(page.locator('#sidebar-right'));
        this.userAccountMenuButton = page.getByRole('button', {name: "User's account menu"});

        // Modals
        this.channelSettingsModal = new ChannelSettingsModal(page.getByRole('dialog', {name: 'Channel Settings'}));
        this.newChannelModal = new NewChannelModal(page.getByRole('dialog', {name: 'Create a new channel'}));
        this.searchResultsPanel = new components.SearchResultsPanel(page.locator('#searchContainer'));
        this.userGroupsModal = new components.UserGroupsModal(page.getByTestId('user_groups_modal'));

        // Menus
        // The channel header dropdown menu's accessible name is "<channel> Channel Menu".
        this.channelMenu = new components.ChannelMenu(page.getByRole('menu', {name: /Channel Menu/i}));
        this.userAccountMenu = new components.UserAccountMenu(page.locator('#userAccountMenu'));
        this.switchProductMenu = new components.SwitchProductMenu(page.locator('#switchProductMenu'));
    }

    async toBeVisible() {
        await this.centerView.toBeVisible();
    }

    async getLastPost() {
        return this.centerView.getLastPost();
    }

    getAddPeopleToChannelModal() {
        return new components.AddPeopleToChannelModal(this.page.getByRole('dialog', {name: /Add people to/}));
    }

    async goto(teamName = '', channelName = '') {
        let channelsUrl = '/';
        if (teamName) {
            channelsUrl += `${teamName}`;
            if (channelName) {
                const prefix = channelName.startsWith('@') ? '/messages' : '/channels';
                channelsUrl += `${prefix}/${channelName}`;
            }
        }
        await this.page.goto(channelsUrl);

        return channelsUrl;
    }

    /**
     * `postMessage` posts a message in the current channel
     * @param message Message to post
     * @param files Files to attach to the message
     */
    async postMessage(message: string, files?: string[]) {
        await this.centerView.postMessage(message, files);
    }

    /**
     * Opens the channel header dropdown menu and returns it.
     */
    async openChannelMenu() {
        await this.centerView.header.openChannelMenu();
        await this.channelMenu.toBeVisible();

        return this.channelMenu;
    }

    /**
     * Opens the search UI, runs a search for the given term, and waits for the
     * results panel to appear.
     */
    async searchFor(term: string) {
        await this.globalHeader.openSearch();
        await this.searchBox.toBeVisible();
        await this.searchBox.search(term);
        await this.searchResultsPanel.toBeVisible();
    }

    async openChannelSettings(): Promise<ChannelSettingsModal> {
        const channelMenu = await this.openChannelMenu();

        const channelSettingsMenuItem = channelMenu.channelSettings;
        const moreActionsMenuItem = channelMenu.item(/More actions/i);

        const channelSettingsVisible = await channelSettingsMenuItem.isVisible({timeout: 1500}).catch(() => false);
        if (!channelSettingsVisible) {
            const moreActionsVisible = await moreActionsMenuItem.isVisible({timeout: 1500}).catch(() => false);
            if (moreActionsVisible) {
                await moreActionsMenuItem.click();
            }
        }

        await expect(channelSettingsMenuItem).toBeVisible();
        await channelSettingsMenuItem.click();
        await this.channelSettingsModal.toBeVisible();

        return this.channelSettingsModal;
    }

    async openNewChannelModal(): Promise<NewChannelModal> {
        await this.sidebarLeft.browseOrCreateChannelButton.click();
        await this.page.getByText('Create new channel').click();
        await this.newChannelModal.toBeVisible();

        return this.newChannelModal;
    }

    async newChannel(name: string, channelType: string) {
        const newChannelModal = await this.openNewChannelModal();
        await newChannelModal.displayNameInput.fill(name);

        if (channelType === 'P') {
            await newChannelModal.privateTypeButton.click();
        } else {
            await newChannelModal.publicTypeButton.click();
        }

        await newChannelModal.create();
    }

    async openUserAccountMenu() {
        await this.userAccountMenuButton.click();
        await expect(this.userAccountMenu.container).toBeVisible();
        return this.userAccountMenu;
    }

    /**
     * Logs the current user out via the user account menu.
     */
    async logout() {
        const menu = await this.openUserAccountMenu();
        await menu.logout.click();
    }
}

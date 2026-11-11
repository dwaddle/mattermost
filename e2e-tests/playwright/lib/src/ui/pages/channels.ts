// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';
import {expect} from '@playwright/test';

import {
    AddPeopleToChannelModal,
    ChannelMenu,
    ChannelsCenterView,
    ChannelSettingsModal,
    ChannelsSidebarLeft,
    ChannelsSidebarRight,
    GlobalHeader,
    NewChannelModal,
    SearchBox,
    SearchResultsPanel,
    SwitchProductMenu,
    UserAccountMenu,
    UserGroupsModal,
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
        this.globalHeader = new GlobalHeader(this, page.locator('#global-header'));
        this.searchBox = new SearchBox(page.locator('#searchBox'));
        this.centerView = new ChannelsCenterView(page.getByTestId('channel_view'));
        this.sidebarLeft = new ChannelsSidebarLeft(page.locator('#SidebarContainer'));
        this.sidebarRight = new ChannelsSidebarRight(page.locator('#sidebar-right'));
        this.userAccountMenuButton = page.getByRole('button', {name: "User's account menu"});

        // Modals
        this.channelSettingsModal = new ChannelSettingsModal(page.getByRole('dialog', {name: 'Channel Settings'}));
        this.newChannelModal = new NewChannelModal(page.getByRole('dialog', {name: 'Create a new channel'}));
        this.searchResultsPanel = new SearchResultsPanel(page.locator('#searchContainer'));
        this.userGroupsModal = new UserGroupsModal(page.getByTestId('user_groups_modal'));

        // Menus
        // The channel header dropdown menu's accessible name is "<channel> Channel Menu".
        this.channelMenu = new ChannelMenu(page.getByRole('menu', {name: /Channel Menu/i}));
        this.userAccountMenu = new UserAccountMenu(page.locator('#userAccountMenu'));
        this.switchProductMenu = new SwitchProductMenu(page.locator('#switchProductMenu'));
    }

    async toBeVisible() {
        await this.centerView.toBeVisible();
    }

    async getLastPost() {
        return this.centerView.getLastPost();
    }

    getAddPeopleToChannelModal() {
        return new AddPeopleToChannelModal(this.page.getByRole('dialog', {name: /Add people to/}));
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
     * Opens the search UI, runs a search for the given term, and waits for the
     * results panel to appear.
     */
    async searchFor(term: string) {
        await this.globalHeader.openSearch();
        await this.searchBox.toBeVisible();
        await this.searchBox.search(term);
        await this.searchResultsPanel.toBeVisible();
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

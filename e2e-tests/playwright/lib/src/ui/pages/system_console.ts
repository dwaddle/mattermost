// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import SystemConsoleNavbar from '@/ui/components/system_console/navbar';
import SystemConsoleSidebar from '@/ui/components/system_console/sidebar';
import ServerLogs from '@/ui/components/system_console/sections/reporting/server_logs';
import GlobalAttributes from '@/ui/components/system_console/sections/system_attributes/global_attributes';
import Users from '@/ui/components/system_console/sections/user_management/users';

export default class SystemConsolePage {
    readonly page: Page;

    // Layout
    readonly navbar: SystemConsoleNavbar;
    readonly sidebar: SystemConsoleSidebar;
    readonly serverLogs: ServerLogs;

    // User Management
    readonly users: Users;

    // System Attributes (master's global attribute listing specs still read it through here)
    readonly globalAttributes: GlobalAttributes;

    constructor(page: Page) {
        this.page = page;

        // Layout
        this.navbar = new SystemConsoleNavbar(page.getByTestId('backstage.navbar'));
        this.sidebar = new SystemConsoleSidebar(page.getByTestId('admin.sidebar'));

        const adminConsoleWrapper = page.locator('#adminConsoleWrapper');
        this.serverLogs = new ServerLogs(adminConsoleWrapper);

        // User Management
        this.users = new Users(adminConsoleWrapper);

        // System Attributes
        this.globalAttributes = new GlobalAttributes(adminConsoleWrapper);
    }

    async toBeVisible() {
        await this.page.waitForLoadState('networkidle');
        await this.navbar.toBeVisible();
        await this.sidebar.toBeVisible();
    }

    async goto() {
        await this.page.goto('/admin_console');
    }

    /**
     * @param query - Filters to open the page with, e.g. '?search=timeout&range=60'
     */
    async gotoServerLogs(query = '') {
        await this.page.goto(`/admin_console/reporting/server_logs${query}`);
        await this.page.waitForLoadState('networkidle');
    }
}

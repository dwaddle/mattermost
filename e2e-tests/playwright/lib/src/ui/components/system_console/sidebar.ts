// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

import SystemConsoleSidebarHeader from './sidebar_header';

export default class SystemConsoleSidebar {
    readonly container: Locator;
    readonly header: SystemConsoleSidebarHeader;
    readonly searchInput: Locator;
    readonly userManagement: UserManagementCategory;

    constructor(container: Locator) {
        this.container = container;
        this.header = new SystemConsoleSidebarHeader(container.locator('#admin-sidebar-header'));
        this.searchInput = container.getByPlaceholder('Find settings');
        this.userManagement = new UserManagementCategory(
            container.getByTestId('admin.sidebar.category:user_management'),
        );
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await this.header.toBeVisible();
        await expect(this.searchInput).toBeVisible();
    }
    get users() {
        return this.userManagement.users;
    }
}

class SidebarSection {
    readonly link: Locator;

    constructor(link: Locator) {
        this.link = link;
    }

    async click() {
        await this.link.scrollIntoViewIfNeeded();
        await this.link.click();
    }
}

class SidebarCategory {
    readonly sections: Locator;

    constructor(container: Locator) {
        this.sections = container.getByTestId('admin.sidebar.category.sections--list');
    }

    protected section(name: string): SidebarSection {
        const link = this.sections.getByRole('link', {name, exact: true});
        return new SidebarSection(link);
    }
}

class UserManagementCategory extends SidebarCategory {
    readonly users: SidebarSection;

    constructor(container: Locator) {
        super(container);
        this.users = this.section('Users');
    }
}

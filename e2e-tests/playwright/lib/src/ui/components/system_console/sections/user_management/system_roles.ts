// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * System Console -> User Management -> Delegated Granular Administration -> [Role] Edit
 * This page is shown when editing a specific role (e.g., System Manager, User Manager, etc.)
 */
export default class SystemRoles {
    readonly container: Locator;

    // Header
    readonly backLink: Locator;
    readonly roleName: Locator;

    // Privileges Panel
    readonly privilegesPanel: PrivilegesPanel;

    // Assigned People Panel
    readonly assignedPeoplePanel: AssignedPeoplePanel;

    // Save section
    readonly saveButton: Locator;
    readonly cancelButton: Locator;
    readonly errorMessage: Locator;

    constructor(container: Locator) {
        this.container = container;

        this.backLink = container.getByTestId('admin.role.back--link');
        this.roleName = container.getByTestId('admin.role.name--text');

        this.privilegesPanel = new PrivilegesPanel(container.locator('#SystemRolePermissions'));
        this.assignedPeoplePanel = new AssignedPeoplePanel(container.locator('#SystemRoleUsers'));

        this.saveButton = container.getByTestId('admin.role.save_panel.save--button');
        this.cancelButton = container.getByTestId('admin.role.save_panel.cancel--link');
        this.errorMessage = container.getByTestId('admin.role.save_panel.error--text');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.roleName).toBeVisible();
    }

    async goBack() {
        await this.backLink.click();
    }

    async save() {
        await this.saveButton.click();
    }

    async cancel() {
        await this.cancelButton.click();
    }

    async getRoleName(): Promise<string> {
        return (await this.roleName.textContent()) ?? '';
    }
}

class PrivilegesPanel {
    readonly container: Locator;
    readonly title: Locator;
    readonly description: Locator;

    // Permission sections
    readonly about: PermissionSection;
    readonly reporting: PermissionSection;
    readonly userManagement: PermissionSection;
    readonly environment: PermissionSection;
    readonly siteConfiguration: PermissionSection;
    readonly authentication: PermissionSection;
    readonly plugins: PermissionSection;
    readonly integrations: PermissionSection;
    readonly compliance: PermissionSection;
    readonly experimental: PermissionSection;

    constructor(container: Locator) {
        this.container = container;
        this.title = container.getByRole('heading', {name: 'Privileges'});
        this.description = container.getByText('Level of access to the system console.');

        // Permission sections
        this.about = new PermissionSection(container, 'about');
        this.reporting = new PermissionSection(container, 'reporting');
        this.userManagement = new PermissionSection(container, 'user_management');
        this.environment = new PermissionSection(container, 'environment');
        this.siteConfiguration = new PermissionSection(container, 'site');
        this.authentication = new PermissionSection(container, 'authentication');
        this.plugins = new PermissionSection(container, 'plugins');
        this.integrations = new PermissionSection(container, 'integrations');
        this.compliance = new PermissionSection(container, 'compliance');
        this.experimental = new PermissionSection(container, 'experimental');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.title).toBeVisible();
    }
}

class PermissionSection {
    readonly container: Locator;
    readonly row: Locator;
    readonly title: Locator;
    readonly description: Locator;
    readonly subsectionsToggle: Locator;
    readonly dropdownButton: Locator;
    readonly subsectionsContainer: Locator;

    private readonly panelContainer: Locator;
    private readonly sectionName: string;

    /** @param sectionName the permission section, e.g. 'user_management' */
    constructor(panelContainer: Locator, sectionName: string) {
        this.panelContainer = panelContainer;
        this.sectionName = sectionName;

        this.container = panelContainer.getByTestId(`admin.role.section:${sectionName}`);
        // the row holds the section and, when expanded, its subsections
        this.row = panelContainer.getByTestId(`admin.role.permission:${sectionName}`);
        this.title = this.container.getByTestId('admin.role.section.title--text');
        this.description = this.container.getByTestId('admin.role.section.description--text');
        this.subsectionsToggle = this.container.getByTestId('admin.role.section.subsections_toggle--button');
        // Use the dropdown button ID which is more reliable
        this.dropdownButton = panelContainer.page().locator(`#systemRolePermissionDropdown${this.sectionName}`);
        this.subsectionsContainer = this.row.getByTestId('admin.role.permission.subsections');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Get the current permission value (e.g., "Can edit", "Read only", "No access", "Mixed access")
     */
    async getPermissionValue(): Promise<string> {
        return (await this.dropdownButton.getByTestId('admin.role.section.access--text').textContent()) ?? '';
    }

    /**
     * Set permission for this section
     * @param permission - "Can edit", "Read only", or "No access"
     */
    async setPermission(permission: 'Can edit' | 'Read only' | 'No access') {
        await expect(this.dropdownButton).toBeVisible();
        await this.dropdownButton.click();

        // Wait for the MenuWrapper to have --open class which indicates menu is open
        const menuWrapper = this.dropdownButton.locator('xpath=ancestor::div[contains(@class, "MenuWrapper")]');
        await expect(menuWrapper).toHaveClass(/MenuWrapper--open/);

        // Find the menu items and click the one matching the permission
        const menuItem = menuWrapper.getByRole('menuitem').filter({hasText: permission});
        await expect(menuItem).toBeVisible();
        await menuItem.click();

        // Wait for menu to close
        await expect(menuWrapper).not.toHaveClass(/MenuWrapper--open/);
    }

    /**
     * Expand subsections if they are collapsed
     */
    async expandSubsections() {
        const hasToggle = await this.subsectionsToggle.isVisible();
        if (!hasToggle) {
            return;
        }

        const buttonText = await this.subsectionsToggle.textContent();
        if (buttonText?.includes('Show')) {
            await this.subsectionsToggle.click();
            // Wait for subsections to be visible
            await expect(this.subsectionsContainer).toBeVisible();
        }
    }

    /**
     * Collapse subsections if they are expanded
     */
    async collapseSubsections() {
        const hasToggle = await this.subsectionsToggle.isVisible();
        if (!hasToggle) {
            return;
        }

        const buttonText = await this.subsectionsToggle.textContent();
        if (buttonText?.includes('Hide')) {
            await this.subsectionsToggle.click();
        }
    }

    /**
     * Check if subsections are visible
     */
    async hasSubsections(): Promise<boolean> {
        return this.subsectionsToggle.isVisible();
    }

    /**
     * Get a subsection by its name within this section
     * @param subsectionName - e.g. "team_statistics" for the "reporting_team_statistics" subsection
     */
    getSubsection(subsectionName: string): PermissionSubsection {
        return new PermissionSubsection(this.panelContainer, `${this.sectionName}_${subsectionName}`);
    }

    // Reporting subsections shortcuts
    get siteStatistics() {
        return this.getSubsection('site_statistics');
    }
    get teamStatistics() {
        return this.getSubsection('team_statistics');
    }
    get serverLogs() {
        return this.getSubsection('server_logs');
    }

    // User Management subsections shortcuts
    get users() {
        return this.getSubsection('users');
    }
    get groups() {
        return this.getSubsection('groups');
    }
    get teams() {
        return this.getSubsection('teams');
    }
    get channels() {
        return this.getSubsection('channels');
    }
    get permissions() {
        return this.getSubsection('permissions');
    }
    get systemRoles() {
        return this.getSubsection('system_roles');
    }
}

class PermissionSubsection {
    readonly container: Locator;
    readonly title: Locator;
    readonly description: Locator;
    readonly dropdownButton: Locator;

    private readonly sectionName: string;

    /** @param sectionName the subsection, e.g. 'user_management_teams' */
    constructor(panelContainer: Locator, sectionName: string) {
        this.container = panelContainer.getByTestId(`admin.role.section:${sectionName}`);
        this.title = this.container.getByTestId('admin.role.section.title--text');
        this.description = this.container.getByTestId('admin.role.section.description--text');
        this.sectionName = sectionName;
        // Use the dropdown button ID which is more reliable
        this.dropdownButton = panelContainer.page().locator(`#systemRolePermissionDropdown${this.sectionName}`);
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Get the current permission value (e.g., "Can edit", "Read only", "No access")
     */
    async getPermissionValue(): Promise<string> {
        return (await this.dropdownButton.getByTestId('admin.role.section.access--text').textContent()) ?? '';
    }

    /**
     * Set permission for this subsection
     * @param permission - "Can edit", "Read only", or "No access"
     */
    async setPermission(permission: 'Can edit' | 'Read only' | 'No access') {
        // Wait for subsection to be visible
        await this.toBeVisible();

        // Click the dropdown button to open the menu
        await expect(this.dropdownButton).toBeVisible();
        await this.dropdownButton.click();

        // Wait for the MenuWrapper to have --open class which indicates menu is open
        const menuWrapper = this.dropdownButton.locator('xpath=ancestor::div[contains(@class, "MenuWrapper")]');
        await expect(menuWrapper).toHaveClass(/MenuWrapper--open/);

        // Find the menu items and click the one matching the permission
        const menuItem = menuWrapper.getByRole('menuitem').filter({hasText: permission});
        await expect(menuItem).toBeVisible();
        await menuItem.click();

        // Wait for menu to close
        await expect(menuWrapper).not.toHaveClass(/MenuWrapper--open/);
    }
}

class AssignedPeoplePanel {
    readonly container: Locator;
    readonly title: Locator;
    readonly description: Locator;
    readonly addPeopleButton: Locator;
    readonly searchInput: Locator;
    readonly userRows: Locator;
    readonly paginationInfo: Locator;
    readonly previousPageButton: Locator;
    readonly nextPageButton: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.title = container.getByRole('heading', {name: 'Assigned People'});
        this.description = container.getByText('List of people assigned to this system role.');
        this.addPeopleButton = container.getByRole('button', {name: 'Add People'});
        this.searchInput = container.getByTestId('admin.role.users.search--textbox');

        // each row is `admin.role.users.row:<user id>`; its cells are `admin.role.users.row.cell:<column>`
        this.userRows = container
            .getByTestId('admin.role.users.rows')
            .locator('[data-testid^="admin.role.users.row:"]');
        this.paginationInfo = container.getByTestId('admin.role.users.footer.pagination--text');
        this.previousPageButton = container.getByTestId('admin.role.users.footer.previous--button');
        this.nextPageButton = container.getByTestId('admin.role.users.footer.next--button');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.title).toBeVisible();
    }

    async clickAddPeople() {
        await this.addPeopleButton.click();
    }

    async searchUsers(searchTerm: string) {
        await this.searchInput.fill(searchTerm);
    }

    async clearSearch() {
        await this.searchInput.clear();
    }

    async getUserCount(): Promise<number> {
        return this.userRows.count();
    }

    /**
     * Get a user row by index (0-based)
     */
    getUserRowByIndex(index: number): AssignedUserRow {
        return new AssignedUserRow(this.userRows.nth(index));
    }

    /**
     * Get a user row by username
     */
    getUserRowByUsername(username: string): AssignedUserRow {
        const row = this.userRows.filter({hasText: username});
        return new AssignedUserRow(row);
    }
}

class AssignedUserRow {
    readonly container: Locator;
    readonly avatar: Locator;
    readonly name: Locator;
    readonly email: Locator;
    readonly removeLink: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.avatar = container.locator('img').first();
        this.name = container.getByTestId('admin.role.users.row.display_name--text');
        this.email = container.getByTestId('admin.role.users.row.email--text');
        this.removeLink = container.getByTestId('admin.role.users.row.remove--button');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async getName(): Promise<string> {
        return (await this.name.textContent()) ?? '';
    }

    async getEmail(): Promise<string> {
        return (await this.email.textContent()) ?? '';
    }

    async remove() {
        await this.removeLink.click();
    }
}

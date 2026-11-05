// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

import UserDetail from '../user_detail';

import {ColumnToggleMenu, DateRangeMenu, FilterMenu, FilterPopover} from './menus';
import {ManageRolesModal, ResetPasswordModal, UpdateEmailModal} from './modals';
import {UsersTable, waitForUsersReportResponse} from './users_table';

import {ConfirmModal} from '@/ui/components/system_console/base_modal';

// Re-export sub-components for external use
export {ColumnToggleMenu, DateRangeMenu, FilterMenu, FilterPopover} from './menus';
export {ManageRolesModal, ResetPasswordModal, UpdateEmailModal} from './modals';
export {UserActionMenu} from './user_action_menu';
export {UserRow, UsersTable} from './users_table';

/**
 * System Console -> User Management -> Users
 */
export default class Users {
    readonly container: Locator;
    private readonly page;

    // User Detail page (accessed by clicking on a user row)
    readonly userDetail: UserDetail;

    // Modals (opened from user actions)
    readonly confirmModal: ConfirmModal;
    readonly manageRolesModal: ManageRolesModal;
    readonly resetPasswordModal: ResetPasswordModal;
    readonly updateEmailModal: UpdateEmailModal;

    // Header
    readonly header: Locator;
    readonly revokeAllSessionsButton: Locator;

    // Filters section
    readonly searchInput: Locator;
    readonly filtersButton: Locator;
    readonly columnToggleMenuButton: Locator;
    readonly dateRangeSelectorMenuButton: Locator;
    readonly exportButton: Locator;

    // Loading indicator
    readonly loadingSpinner: Locator;

    // Table
    readonly usersTable: UsersTable;

    // Menus and Popovers (populated from page-level locators)
    readonly columnToggleMenu: ColumnToggleMenu;
    readonly filterPopover: FilterPopover;
    readonly roleFilterMenu: FilterMenu;
    readonly statusFilterMenu: FilterMenu;
    readonly dateRangeMenu: DateRangeMenu;

    // Pagination
    readonly paginationInfo: Locator;
    readonly previousPageButton: Locator;
    readonly nextPageButton: Locator;
    readonly rowsPerPageSelector: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.page = container.page();

        this.userDetail = new UserDetail(container);

        // Modals
        this.confirmModal = new ConfirmModal(this.page.locator('#confirmModal'));
        this.manageRolesModal = new ManageRolesModal(this.page.locator('#manageRolesModal'));
        this.resetPasswordModal = new ResetPasswordModal(this.page.locator('#resetPasswordModal'));
        this.updateEmailModal = new UpdateEmailModal(this.page.locator('#resetEmailModal'));

        this.header = container.getByText('Mattermost Users', {exact: true});
        this.revokeAllSessionsButton = container.getByTestId('admin.users.revoke_all_sessions--button');

        this.searchInput = container.getByTestId('admin.users.search--textbox');
        this.filtersButton = container.getByTestId('admin.users.filters--button');
        this.columnToggleMenuButton = container.getByTestId('admin.users.columns--button');
        this.dateRangeSelectorMenuButton = container.getByTestId('admin.users.date_range--button');
        this.exportButton = container.getByTestId('admin.users.export--button');

        this.loadingSpinner = container.getByText('Loading');

        this.usersTable = new UsersTable(container.locator('#systemUsersTable'));

        this.columnToggleMenu = new ColumnToggleMenu(this.page.locator('#systemUsersColumnTogglerMenu'));
        this.filterPopover = new FilterPopover(this.page.getByTestId('admin.users.filters'));
        this.roleFilterMenu = new FilterMenu(this.page.getByTestId('admin.users.filters.role.menu'));
        this.statusFilterMenu = new FilterMenu(this.page.getByTestId('admin.users.filters.status.menu'));
        this.dateRangeMenu = new DateRangeMenu(this.page.locator('#systemUsersDateRangeSelectorMenu'));

        const footer = container.getByTestId('admin.users.table.footer');
        this.paginationInfo = footer.getByTestId('admin.users.table.footer.pagination--text');
        this.previousPageButton = footer.getByTestId('admin.users.table.footer.previous--button');
        this.nextPageButton = footer.getByTestId('admin.users.table.footer.next--button');
        this.rowsPerPageSelector = footer.getByTestId('admin.users.table.footer.page_size').getByRole('combobox');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.header).toBeVisible();
    }

    /**
     * Wait for loading to complete
     */
    async isLoadingComplete() {
        await expect(this.loadingSpinner).toHaveCount(0);
    }

    /**
     * Search for users by typing in the search input
     */
    async searchUsers(searchTerm: string) {
        const responsePromise = waitForUsersReportResponse(this.page, searchTerm);
        await this.searchInput.fill(searchTerm);
        // SystemUsersSearch debounces dispatch by 500ms before fetching.
        await responsePromise;
        await expect(this.usersTable.getColumnHeader('User details')).toBeEnabled();
    }

    async openUserActions(searchTerm: string) {
        await this.searchUsers(searchTerm);
        const row = await this.usersTable.getRowByUsername(searchTerm);
        return row.openActionMenu();
    }

    /**
     * Clear the search input
     */
    async clearSearch() {
        await this.searchInput.clear();
    }

    /**
     * Get the current filter count from the Filters button
     */
    async getFilterCount(): Promise<number> {
        const buttonText = await this.filtersButton.textContent();
        const match = buttonText?.match(/Filters \((\d+)\)/);
        return match ? parseInt(match[1], 10) : 0;
    }

    /**
     * Open the column toggle menu
     */
    async openColumnToggleMenu(): Promise<ColumnToggleMenu> {
        await expect(this.columnToggleMenuButton).toBeVisible();
        await this.columnToggleMenuButton.click();
        await this.columnToggleMenu.toBeVisible();
        return this.columnToggleMenu;
    }

    /**
     * Open the filter popover
     */
    async openFilterPopover(): Promise<FilterPopover> {
        await expect(this.filtersButton).toBeVisible();
        await this.filtersButton.click();
        await this.filterPopover.toBeVisible();
        return this.filterPopover;
    }

    /**
     * Open the date range selector menu
     */
    async openDateRangeSelectorMenu(): Promise<DateRangeMenu> {
        await expect(this.dateRangeSelectorMenuButton).toBeVisible();
        await this.dateRangeSelectorMenuButton.click();
        await this.dateRangeMenu.toBeVisible();
        return this.dateRangeMenu;
    }

    /**
     * Click the Export button
     */
    async clickExport() {
        await this.exportButton.click();
    }

    /**
     * Click Revoke All Sessions button
     */
    async clickRevokeAllSessions() {
        await this.revokeAllSessionsButton.click();
    }

    /**
     * Go to next page
     */
    async goToNextPage() {
        await this.nextPageButton.click();
    }

    /**
     * Go to previous page
     */
    async goToPreviousPage() {
        await this.previousPageButton.click();
    }

    /**
     * Get the pagination info text (e.g., "Showing 1 - 10 of 212 users")
     */
    async getPaginationInfo(): Promise<string> {
        return (await this.paginationInfo.textContent()) ?? '';
    }

    /**
     * Get the total user count from pagination info
     */
    async getTotalUserCount(): Promise<number> {
        const text = await this.getPaginationInfo();
        const match = text.match(/of (\d+) users/);
        return match ? parseInt(match[1], 10) : 0;
    }
}

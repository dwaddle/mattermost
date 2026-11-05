// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect} from '@playwright/test';
import type {Locator, Page} from '@playwright/test';

import {UserActionMenu} from './user_action_menu';

const USERS_REPORT_RESPONSE_TIMEOUT_MS = 10_000;

/**
 * Resolves when GET /api/v4/reports/users completes. Start this promise before the
 * action that triggers the fetch (click, search, etc.) so Playwright does not sit
 * on the timeout when the response already finished.
 */
export function waitForUsersReportResponse(page: Page, searchTerm?: string) {
    return page.waitForResponse(
        (response) => {
            if (
                !response.url().includes('/api/v4/reports/users') ||
                response.url().includes('/count') ||
                response.request().method() !== 'GET' ||
                !response.ok()
            ) {
                return false;
            }
            if (searchTerm === undefined) {
                return true;
            }
            return new URL(response.url()).searchParams.get('search_term') === searchTerm;
        },
        {timeout: USERS_REPORT_RESPONSE_TIMEOUT_MS},
    );
}

function expectedSortDirection(previousSort: string | null): 'ascending' | 'descending' {
    if (previousSort === 'ascending') {
        return 'descending';
    }
    return 'ascending';
}

/**
 * Users table component
 */
export class UsersTable {
    readonly container: Locator;
    readonly headerRow: Locator;
    readonly bodyRows: Locator;

    // Column headers
    readonly userDetailsHeader: Locator;
    readonly emailHeader: Locator;
    readonly memberSinceHeader: Locator;
    readonly lastLoginHeader: Locator;
    readonly lastActivityHeader: Locator;
    readonly lastPostHeader: Locator;
    readonly daysActiveHeader: Locator;
    readonly messagesPostedHeader: Locator;
    readonly channelCountHeader: Locator;
    readonly actionsHeader: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.headerRow = container.getByTestId('admin.users.table.head');
        this.bodyRows = container.getByTestId(/^admin\.users\.table\.row:/);

        // Column headers
        this.userDetailsHeader = container.getByTestId('admin.users.table.head.column:usernameColumn');
        this.emailHeader = container.getByTestId('admin.users.table.head.column:emailColumn');
        this.memberSinceHeader = container.getByTestId('admin.users.table.head.column:createAtColumn');
        this.lastLoginHeader = container.getByTestId('admin.users.table.head.column:lastLoginColumn');
        this.lastActivityHeader = container.getByTestId('admin.users.table.head.column:lastStatusAtColumn');
        this.lastPostHeader = container.getByTestId('admin.users.table.head.column:lastPostDateColumn');
        this.daysActiveHeader = container.getByTestId('admin.users.table.head.column:daysActiveColumn');
        this.messagesPostedHeader = container.getByTestId('admin.users.table.head.column:totalPostsColumn');
        this.channelCountHeader = container.getByTestId('admin.users.table.head.column:channelCountColumn');
        this.actionsHeader = container.getByTestId('admin.users.table.head.column:actionsColumn');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Get a user row by index (0-based)
     */
    getRowByIndex(index: number): UserRow {
        return new UserRow(this.bodyRows.nth(index), index);
    }

    /**
     * Get a user row by exact username, since the search is a partial LIKE match and can
     * return more than one row.
     */
    async getRowByUsername(username: string): Promise<UserRow> {
        const count = await this.bodyRows.count();
        for (let index = 0; index < count; index++) {
            const row = this.getRowByIndex(index);
            const text = (await row.userName.textContent())?.trim();
            if (text === username) {
                return row;
            }
        }
        throw new Error(`No user row found for username "${username}"`);
    }

    /**
     * Get a column header by display name
     */
    getColumnHeader(columnName: string): Locator {
        const headerMap: Record<string, Locator> = {
            'User details': this.userDetailsHeader,
            Email: this.emailHeader,
            'Member since': this.memberSinceHeader,
            'Last login': this.lastLoginHeader,
            'Last activity': this.lastActivityHeader,
            'Last post': this.lastPostHeader,
            'Days active': this.daysActiveHeader,
            'Messages posted': this.messagesPostedHeader,
            'Channel count': this.channelCountHeader,
            Actions: this.actionsHeader,
        };
        const header = headerMap[columnName];
        if (!header) {
            throw new Error(`Unknown column: ${columnName}`);
        }
        return header;
    }

    /**
     * Click on a column header to sort by that column
     */
    async clickSortOnColumn(columnName: string) {
        const header = this.getColumnHeader(columnName);
        await header.click();
    }

    /**
     * Click on a sortable column header and wait for sort to complete
     * @param columnName - The display name of the column
     * @returns The new sort direction after clicking
     */
    async sortByColumn(columnName: string): Promise<'ascending' | 'descending'> {
        const header = this.getColumnHeader(columnName);
        await expect(header).toBeEnabled();

        const previousSort = await header.getAttribute('aria-sort');
        const expectedSort = expectedSortDirection(previousSort);

        await Promise.all([waitForUsersReportResponse(this.container.page()), header.click()]);

        // aria-sort updates with Redux; disabled={loading} on the header clears when the fetch ends
        await expect(header).toHaveAttribute('aria-sort', expectedSort);
        await expect(header).toBeEnabled();

        return expectedSort;
    }

    /**
     * Read all visible email cells in one pass (avoids torn reads while the table re-renders).
     */
    async getVisibleEmails(): Promise<string[]> {
        const texts = await this.bodyRows.getByTestId('admin.users.table.row.cell:emailColumn').allTextContents();
        return texts.map((text) => text.trim()).filter(Boolean);
    }
}

/**
 * A single row in the users table
 */
export class UserRow {
    readonly container: Locator;
    readonly index: number;

    // Cells
    readonly userDetailsCell: Locator;
    readonly emailCell: Locator;
    readonly memberSinceCell: Locator;
    readonly lastLoginCell: Locator;
    readonly lastActivityCell: Locator;
    readonly lastPostCell: Locator;
    readonly daysActiveCell: Locator;
    readonly messagesPostedCell: Locator;
    readonly channelCountCell: Locator;
    readonly actionsCell: Locator;

    // User details components
    readonly profilePicture: Locator;
    readonly displayName: Locator;
    readonly userName: Locator;

    // Action menu button
    readonly actionMenuButton: Locator;

    // Action menu (populated after opening)
    private readonly actionMenu: UserActionMenu;

    constructor(container: Locator, index: number) {
        this.container = container;
        this.index = index;

        this.userDetailsCell = container.getByTestId('admin.users.table.row.cell:usernameColumn');
        this.emailCell = container.getByTestId('admin.users.table.row.cell:emailColumn');
        this.memberSinceCell = container.getByTestId('admin.users.table.row.cell:createAtColumn');
        this.lastLoginCell = container.getByTestId('admin.users.table.row.cell:lastLoginColumn');
        this.lastActivityCell = container.getByTestId('admin.users.table.row.cell:lastStatusAtColumn');
        this.lastPostCell = container.getByTestId('admin.users.table.row.cell:lastPostDateColumn');
        this.daysActiveCell = container.getByTestId('admin.users.table.row.cell:daysActiveColumn');
        this.messagesPostedCell = container.getByTestId('admin.users.table.row.cell:totalPostsColumn');
        this.channelCountCell = container.getByTestId('admin.users.table.row.cell:channelCountColumn');
        this.actionsCell = container.getByTestId('admin.users.table.row.cell:actionsColumn');

        this.profilePicture = this.userDetailsCell.getByTestId('admin.users.table.row.picture');
        this.displayName = this.userDetailsCell.getByTestId('admin.users.table.row.display_name--text');
        this.userName = this.userDetailsCell.getByTestId('admin.users.table.row.username--text');

        this.actionMenuButton = this.actionsCell.getByTestId('admin.users.table.row.actions--button');

        this.actionMenu = new UserActionMenu(container.page().locator(`#actionMenu-systemUsersTable-${index}`));
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Click on the row to view user details
     */
    async click() {
        await this.container.click();
    }

    /**
     * Get the email
     */
    async getEmail(): Promise<string> {
        return (await this.emailCell.textContent()) ?? '';
    }

    /**
     * Click the action menu button to open the actions dropdown
     * Returns the action menu for further interactions
     */
    async openActionMenu(): Promise<UserActionMenu> {
        await this.actionMenuButton.click();
        await this.actionMenu.toBeVisible();
        return this.actionMenu;
    }
}

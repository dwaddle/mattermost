// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * User action menu that appears when clicking the action button on a user row
 */
export class UserActionMenu {
    readonly container: Locator;

    constructor(container: Locator) {
        this.container = container;
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * Get a menu item by text
     */
    getMenuItem(text: string): Locator {
        return this.container.getByText(text, {exact: true});
    }

    /**
     * Click a menu item by text
     */
    async clickMenuItem(text: string) {
        const item = this.getMenuItem(text);
        await item.click();
    }

    async clickDeactivate() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.deactivate--menuitem').click();
    }

    async clickActivate() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.activate--menuitem').click();
    }

    async clickManageRoles() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.manage_roles--menuitem').click();
    }

    async clickManageTeams() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.manage_teams--menuitem').click();
    }

    async clickResetPassword() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.reset_password--menuitem').click();
    }

    async clickUpdateEmail() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.update_email--menuitem').click();
    }

    async clickRevokeSessions() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.revoke_sessions--menuitem').click();
    }

    async clickRemoveMfa() {
        await this.container.getByTestId('admin.users.table.row.actions_menu.remove_mfa--menuitem').click();
    }

    async expectRemoveMfaHidden() {
        await expect(this.container.getByTestId('admin.users.table.row.actions_menu.remove_mfa--menuitem')).toHaveCount(
            0,
        );
    }
}

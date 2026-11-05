// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import {expect, generated, type App, type PlaywrightExtended} from '@mattermost/playwright-lib';

/**
 * System Console > Users on the generated page objects: the search box, the table's rows keyed by user id with their
 * cells by column, the columns, date range and filters menus, the row actions menu and its dialogs.
 */

/** Logs the admin in and opens System Console > Users, waiting for the table to load. */
export async function openUsers(pw: PlaywrightExtended, admin: UserProfile): Promise<App> {
    const {app} = await pw.testBrowser.login(admin);
    await app.page.goto(`${generated.AdminConsolePage.path()}/user_management/users`);
    await expect(app.admin.users.searchTextbox.locator).toBeVisible();
    await expect(app.admin.users.table.rowItems.first()).toBeVisible();
    return app;
}

/** Searches the users table (the box debounces) and waits for the table to show `expected`. */
export async function search(app: App, term: string, expected: Pick<UserProfile, 'id'>) {
    await app.admin.users.fillSearchTextbox(term);
    await expect(app.admin.users.table.row(expected.id).locator).toBeVisible();
}

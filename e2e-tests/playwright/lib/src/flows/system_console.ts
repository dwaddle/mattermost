// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import type {TestBrowser} from '@/browser_context';
import type {App} from '@/ui/generated';

/**
 * Logs the admin in and opens System Console > Users: `const app = await openSystemUsers(pw, adminUser)`. Returns
 * once the search box and the table's first row show.
 */
export async function openSystemUsers(pw: {testBrowser: TestBrowser}, admin: UserProfile): Promise<App> {
    const {app} = await pw.testBrowser.login(admin);
    await app.adminConsolePage.goto({section: 'user_management/users'});
    await app.admin.users.searchTextbox.locator.waitFor();
    await app.admin.users.table.rowItems.first().waitFor();
    return app;
}

/** Searches the System Console users table (the box debounces) and returns once `expected`'s row shows. */
export async function searchSystemUsers(app: App, term: string, expected: Pick<UserProfile, 'id'>): Promise<void> {
    await app.admin.users.fillSearchTextbox(term);
    await app.admin.users.table.row(expected.id).locator.waitFor();
}

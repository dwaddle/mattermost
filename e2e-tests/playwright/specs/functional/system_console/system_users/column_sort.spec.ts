// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, type App} from '@mattermost/playwright-lib';

import {openUsers} from './support';

// Written on the generated page objects: System Console > Users' table header columns by column id (their sort state)
// and the rows' email cells, read in document order.

/** The emails the table shows, in row order (up to 40 rows). */
async function visibleEmails(app: App) {
    const {table} = app.admin.users;
    const keys = (await table.rowKeys()).slice(0, 40);
    const emails = await Promise.all(keys.map((key) => table.row(key).cell('emailColumn').locator.textContent()));
    return emails.map((email) => (email ?? '').trim()).filter(Boolean);
}

/** Clicks a sortable column's header and returns the direction it settles on. */
async function sortBy(app: App, column: string): Promise<'ascending' | 'descending'> {
    const header = app.admin.users.table.head.column(column).locator;
    await expect(header).toBeEnabled();
    const previous = await header.getAttribute('aria-sort');
    const expected = previous === 'ascending' ? 'descending' : 'ascending';
    await header.click();

    // aria-sort updates with Redux; the header is disabled while the fetch runs
    await expect(header).toHaveAttribute('aria-sort', expected);
    await expect(header).toBeEnabled();
    return expected;
}

/** Checks the visible emails are sorted in the direction (the table can still be refetching rows other workers add). */
async function expectSortedEmails(app: App, direction: 'ascending' | 'descending') {
    await expect(async () => {
        const emails = await visibleEmails(app);
        expect(emails.length).toBeGreaterThan(3);
        const sorted = [...emails].sort((a, b) => a.localeCompare(b, undefined, {ignorePunctuation: true}));
        if (direction === 'descending') {
            sorted.reverse();
        }
        expect(emails).toEqual(sorted);
    }).toPass({timeout: 120_000});
}

test.describe('System Console - Users table sorting', () => {
    test.describe.configure({mode: 'serial'});

    test('MM-T5523-1 Sortable columns should sort the list when clicked', async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        // # Create 10 random users
        for (let i = 0; i < 10; i++) {
            await adminClient.createUser(await pw.random.user(), '', '');
        }

        // # Log in as admin and open System Console > Users
        const app = await openUsers(pw, adminUser);

        // * Verify that 'Email' column is sortable
        const emailHeader = app.admin.users.table.head.column('emailColumn').locator;
        await expect(emailHeader).toBeVisible();
        await expect(emailHeader).toHaveAttribute('aria-sort');

        // # Sort by email
        const direction = await sortBy(app, 'emailColumn');

        // * Verify that emails are sorted in that direction
        await expectSortedEmails(app, direction);

        // # Sort by email again, toggling the direction
        const reversed = await sortBy(app, 'emailColumn');

        // * Verify that the sort direction has toggled and the emails follow it
        expect(reversed).not.toEqual(direction);
        await expectSortedEmails(app, reversed);
    });

    test('MM-T5523-2 Non sortable columns should not sort the list when clicked', async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        // # Create 10 random users
        for (let i = 0; i < 10; i++) {
            await adminClient.createUser(await pw.random.user(), '', '');
        }

        // # Log in as admin and open System Console > Users
        const app = await openUsers(pw, adminUser);

        // * Verify that 'Last login' column is not sortable
        const lastLoginHeader = app.admin.users.table.head.column('lastLoginColumn').locator;
        await expect(lastLoginHeader).toBeVisible();
        await expect(lastLoginHeader).not.toHaveAttribute('aria-sort');

        // # Store the first row's email without sorting
        const before = (await visibleEmails(app))[0];

        // # Try to sort by clicking the 'Last login' column header
        await lastLoginHeader.click();

        // * Verify that the first row's email is still the same
        expect((await visibleEmails(app))[0]).toEqual(before);
    });
});

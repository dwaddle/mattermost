// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type App, expect, openSystemUsers, searchSystemUsers, test} from '@mattermost/playwright-lib';

// Written on the generated page objects: System Console > Users' columns menu (its items by column id), the table's
// header columns by column id, and a row's cells by column id.

/** Toggles columns from the columns menu, closing it after. */
async function toggleColumns(app: App, ...columns: string[]) {
    const menu = await app.admin.users.clickColumnsButton();
    for (const column of columns) {
        await menu.column(column).click();
    }
    await app.page.keyboard.press('Escape');
    await expect(menu.columnItems.first()).not.toBeVisible();
}

test('MM-T5523-3 Should list the column names with checkboxes in the correct order', async ({pw}) => {
    const {adminUser} = await pw.initSetup();

    // # Log in as admin, open System Console > Users and its columns menu
    const app = await openSystemUsers(pw, adminUser);
    const menu = await app.admin.users.clickColumnsButton();

    // * Verify menu items exist in the correct order
    await expect(menu.columnItems).toHaveCount(10);
    expect(await menu.columnItems.allInnerTexts()).toEqual([
        'User details',
        'Email',
        'Member since',
        'Last login',
        'Last activity',
        'Last post',
        'Days active',
        'Messages posted',
        'Channel count',
        'Actions',
    ]);
});

test('MM-T5523-4 Should allow certain columns to be checked and others to be disabled', async ({pw}) => {
    const {adminUser} = await pw.initSetup();

    // # Log in as admin, open System Console > Users and its columns menu
    const app = await openSystemUsers(pw, adminUser);
    const menu = await app.admin.users.clickColumnsButton();

    // * Verify that 'User details' and 'Actions' are disabled
    await expect(menu.column('usernameColumn').locator).toBeDisabled();
    await expect(menu.column('actionsColumn').locator).toBeDisabled();

    // * Verify that 'Email' however is enabled
    await expect(menu.column('emailColumn').locator).toBeEnabled();
});

test('MM-T5523-5 Should show/hide the columns which are toggled on/off', async ({pw}) => {
    const {adminUser} = await pw.initSetup();

    // # Log in as admin and open System Console > Users
    const app = await openSystemUsers(pw, adminUser);
    const {head} = app.admin.users.table;
    await expect(head.column('emailColumn').locator).toBeVisible();
    await expect(head.column('lastLoginColumn').locator).toBeVisible();

    // # Uncheck the Email and Last login columns to hide them
    await toggleColumns(app, 'emailColumn', 'lastLoginColumn');

    // * Verify that Email column and Last login column are hidden
    await expect(head.column('usernameColumn').locator).toBeVisible();
    await expect(head.column('emailColumn').locator).not.toBeVisible();
    await expect(head.column('lastLoginColumn').locator).not.toBeVisible();

    // # Check the Email column to show it again
    await toggleColumns(app, 'emailColumn');

    // * Verify that Email column is visible again but Last login is still hidden
    await expect(head.column('emailColumn').locator).toBeVisible();
    await expect(head.column('lastLoginColumn').locator).not.toBeVisible();
});

/**
 * @objective Verify that the Channel count column displays a numeric value for a user with known channel memberships
 *
 * @precondition
 * A guest user exists with exactly two channel memberships
 */
test(
    'displays numeric channel count value when Channel count column is enabled',
    {tag: '@system_users'},
    async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        // # Create a guest in exactly two channels
        const ch1Name = `count-ch1-${pw.random.id()}`;
        const channel1 = await adminClient.createChannel({
            team_id: team.id,
            name: ch1Name.toLowerCase().replace(/[^a-z0-9-]/g, ''),
            display_name: ch1Name,
            type: 'O',
        });
        const ch2Name = `count-ch2-${pw.random.id()}`;
        const channel2 = await adminClient.createChannel({
            team_id: team.id,
            name: ch2Name.toLowerCase().replace(/[^a-z0-9-]/g, ''),
            display_name: ch2Name,
            type: 'O',
        });

        const guestUser = await adminClient.createUser(await pw.random.user(), '', '');
        await adminClient.updateUserRoles(guestUser.id, 'system_guest');
        await adminClient.addToTeam(team.id, guestUser.id);
        await adminClient.addToChannel(guestUser.id, channel1.id);
        await adminClient.addToChannel(guestUser.id, channel2.id);

        // # Log in as admin, open System Console > Users and show the Channel count column
        const app = await openSystemUsers(pw, adminUser);
        await toggleColumns(app, 'channelCountColumn');

        // * The column shows
        await expect(app.admin.users.table.head.column('channelCountColumn').locator).toBeVisible();

        // # Search for the guest
        await searchSystemUsers(app, guestUser.email, guestUser);

        // * Verify the guest's channel count is 2
        await expect(app.admin.users.table.row(guestUser.id).cell('channelCountColumn').locator).toHaveText('2');
    },
);

/**
 * @objective Verify that the Channel count column can be toggled on and off
 */
test('toggles Channel count column visibility on and off', {tag: '@system_users'}, async ({pw}) => {
    const {adminUser} = await pw.initSetup();

    // # Log in as admin and open System Console > Users
    const app = await openSystemUsers(pw, adminUser);
    const column = app.admin.users.table.head.column('channelCountColumn').locator;

    // # Show the Channel count column
    await toggleColumns(app, 'channelCountColumn');

    // * Verify it is visible
    await expect(column).toBeVisible();

    // # Hide it again
    await toggleColumns(app, 'channelCountColumn');

    // * Verify it is hidden, while the others show
    await expect(app.admin.users.table.head.column('emailColumn').locator).toBeVisible();
    await expect(column).not.toBeVisible();
});

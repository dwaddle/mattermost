// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// ***************************************************************

import {expect, test, Msg} from '@mattermost/playwright-lib';

import {
    addAttribute,
    cleanupCustomBoardFields,
    openBoardAttributes,
    rowByName,
    save,
    setupBoardAttributesTest,
} from './setup';

test.describe('Board Attributes - row dot menu', {tag: '@board_attributes'}, () => {
    test.afterEach(async () => {
        await cleanupCustomBoardFields();
    });

    test('duplicates a custom attribute via the dot menu — copy gets a (2) suffix and persists', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        let ba = await openBoardAttributes(app);

        // # Add a saved custom attribute
        const original = `Dup_${Date.now()}`;
        await addAttribute(ba, original);
        await save(ba);

        // # Open the row's dot menu and click Duplicate
        const before = await ba.rowKeys();
        const menu = await (await rowByName(ba, adminClient, original)).clickActionsButton();
        await menu.clickDuplicateMenuItem();

        // * A new row appears with the "(2)" suffix
        const copy = `${original} (2)`;
        await expect(ba.rowItems).toHaveCount(before.length + 1);
        const copyKey = (await ba.rowKeys()).find((key) => !before.includes(key))!;
        await expect(ba.row(copyKey).nameTextbox.locator).toHaveValue(copy);

        // # Save and reload
        await save(ba);
        ba = await openBoardAttributes(app);

        // * Both the original and the (2)-suffixed copy persist
        await expect((await rowByName(ba, adminClient, original)).nameTextbox.locator).toHaveValue(original);
        await expect((await rowByName(ba, adminClient, copy)).nameTextbox.locator).toHaveValue(copy);
    });

    test('deletes a saved custom attribute via the confirm modal — row disappears, server reflects', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        const ba = await openBoardAttributes(app);

        // # Add a saved custom attribute
        const name = `Del_${Date.now()}`;
        await addAttribute(ba, name);
        await save(ba);
        const row = await rowByName(ba, adminClient, name);

        // # Open the dot menu, click Delete attribute
        const modal = await (await row.clickActionsButton()).clickDeleteMenuItem();

        // * The confirmation modal appears
        await expect(modal.locator).toContainMessage(Msg.admin.board_attributes.delete_modal.title);

        // # Confirm
        await modal.clickConfirmButton();

        // # Save the delete
        await save(ba);

        // * The row is gone
        await expect(row.locator).toHaveCount(0);

        // * The server no longer lists the attribute
        const fields = await adminClient.getPropertyFields('boards', 'post', {targetType: 'system'});
        expect((fields ?? []).map((f) => f.name)).not.toContain(name);
    });

    test('dismissing the delete-confirm modal keeps the row intact', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        const ba = await openBoardAttributes(app);

        // # Add and save a custom attribute
        const name = `Keep_${Date.now()}`;
        await addAttribute(ba, name);
        await save(ba);
        const row = await rowByName(ba, adminClient, name);

        // # Open dot menu, click Delete, then Cancel the modal
        const modal = await (await row.clickActionsButton()).clickDeleteMenuItem();
        await expect(modal.locator).toBeVisible();
        await modal.clickCancelButton();

        // * Modal is closed
        await expect(modal.locator).not.toBeVisible();

        // * Row is still present
        await expect(row.nameTextbox.locator).toHaveValue(name);

        // * Save remains disabled — no pending changes were committed
        await expect(ba.savePanel.saveButton.locator).toBeDisabled();
    });

    test('Duplicate and Delete items are disabled on protected (seeded) rows', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        const ba = await openBoardAttributes(app);

        // # Open the dot menu on a new custom row
        const custom = await (await addAttribute(ba, `Custom_${Date.now()}`)).clickActionsButton();

        // * Both menu items are enabled there
        await expect(custom.duplicateMenuItem.locator).not.toHaveAttribute('aria-disabled', 'true');
        await expect(custom.deleteMenuItem.locator).not.toHaveAttribute('aria-disabled', 'true');
        await app.page.keyboard.press('Escape');
        await expect(custom.deleteMenuItem.locator).not.toBeVisible();

        // # Open the dot menu on the seeded Status row
        const menu = await (await rowByName(ba, adminClient, 'status')).clickActionsButton();

        // * Both menu items render but are aria-disabled
        await expect(menu.duplicateMenuItem.locator).toHaveAttribute('aria-disabled', 'true');
        await expect(menu.deleteMenuItem.locator).toHaveAttribute('aria-disabled', 'true');
    });
});

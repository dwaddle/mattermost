// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// ***************************************************************

import {AdminType, expect, test} from '@mattermost/playwright-lib';

import {
    addAttribute,
    addOption,
    changeType,
    cleanupCustomBoardFields,
    fieldByName,
    openBoardAttributes,
    optionByName,
    optionsOf,
    renameOption,
    save,
    setupBoardAttributesTest,
} from './setup';

test.describe('Board Attributes - select option values', {tag: '@board_attributes'}, () => {
    test.afterEach(async () => {
        await cleanupCustomBoardFields();
    });

    test('adds options and renames one — persists across reload', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        let ba = await openBoardAttributes(app);

        // # Add a select attribute with three options
        const attrName = `Opts_${Date.now()}`;
        const row = await addAttribute(ba, attrName);
        await changeType(row, AdminType.Select);
        await addOption(row, 'Low');
        await addOption(row, 'Medium');
        await addOption(row, 'High');
        await save(ba);

        // # Rename "Medium" → "Mid" and save
        let field = await fieldByName(adminClient, attrName);
        const savedRow = ba.row(field.id);
        const medium = optionByName(field, 'Medium');
        await renameOption(savedRow, medium.id, 'Mid');
        await expect(savedRow.optionItems).toHaveText(['Low', 'Mid', 'High']);
        await save(ba);

        // * Server reflects the create and rename
        field = await fieldByName(adminClient, attrName);
        const optionNames = optionsOf(field).map((o) => o.name);
        expect(optionNames).toEqual(expect.arrayContaining(['Low', 'Mid', 'High']));
        expect(optionNames).not.toContain('Medium');

        // # Reload
        ba = await openBoardAttributes(app);

        // * Persisted state renders correctly
        for (const option of optionsOf(field)) {
            await expect(ba.row(field.id).option(option).locator).toHaveText(option.name);
        }
    });

    test('deletes an option via the inline X button and persists across reload', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        let ba = await openBoardAttributes(app);

        // # Add a select attribute with two options, save baseline
        const attrName = `Del_${Date.now()}`;
        const row = await addAttribute(ba, attrName);
        await changeType(row, AdminType.Select);
        await addOption(row, 'KeepMe');
        await addOption(row, 'DeleteMe');
        await save(ba);

        // # Delete one option
        let field = await fieldByName(adminClient, attrName);
        const keep = optionByName(field, 'KeepMe');
        const remove = optionByName(field, 'DeleteMe');
        await ba.row(field.id).option(remove).deleteButton.click();
        await expect(ba.row(field.id).option(remove).locator).toHaveCount(0);
        await expect(ba.row(field.id).option(keep).locator).toHaveText('KeepMe');
        await save(ba);

        // * Server reflects the deletion
        field = await fieldByName(adminClient, attrName);
        const optionNames = optionsOf(field).map((o) => o.name);
        expect(optionNames).toContain('KeepMe');
        expect(optionNames).not.toContain('DeleteMe');

        // # Reload
        ba = await openBoardAttributes(app);

        // * Only the kept option renders
        await expect(ba.row(field.id).optionItems).toHaveText(['KeepMe']);
    });

    test('shows an in-menu duplicate-name warning while typing an existing option name', async ({pw}) => {
        const {app} = await setupBoardAttributesTest(pw);
        const ba = await openBoardAttributes(app);

        // # Add a select attribute with two distinct options
        const row = await addAttribute(ba, `Dup_${Date.now()}`);
        await changeType(row, AdminType.Select);
        const alpha = await addOption(row, 'Alpha');
        await addOption(row, 'Beta');

        // # Open Alpha's menu and type a new name
        await row.option({id: alpha}).editButton.click();
        const {optionMenu} = row;
        await optionMenu.fillNameTextbox('Gamma');

        // * No warning shows for a distinct name
        await expect(optionMenu.nameErrorAlert.locator).not.toBeVisible();
        await expect(optionMenu.nameTextbox.locator).toHaveAttribute('aria-invalid', 'false');

        // # Type "Beta"
        await optionMenu.fillNameTextbox('Beta');

        // * In-menu duplicate warning appears
        await expect(optionMenu.nameErrorAlert.locator).toHaveText('A value with this name already exists.');

        // * aria-invalid is set on the input
        await expect(optionMenu.nameTextbox.locator).toHaveAttribute('aria-invalid', 'true');
    });

    test('appends a unique default name when adding multiple unnamed options in a row', async ({pw}) => {
        const {app} = await setupBoardAttributesTest(pw);
        const ba = await openBoardAttributes(app);

        // # Add a select attribute
        const row = await addAttribute(ba, `Auto_${Date.now()}`);
        await changeType(row, AdminType.Select);

        // # Click Add value three times without naming the options
        await row.clickAddValueButton();
        await row.clickAddValueButton();
        await row.clickAddValueButton();

        // * Three default-named option chips appear with auto-incrementing suffixes
        await expect(row.optionItems).toHaveText(['Option 1', 'Option 2', 'Option 3']);
    });
});

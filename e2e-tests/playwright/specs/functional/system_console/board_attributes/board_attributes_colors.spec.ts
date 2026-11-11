// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// ***************************************************************

import {AdminColor, AdminType, expect, test} from '@mattermost/playwright-lib';

import {
    addAttribute,
    addOption,
    changeType,
    cleanupCustomBoardFields,
    closeOptionMenu,
    fieldByName,
    openBoardAttributes,
    optionByName,
    save,
    setupBoardAttributesTest,
} from './setup';

test.describe('Board Attributes - option color picker', {tag: '@board_attributes'}, () => {
    test.afterEach(async () => {
        await cleanupCustomBoardFields();
    });

    test('assigns a color token to an option and the server persists the value', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        const ba = await openBoardAttributes(app);

        // # Add a select attribute with one option, save baseline
        const attrName = `Color_${Date.now()}`;
        const optionName = 'Tagged';
        const row = await addAttribute(ba, attrName);
        await changeType(row, AdminType.Select);
        await addOption(row, optionName);
        await save(ba);

        // # Assign the Green color
        const field = await fieldByName(adminClient, attrName);
        const savedRow = ba.row(field.id);
        await savedRow.option(optionByName(field, optionName)).editButton.click();
        await savedRow.optionMenu.color(AdminColor.Green).click();
        await closeOptionMenu(savedRow);
        await save(ba);

        // * Server reflects the color token
        expect(optionByName(await fieldByName(adminClient, attrName), optionName).color).toBe(AdminColor.Green);
    });

    test('color assignment persists across reload and the picker shows the correct checked state', async ({pw}) => {
        const {adminClient, app} = await setupBoardAttributesTest(pw);
        let ba = await openBoardAttributes(app);

        // # Add a select attribute with one option, save baseline
        const attrName = `Persist_${Date.now()}`;
        const row = await addAttribute(ba, attrName);
        await changeType(row, AdminType.Select);
        await addOption(row, 'Colored');
        await save(ba);

        // # Assign the Red color and save
        const field = await fieldByName(adminClient, attrName);
        const option = optionByName(field, 'Colored');
        await ba.row(field.id).option(option).editButton.click();
        await ba.row(field.id).optionMenu.color(AdminColor.Red).click();
        await closeOptionMenu(ba.row(field.id));
        await save(ba);

        // # Reload
        ba = await openBoardAttributes(app);
        const savedRow = ba.row(field.id);

        // * Chip is still rendered
        await expect(savedRow.option(option).locator).toHaveText('Colored');

        // * The picker reflects the correct checked color
        await savedRow.option(option).editButton.click();
        await expect(savedRow.optionMenu.color(AdminColor.Red).locator).toHaveAttribute('aria-checked', 'true');
        await expect(savedRow.optionMenu.color(AdminColor.Default).locator).toHaveAttribute('aria-checked', 'false');
    });

    test('color picker exposes all nine color tokens', async ({pw}) => {
        const {app} = await setupBoardAttributesTest(pw);
        const ba = await openBoardAttributes(app);

        // # Add a select with one option, open its menu
        const row = await addAttribute(ba, `Picker_${Date.now()}`);
        await changeType(row, AdminType.Select);
        const id = await addOption(row, 'Pick me');
        await row.option({id}).editButton.click();

        // * Every named color token is offered
        const colors = Object.values(AdminColor);
        await expect(row.optionMenu.colorItems).toHaveCount(colors.length);
        for (const color of colors) {
            await expect(row.optionMenu.color(color).locator).toBeVisible();
        }
    });
});

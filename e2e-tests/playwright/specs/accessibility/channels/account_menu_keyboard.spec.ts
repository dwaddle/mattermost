// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import {expect, test, type App} from '@mattermost/playwright-lib';

test('MM-63451 should be able to navigate the account settings menu with the keyboard after opening it with the mouse', async ({
    pw,
}) => {
    // # Create and sign in a new user
    const {user, team} = await pw.initSetup();

    // # Log in a user in new browser context
    const {app, page} = await pw.testBrowser.login(user);

    // # Visit a default channel page
    await app.teamPage.goto({team});
    await expect(app.center.composer.locator).toBeVisible();

    // # Click on the account menu button
    await app.globalHeader.openAccountMenuButton.click();

    await testMenuWithKeyboard(app, page);
});

test('MM-63451 should be able to navigate the account settings menu with the keyboard after opening it with the keyboard', async ({
    pw,
}) => {
    // # Create and sign in a new user
    const {user, team} = await pw.initSetup();

    // # Log in a user in new browser context
    const {app, page} = await pw.testBrowser.login(user);

    // # Visit a default channel page
    await app.teamPage.goto({team});
    await expect(app.center.composer.locator).toBeVisible();

    // # Focus the account menu button
    await app.globalHeader.openAccountMenuButton.focus();
    await expect(app.globalHeader.openAccountMenuButton.locator).toBeFocused();
    await page.keyboard.press('Space');

    await testMenuWithKeyboard(app, page);
});

async function testMenuWithKeyboard(app: App, page: Page) {
    const menu = app.globalHeader.accountMenu;
    const dnd = menu.dndMenu;

    // * Should start focused on the first menu item
    await expect(menu.nameMenuItem.locator).toBeFocused();

    // * Should be able to scroll down through the menu with the keyboard
    await page.keyboard.press('ArrowDown');
    await expect(menu.setCustomStatusMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.onlineMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.awayMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.dndMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.offlineMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.profileMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(menu.logOutMenuItem.locator).toBeFocused();

    // * Should be able to scroll back up through the menu with the keyboard
    await page.keyboard.press('ArrowUp');
    await expect(menu.profileMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menu.offlineMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(menu.dndMenuItem.locator).toBeFocused();

    // * Should be able to move into the submenu by pressing the right arrow
    await page.keyboard.press('ArrowRight');
    await expect(dnd.doNotClearMenuItem.locator).toBeFocused();

    // * Should be able to scroll through the submenu with the keyboard
    await page.keyboard.press('ArrowDown');
    await expect(dnd.thirtyMinutesMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dnd.oneHourMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dnd.twoHoursMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dnd.tomorrowMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await expect(dnd.customMenuItem.locator).toBeFocused();

    // * Should wrap around when you reach the end
    await page.keyboard.press('ArrowDown');
    await expect(dnd.doNotClearMenuItem.locator).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(dnd.customMenuItem.locator).toBeFocused();

    // * Should be able to close the submenu by pressing the left arrow
    await page.keyboard.press('ArrowLeft');
    await expect(menu.dndMenuItem.locator).toBeFocused();

    // * Should be able to close the menu by pressing escape
    await page.keyboard.press('Escape');
    await expect(page.getByRole('menuitem')).toHaveCount(0);

    // * Should be focused back on the menu button
    await expect(app.globalHeader.openAccountMenuButton.locator).toBeFocused();
}

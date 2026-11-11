// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannel, test} from '@mattermost/playwright-lib';

import {closeRootModal, DEMO, expectRootModal} from './support';

test('should open Root Modal from team dropdown main menu', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: 'town-square'});
    const demo = app.plugins.comMattermostDemoPlugin;

    // # Open the team menu: the plugin adds two items, told apart by their labels
    await app.lhs.header.clickOpenTeamMenuButton();
    await expect(app.lhs.teamMenu.pluginItems).toHaveCount(2);
    await expect(demo.mainMenu.demoText.locator).toHaveText('Demo Plugin');

    // # Click "Demo Plugin"
    await demo.mainMenu.demoText.locator.click();

    // * The Root Modal opens, with no "Element clicked" line for the main menu
    await expectRootModal(app);
    await closeRootModal(app);
});

test('should open Root Modal from channel header dropdown More actions', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {adminClient, user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');
    const app = await openChannel(pw, user, {team, channel: 'town-square'});

    // # Open the channel menu and hover "More actions" to show its submenu
    const menu = await app.channelHeader.clickOpenMenuButton();
    await menu.moreActionsMenuItem.locator.hover();

    // # Click the plugin's item in the submenu
    await expect(menu.plugin(DEMO).locator).toBeVisible();
    await menu.plugin(DEMO).locator.hover();
    await menu.plugin(DEMO).click();

    // * The Root Modal opens, naming the channel the menu was opened in
    await expectRootModal(app, townSquare.id);
    await closeRootModal(app);
});

test('should open Sample Confirmation Dialog from team dropdown and respond to Confirm and Cancel', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: 'town-square'});
    const demo = app.plugins.comMattermostDemoPlugin;

    // # Open the team menu and click "Sample Confirmation Dialog"
    await app.lhs.header.clickOpenTeamMenuButton();
    await demo.mainMenu.confirmationDialogText.locator.click();

    // * The dialog opens with its title and Confirm, and no fields
    const form = app.appsForm;
    await expect(form.titleText.locator).toHaveText('Sample Confirmation Dialog');
    await expect(form.cancelButton.locator).toBeVisible();
    await expect(form.submitButton.locator).toHaveText('Confirm');
    await expect(form.fieldItems).toHaveCount(0);

    // # Confirm: the dialog closes and the plugin posts its confirmation
    await form.clickSubmitButton();
    await expect(form.titleText.locator).not.toBeVisible();
    await expect(app.center.postList.locator).toContainText('confirmed an Interactive Dialog');

    // # Reopen the dialog from the team menu and Cancel
    await app.lhs.header.clickOpenTeamMenuButton();
    await demo.mainMenu.confirmationDialogText.locator.click();
    await expect(form.titleText.locator).toHaveText('Sample Confirmation Dialog');
    await form.clickCancelButton();

    // * The dialog closes and the plugin posts the cancellation
    await expect(form.titleText.locator).not.toBeVisible();
    await expect(app.center.postList.locator).toContainText('canceled an Interactive Dialog');
});

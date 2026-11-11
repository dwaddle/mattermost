// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * @objective E2E tests for Team Settings Modal - Unsaved Changes behavior
 * @reference MM-67920
 */

import {expect, Msg, openTeamSettings, test} from '@mattermost/playwright-lib';

test.describe('Team Settings Modal - Unsaved Changes', () => {
    /**
     * MM-67920 Warn on close with unsaved changes
     * @objective Verify unsaved changes warning behavior (warn-once pattern)
     */
    test('MM-67920 Warn on close with unsaved changes', async ({pw}) => {
        // # Set up admin user and login
        const {adminUser, team, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open Team Settings and edit the team name to create unsaved changes
        const settings = await openTeamSettings(app);
        await settings.info.fillNameTextbox(`Modified Team ${pw.random.id()}`);

        // # Try to close modal (first attempt)
        await settings.clickCloseButton();

        // * Verify the unsaved changes warning appears with its Save button, and the modal stays open
        await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.message);
        await expect(settings.savePanel.saveButton.locator).toBeVisible();
        await expect(settings.locator).toBeVisible();

        // # Try to close modal again (second attempt - warn-once behavior)
        await settings.clickCloseButton();

        // * Verify modal closes on second attempt
        await expect(settings.locator).not.toBeVisible();
    });

    /**
     * MM-67920 Prevent tab switch with unsaved changes
     * @objective Verify tab switching blocked with unsaved changes
     */
    test('MM-67920 Prevent tab switch with unsaved changes', async ({pw}) => {
        // # Set up admin user and login
        const {adminUser, team, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open Team Settings
        const settings = await openTeamSettings(app);
        const infoTab = settings.tabs.tab('info');
        const accessTab = settings.tabs.tab('access');

        // * Verify Access tab is visible (admin has INVITE_USER permission)
        await expect(accessTab.locator).toBeVisible();

        // # Edit team name in Info tab (create unsaved changes)
        await settings.info.fillNameTextbox(`Modified Team ${pw.random.id()}`);

        // # Try to switch to Access tab
        await accessTab.select();

        // * Verify the unsaved changes warning appears and the Info tab stays selected
        await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.message);
        await expect(infoTab).toBeSelected();

        // # Click Undo
        await settings.savePanel.clickCancelButton();

        // * Verify can now switch to Access tab
        await accessTab.select();
        await expect(accessTab).toBeSelected();
    });

    /**
     * MM-67920 Save changes and close modal without warning
     * @objective Verify that after saving, modal closes without warning
     */
    test('MM-67920 Save changes and close modal without warning', async ({pw}) => {
        // # Set up admin user and login
        const {adminUser, adminClient, team, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open Team Settings and edit the team name
        const settings = await openTeamSettings(app);
        const newTeamName = `Updated Team ${pw.random.id()}`;
        await settings.info.fillNameTextbox(newTeamName);

        // # Save changes
        await settings.savePanel.clickSaveButton();

        // * Wait for "Settings saved" message
        await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.saved);

        // * Verify team name updated via API
        const updatedTeam = await adminClient.getTeam(team.id);
        expect(updatedTeam.display_name).toBe(newTeamName);

        // # Close modal immediately after save (should work without warning)
        await settings.clickCloseButton();

        // * Verify modal closes without warning
        await expect(settings.locator).not.toBeVisible();
    });

    /**
     * MM-67920 Undo changes resets form state
     * @objective Verify Undo button restores original values
     */
    test('MM-67920 Undo changes resets form state', async ({pw}) => {
        // # Set up admin user and login
        const {adminUser, team, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open Team Settings and edit the team name
        const settings = await openTeamSettings(app);
        const nameTextbox = settings.info.nameTextbox.locator;
        const newTeamName = `Modified Team ${pw.random.id()}`;
        await settings.info.fillNameTextbox(newTeamName);

        // * Verify input shows new value
        await expect(nameTextbox).toHaveValue(newTeamName);

        // # Click Undo
        await settings.savePanel.clickCancelButton();

        // * Verify input restored to original value
        await expect(nameTextbox).toHaveValue(team.display_name);

        // * Verify can close modal without warning
        await settings.clickCloseButton();
        await expect(settings.locator).not.toBeVisible();
    });
});

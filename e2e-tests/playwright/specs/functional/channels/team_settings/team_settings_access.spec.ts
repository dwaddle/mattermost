// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, formatMessage, Msg, openTeamSettings, test} from '@mattermost/playwright-lib';

test.describe('Team Settings Modal - Access Tab', () => {
    /**
     * MM-67920 Access tab - add and remove allowed domain
     * @objective Verify allowed domains can be added and removed
     */
    test('MM-67920 Access tab - add and remove allowed domain', async ({pw}) => {
        // # Set up admin user and login
        const {adminUser, adminClient, team, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open Team Settings on the Access tab
        const settings = await openTeamSettings(app, 'access');
        const domains = settings.access.allowedDomains;
        const saved = formatMessage(Msg.saveChangesPanel.saved);

        // # Enable allowed domains checkbox to show the input
        await settings.access.allowedDomainsCheckbox.check();

        // # Add an allowed domain
        const testDomain = 'testdomain.com';
        await domains.inputCombobox.locator.fill(testDomain);
        await domains.inputCombobox.press('Enter');

        // * Verify domain appears in the UI
        await expect(domains.locator).toContainText(testDomain);

        // # Save changes
        await settings.savePanel.clickSaveButton();

        // * Wait for "Settings saved" message
        await expect(settings.savePanel.messageText.locator).toHaveText(saved);

        // * Verify domain was saved via API
        const updatedTeam = await adminClient.getTeam(team.id);
        expect(updatedTeam.allowed_domains).toContain(testDomain);

        // # Remove the added domain
        await domains.clickRemoveButton();
        await expect(domains.locator).not.toContainText(testDomain);

        // # Save changes
        await settings.savePanel.clickSaveButton();
        await expect(settings.savePanel.messageText.locator).toHaveText(saved);

        // * Verify domain was removed via API
        const finalTeam = await adminClient.getTeam(team.id);
        expect(finalTeam.allowed_domains).not.toContain(testDomain);

        // # Close modal
        await settings.clickCloseButton();
    });

    /**
     * MM-67920 Access tab - regenerate invite ID
     * @objective Verify team invite ID can be regenerated
     */
    test('MM-67920 Access tab - regenerate invite ID', async ({pw}) => {
        // # Set up admin user and login
        const {adminUser, adminClient, team, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);

        // Get original invite ID
        const originalInviteId = team.invite_id;

        // # Navigate to team and open Team Settings on the Access tab
        await app.channelsPage.goto({team, channel: townSquare});
        const settings = await openTeamSettings(app, 'access');

        // # Click regenerate button
        await settings.access.inviteLink.clickRegenerateButton();

        // * Verify invite ID changed via API
        await expect.poll(async () => (await adminClient.getTeam(team.id)).invite_id).not.toBe(originalInviteId);
        expect((await adminClient.getTeam(team.id)).invite_id).toBeTruthy();

        // # Close modal
        await settings.clickCloseButton();
    });
});

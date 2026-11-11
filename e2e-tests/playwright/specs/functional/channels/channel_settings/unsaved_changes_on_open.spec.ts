// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannelSettings, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that Channel Settings opens with no unsaved-changes warning and no channel name
 * validation error, and closes on a single click, for a channel whose stored purpose and header carry
 * leading or trailing whitespace. The server keeps that whitespace verbatim, so channels populated
 * outside this form reach it untidy.
 */
test(
    'opens Channel Settings cleanly for a channel whose stored text has surrounding whitespace',
    {tag: '@channel_settings'},
    async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup();

        // # Create a channel whose stored purpose and header have surrounding whitespace
        const channel = await adminClient.createPublicChannel(team.id, `Untidy ${pw.random.id()}`);
        const paddedPurpose = '  Small annoyances that add up  ';
        const paddedHeader = 'Runbook: [Ops guide](https://example.com/runbook)\nEscalate to the on-call\n';
        await adminClient.patchChannel(channel.id, {purpose: paddedPurpose, header: paddedHeader});
        await adminClient.addToChannel(user.id, channel.id);

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel});
        await expect(app.center.postList.locator).toBeVisible();

        // # Open Channel Settings without touching any field
        const settings = await openChannelSettings(app, 'info');

        // * The stored text is shown as-is, and the form reports no unsaved changes
        expect(await settings.info.read()).toMatchObject({
            name: channel.display_name,
            purpose: paddedPurpose,
            header: paddedHeader,
        });
        await expect(settings.savePanel.locator).not.toBeVisible();

        // * No channel name validation error is shown for the populated name field
        await expect(settings.info.name.messageAlert.locator).toHaveCount(0);

        // # Close the modal with a single click
        await settings.clickCloseButton();

        // * The modal closes without the second click that unsaved changes would demand
        await expect(settings.locator).not.toBeVisible();
    },
);

/**
 * @objective Verify that editing a channel whose stored text has surrounding whitespace still surfaces the
 * unsaved-changes panel and saves the edit.
 */
test(
    'saves an edit made on a channel whose stored text has surrounding whitespace',
    {tag: '@channel_settings'},
    async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup();

        // # Create a channel whose stored header ends in a newline
        const channel = await adminClient.createPublicChannel(team.id, `Untidy ${pw.random.id()}`);
        const paddedHeader = 'padded header\n';
        await adminClient.patchChannel(channel.id, {purpose: '  padded purpose  ', header: paddedHeader});
        await adminClient.addToChannel(user.id, channel.id);

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel});
        await expect(app.center.postList.locator).toBeVisible();

        // # Open Channel Settings and edit the purpose
        let settings = await openChannelSettings(app, 'info');
        await settings.info.fillPurposeTextbox('A brand new purpose');

        // * The edit is recognised as an unsaved change
        await expect(settings.savePanel.locator).toBeVisible();

        // # Save the edit
        await settings.savePanel.clickSaveButton();

        // * The save completes and the panel leaves the unsaved state; the server has the new purpose
        await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
        await expect.poll(async () => (await adminClient.getChannel(channel.id)).purpose).toBe('A brand new purpose');

        // # Close and reopen Channel Settings
        await settings.clickCloseButton();
        settings = await openChannelSettings(app, 'info');

        // * The saved purpose persisted, the untouched header was left exactly as stored, and the reopened form
        // * is clean
        expect(await settings.info.read()).toMatchObject({purpose: 'A brand new purpose', header: paddedHeader});
        await expect(settings.savePanel.locator).not.toBeVisible();
    },
);

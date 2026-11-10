// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

const DEFAULT_CHANNEL_URL_LOCKED_TEXT = 'The URL of the default channel cannot be changed.';

/**
 * @objective Verify that Channel Settings does not offer a URL edit for the default channel, whose URL the
 * server always rejects, while its display name can still be saved.
 * @reference MM-67612
 *
 * Written on the generated page objects: the info tab's URL editor and its help text come from `app`.
 */
test(
    'does not offer a URL edit for the default channel but still saves its display name',
    {tag: '@channel_settings'},
    async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Open the Channel Settings modal on the Info tab
        const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
        await settings.tabs.infoTab.select();
        const url = settings.info.url;

        // * The URL is shown read-only, with no way to edit it and an explanation why
        await expect(url.labelText.locator).toContainText('town-square');
        await expect(url.editButton.locator).toHaveCount(0);
        await expect(url.valueTextbox.locator).toHaveCount(0);
        await expect(url.helpText.locator).toHaveText(DEFAULT_CHANNEL_URL_LOCKED_TEXT);

        // # Rename the display name, which the server does allow on the default channel, and save
        await settings.info.fillNameTextbox('Company Wide');
        await settings.savePanel.clickSaveButton();

        // * The save succeeds: the panel leaves the unsaved state rather than showing a form error
        await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
        await settings.clickCloseButton();
        await expect(app.channelHeader.openMenuButton.locator).toContainText('Company Wide');

        // * The server kept the default channel URL and applied the new display name
        const channel = await adminClient.getChannelByName(team.id, 'town-square');
        expect(channel.name).toBe('town-square');
        expect(channel.display_name).toBe('Company Wide');
    },
);

/**
 * @objective Verify that an ordinary channel is unaffected by the default-channel restriction and its URL
 * can still be changed from Channel Settings.
 * @reference MM-67612
 */
test('allows the URL of an ordinary channel to be changed', {tag: '@channel_settings'}, async ({pw}) => {
    const {adminUser, adminClient, team} = await pw.initSetup();
    const createdChannel = await adminClient.createPublicChannel(team.id, 'Ordinary Channel');

    const {app} = await pw.testBrowser.login(adminUser);
    await app.channelsPage.goto({team, channel: createdChannel});

    // # Open the Channel Settings modal on the Info tab
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.infoTab.select();
    const url = settings.info.url;

    // * An ordinary channel isn't affected by the default-channel restriction
    await expect(url.helpText.locator).toHaveCount(0);
    await expect(url.editButton.locator).toBeVisible();

    // # Change the channel URL and save
    const updatedUrl = `renamed-${pw.random.id()}`;
    await url.clickEditButton();
    await url.fillValueTextbox(updatedUrl);
    await settings.savePanel.clickSaveButton();

    // * The save succeeds, and the server has the new URL
    await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
    await settings.clickCloseButton();
    await expect.poll(async () => (await adminClient.getChannel(createdChannel.id)).name).toBe(updatedUrl);
});

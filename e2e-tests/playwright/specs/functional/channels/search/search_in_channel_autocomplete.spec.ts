// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Api, expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify the "in:" search autocomplete shows a renamed channel by both its new display name and
 * its original handle, so it stays findable after a display-name change.
 *
 * The search half is written on the generated page objects: the search box and its suggestions, keyed by the
 * channel's handle.
 */
test(
    'MM-T1449 shows the channel display name and handle in the in: search autocomplete',
    {tag: '@search'},
    async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup();

        // # Create a public channel whose handle differs from its display name, then add the user
        const id = pw.random.id();
        const handle = `original-${id}`;
        const updatedName = `Updated ${id}`;
        const channel = await adminClient.createPublicChannel(team.id, `Original ${id}`, handle);
        await adminClient.addToChannel(user.id, channel.id);

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: channel.name});

        // # Rename the channel's display name via Channel Settings
        const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
        await settings.tabs.infoTab.select();
        await settings.info.fillNameTextbox(updatedName);
        await settings.savePanel.saveButton.commit({wait: Api.PatchChannel});
        await settings.clickCloseButton();
        await expect(app.channelHeader.openMenuButton.locator).toContainText(updatedName);

        // # Open search and type an "in:" filter matching the channel's original handle
        const input = app.searchBox.inputSearchbox.locator;
        await app.globalHeader.search.clickOpenButton();
        await input.fill('in:');
        await input.pressSequentially(handle);

        // * Verify the autocomplete offers the channel by its handle (the client adds a suffix to the one asked
        // for), showing its new display name and the handle
        const suggestion = app.searchBox.suggestions.item(channel.name).locator;
        await expect(suggestion).toContainText(updatedName);
        await expect(suggestion).toContainText(`~${handle}`);
    },
);

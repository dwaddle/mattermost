// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {Channel} from '@mattermost/types/channels';

import {expect, generated, Msg, test, type App} from '@mattermost/playwright-lib';

async function enableChannelCategorySorting(adminClient: Client4) {
    await adminClient.patchConfig({
        TeamSettings: {
            EnableChannelCategorySorting: true,
        },
    });
}

async function disableChannelCategorySorting(adminClient: Client4) {
    await adminClient.patchConfig({
        TeamSettings: {
            EnableChannelCategorySorting: false,
        },
    });
}

/** Waits for the user's sidebar category named `name` on the team, and returns its id. */
async function categoryIdByName(client: Client4, userId: string, teamId: string, name: string) {
    let id = '';
    await expect
        .poll(async () => {
            const {categories} = await client.getChannelCategories(userId, teamId);
            id = categories.find((category) => category.display_name === name)?.id ?? '';
            return id;
        })
        .not.toBe('');
    return id;
}

/** Opens Channel Settings on the Info tab from the channel header menu. */
async function openChannelSettingsInfo(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.infoTab.select();
    await expect(settings.info.nameTextbox.locator).toBeVisible();
    return settings;
}

/** Types a new category name in a default category selector and picks "Create new category". */
async function createCategoryIn(selector: generated.CategorySelector, name: string) {
    // fill focuses the input itself; a click would land on the placeholder drawn over it
    await selector.inputCombobox.locator.fill(name);
    await expect(selector.createOption.locator).toContainText(name);
    await selector.createOption.select();
}

/** The channel's sidebar link inside the given category (the channel list, rooted at the category's element). */
function channelInCategory(app: App, categoryId: string, channel: Pick<Channel, 'name'>) {
    const category = app.lhs.channelList.category({id: categoryId}).locator;
    return new generated.LhsChannelList(app.page, 'lhs.channel_list', category).channel(channel).link.locator;
}

test.describe('Channel Category Sorting', () => {
    /**
     * @objective Verify that the default category selector is not visible in channel settings when channel category sorting is disabled.
     */
    test(
        'default category selector is not visible when channel category sorting is disabled',
        {tag: '@channel_category_sorting'},
        async ({pw}) => {
            // # Initialize setup and disable channel category sorting
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            await pw.skipIfNoLicense();
            await disableChannelCategorySorting(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Log in and open channel settings
            const {app} = await pw.testBrowser.login(adminUser);
            await app.channelsPage.goto({team, channel: 'town-square'});
            const settings = await openChannelSettingsInfo(app);

            // * Verify the default category selector is not rendered (the tests below see it when sorting is on)
            await expect(settings.info.defaultCategory.locator).toHaveCount(0);

            await settings.clickCloseButton();
        },
    );

    /**
     * @objective Verify that a default category can be assigned when creating a new channel via the new channel modal.
     */
    test(
        'default category can be assigned when creating a new channel',
        {tag: '@channel_category_sorting'},
        async ({pw}) => {
            // # Initialize setup and enable channel category sorting
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            await pw.skipIfNoLicense();
            await enableChannelCategorySorting(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Log in and open the new channel modal
            const {app} = await pw.testBrowser.login(adminUser);
            await app.channelsPage.goto({team, channel: 'town-square'});
            const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
            const displayName = `New Default Cat ${Date.now()}`;
            await modal.fillNameTextbox(displayName);

            // # Pick "Create new category" in the default category selector
            await expect(modal.defaultCategory).toContainMessage(Msg.default_category.placeholder);
            await createCategoryIn(modal.defaultCategory, 'Flight Ops');

            await modal.clickConfirmButton();
            await expect(modal.locator).not.toBeVisible();

            // * Verify the new category appears in the sidebar
            const categoryId = await categoryIdByName(adminClient, adminUser.id, team.id, 'Flight Ops');
            await expect(app.lhs.channelList.category({id: categoryId}).headerButton.locator).toHaveAccessibleName(
                'Flight Ops',
            );
        },
    );

    /**
     * @objective Verify that a Channel Admin can assign a default category to an existing channel via the channel
     * settings modal, and the category appears in the sidebar with the channel under it for the patching user.
     */
    test('default category can be assigned via channel settings', {tag: '@channel_category_sorting'}, async ({pw}) => {
        // # Initialize setup with admin user and enterprise license
        const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
        await pw.skipIfNoLicense();
        await enableChannelCategorySorting(adminClient);
        await adminClient.addToTeam(team.id, adminUser.id);

        // # Create a new channel and open it
        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: `default-assign-${Date.now()}`,
            display_name: `Default assign ${Date.now()}`,
            type: 'O',
        } as Channel);
        await adminClient.addToChannel(adminUser.id, channel.id);
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel});

        // # Open channel settings and navigate to info tab
        const settings = await openChannelSettingsInfo(app);

        // * Verify the default category selector is visible
        const selector = settings.info.defaultCategory;
        await expect(selector).toContainMessage(Msg.default_category.placeholder);

        // # Type a new category name and select "Create new category"
        await createCategoryIn(selector, 'Operations');

        // # Save and close
        await settings.savePanel.clickSaveButton();
        await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.saved);
        await settings.clickCloseButton();

        // * Verify the default category appears in the sidebar with the channel under it
        const categoryId = await categoryIdByName(adminClient, adminUser.id, team.id, 'Operations');
        await expect(channelInCategory(app, categoryId, channel)).toBeVisible();
    });

    /**
     * @objective Verify that a Channel Admin can remove a default category from a channel via the channel settings
     * modal, and reopening the modal shows the field cleared.
     */
    test('default category can be removed via channel settings', {tag: '@channel_category_sorting'}, async ({pw}) => {
        // # Initialize setup and create a channel with a default category set
        const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
        await pw.skipIfNoLicense();
        await enableChannelCategorySorting(adminClient);
        await adminClient.addToTeam(team.id, adminUser.id);

        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: `default-cat-remove-${Date.now()}`,
            display_name: `Default remove ${Date.now()}`,
            type: 'O',
        } as Channel);
        await adminClient.patchChannel(channel.id, {default_category_name: 'Removable'});
        await adminClient.addToChannel(adminUser.id, channel.id);

        // # Log in and navigate to the channel
        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel});

        // * Verify the default category is visible in the sidebar (admin was added after the patch set it)
        const categoryId = await categoryIdByName(adminClient, adminUser.id, team.id, 'Removable');
        await expect(channelInCategory(app, categoryId, channel)).toBeVisible();

        // # Open channel settings and clear the default category (Backspace in the empty input removes the value)
        let settings = await openChannelSettingsInfo(app);
        const selector = settings.info.defaultCategory;
        await expect(selector.locator).toContainText('Removable');
        await selector.inputCombobox.locator.focus();
        await selector.inputCombobox.locator.press('Backspace');

        // * Verify the value is gone
        await expect(selector.locator).not.toContainText('Removable');

        // # Save and close
        await settings.savePanel.clickSaveButton();
        await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.saved);
        await settings.clickCloseButton();
        await expect(settings.locator).not.toBeVisible();

        // # Reopen channel settings to verify the cleared value persisted
        settings = await openChannelSettingsInfo(app);

        // * Verify the default category selector shows the placeholder (value is cleared)
        await expect(settings.info.defaultCategory).toContainMessage(Msg.default_category.placeholder);
        await expect(settings.info.defaultCategory.locator).not.toContainText('Removable');

        await settings.clickCloseButton();
    });

    /**
     * @objective Verify that the Channel category sorting setting is available in the System Console
     * under Site Configuration > Users and Teams.
     */
    test(
        'Channel category sorting setting is available in System Console',
        {tag: '@channel_category_sorting'},
        async ({pw}) => {
            // # Initialize setup
            const {adminUser} = await pw.initSetup({withDefaultProfileImage: false});
            await pw.skipIfNoLicense();

            // # Log in and navigate to Users and Teams in the System Console
            const {app, page} = await pw.testBrowser.login(adminUser);
            await page.goto(generated.AdminConsolePage.path({section: 'site_config/users_and_teams'}));

            // * Verify the setting is visible
            await expect(
                app.admin.setting('TeamSettings.EnableChannelCategorySorting').trueRadio.locator,
            ).toBeVisible();
        },
    );
});

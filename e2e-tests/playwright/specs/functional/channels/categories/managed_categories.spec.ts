// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {Channel} from '@mattermost/types/channels';
import type {UserProfile} from '@mattermost/types/users';

import {
    expect,
    generated,
    getRandomId,
    Msg,
    test,
    type App,
    type PlaywrightExtended,
    duration,
    DefaultChannel,
} from '@mattermost/playwright-lib';

async function enableManagedCategories(adminClient: Client4) {
    await adminClient.patchConfig({
        TeamSettings: {
            EnableManagedChannelCategories: true,
        },
    } as never);
}

/**
 * Creates a uniquely-named team and user per test and adds the user to the team.
 */
async function setupManagedCategoriesTest(pw: PlaywrightExtended) {
    const {adminClient, adminUser} = await pw.getAdminClient();
    if (!adminUser) {
        throw new Error('Failed to get the admin user');
    }
    const suffix = getRandomId();

    // Guard against UseAnonymousURLs=true left by anonymous_urls tests running on the same
    // server shard. When active, newly created channels receive obfuscated slugs instead of
    // human-readable names, which the sidebar's channel testids are keyed by.
    await adminClient.patchConfig({PrivacySettings: {UseAnonymousURLs: false}});

    const team = await adminClient.createTeam({
        name: `mgd-${suffix}`,
        display_name: `Managed ${suffix}`,
        type: 'O',
    } as never);
    const user = await pw.createNewUserProfile(adminClient, {prefix: 'mgd-user'});
    await adminClient.addToTeam(team.id, user.id);
    return {adminClient, adminUser, team, user};
}

async function createChannelWithManagedCategory(
    adminClient: Client4,
    teamId: string,
    categoryName: string,
    channelSuffix: string,
) {
    const channel = await adminClient.createChannel({
        team_id: teamId,
        name: `managed-cat-${channelSuffix}-${Date.now()}`,
        display_name: `Managed ${channelSuffix} ${Date.now()}`,
        type: 'O',
    } as never);
    await adminClient.patchChannel(channel.id, {managed_category_name: categoryName} as never);
    return channel;
}

/** The sidebar's managed category `name` (its id is `managed_<name>`). */
function managedCategory(app: App, name: string) {
    return app.lhs.channelList.category({id: `managed_${name}`});
}

/** The sidebar's channel list inside the given category (rooted at the category's element). */
function channelsIn(app: App, categoryId: string) {
    const category = app.lhs.channelList.category({id: categoryId}).locator;
    return new generated.LhsChannelList(app.page, 'lhs.channel_list', category);
}

/** The id of the user's default Channels category on the team. */
async function channelsCategoryId(client: Client4, userId: string, teamId: string) {
    const {categories} = await client.getChannelCategories(userId, teamId);
    const channels = categories.find((category) => category.type === 'channels');
    if (!channels) {
        throw new Error('The user has no Channels category');
    }
    return channels.id;
}

/** Opens Channel Settings on the Info tab from the channel header menu. */
async function openChannelSettingsInfo(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.infoTab.select();
    await expect(settings.info.nameTextbox.locator).toBeVisible();
    return settings;
}

/** Types a new category name in a category selector and picks "Create new category". */
async function createCategoryIn(selector: generated.CategorySelector, name: string) {
    // fill focuses the input itself; a click would land on the placeholder drawn over it
    await selector.inputCombobox.locator.fill(name);
    await expect(selector.createOption.locator).toContainText(name);
    await selector.createOption.select();
}

/** Logs in and opens the channel (default: the team's town square). */
async function openChannel(
    pw: PlaywrightExtended,
    user: UserProfile,
    team: {name: string},
    channel: string = DefaultChannel.TownSquare,
) {
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    return app;
}

test.describe('Managed Channel Categories', () => {
    /**
     * @objective Verify that a Channel Admin can assign a managed category to a channel via the channel settings modal,
     * and the category appears in the sidebar with the channel under it.
     *
     * @knownIssue ManagedChannelCategories defaults to off, so this spec has never actually run in
     * CI — it always self-skipped. Now that ensureFeatureFlag restarts the server with the flag on
     * instead of only skipping, the test runs for real and reveals that assigning a managed_category_name
     * to a channel has no effect on the sidebar: the channel stays under the regular CHANNELS group and
     * no managed category header is ever rendered, so grouping, sorting, real-time updates, and the
     * disabled Favorite/Move To/context-menu states that depend on being in a managed category all fail.
     */
    test.fixme(
        'Channel Admin can assign a managed category via channel settings',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup with admin user and enterprise license
            const {adminUser, adminClient, team} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Log in, open town-square and create a new channel
            const app = await openChannel(pw, adminUser, team);
            const channelName = `managed-assign-${Date.now()}`;
            const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
            await modal.fillNameTextbox(channelName);
            await modal.clickConfirmButton();
            await expect(modal.locator).not.toBeVisible();

            // # Open channel settings on the info tab
            const settings = await openChannelSettingsInfo(app);

            // * Verify managed category selector is visible
            const selector = settings.info.managedCategory;
            await expect(selector.inputCombobox.locator).toBeVisible();

            // # Type a new category name and select "Create new category"
            await createCategoryIn(selector, 'Operations');

            // # Save and close
            await settings.savePanel.clickSaveButton();
            await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.saved);
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * Verify the managed category appears in the sidebar with the channel under it
            const category = managedCategory(app, 'Operations');
            await expect(category.headerButton.locator).toContainText('Operations');
            await expect(channelsIn(app, 'managed_Operations').channel({name: channelName}).link.locator).toBeVisible();
        },
    );

    /**
     * @objective Verify that a Channel Admin can remove a managed category from a channel via the channel settings modal,
     * and the channel returns to the default CHANNELS section.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme(
        'Channel Admin can remove a managed category via channel settings',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create a channel with a managed category
            const {adminUser, adminClient, team} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const channel = await createChannelWithManagedCategory(adminClient, team.id, 'Removable', 'remove');
            await adminClient.addToChannel(adminUser.id, channel.id);

            // # Log in and navigate to the channel
            const app = await openChannel(pw, adminUser, team, channel.name);

            // * Verify the managed category is visible in the sidebar (the webapp fetches the mappings after load)
            const category = managedCategory(app, 'Removable');
            await expect(category.headerButton.locator).toContainText('Removable', {timeout: duration.half_min});

            // # Open channel settings and clear the managed category
            const settings = await openChannelSettingsInfo(app);
            const selector = settings.info.managedCategory;
            await expect(selector.locator).toContainText('Removable');
            await selector.clear.locator.click();

            // * Verify the value and the clear control are gone
            await expect(selector.locator).not.toContainText('Removable');
            await expect(selector.clear.locator).toHaveCount(0);

            // # Save and close
            await settings.savePanel.clickSaveButton();
            await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.saved);
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * Verify the managed category is removed and the channel is back under CHANNELS
            await expect(category.locator).toHaveCount(0);
            const channelsId = await channelsCategoryId(adminClient, adminUser.id, team.id);
            await expect(channelsIn(app, channelsId).channel(channel).link.locator).toBeVisible();
        },
    );

    /**
     * @objective Verify that a managed category can be assigned to a channel during creation via the new channel modal.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme(
        'managed category can be assigned when creating a new channel',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup
            const {adminUser, adminClient, team} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Log in and open the new channel modal
            const app = await openChannel(pw, adminUser, team);
            const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
            const displayName = `New Managed ${Date.now()}`;
            await modal.fillNameTextbox(displayName);

            // # Pick "Create new category" in the managed category selector
            await expect(modal.managedCategory.inputCombobox.locator).toBeVisible();
            await createCategoryIn(modal.managedCategory, 'Flight Ops');

            // # Create the channel
            await modal.clickConfirmButton();
            await expect(modal.locator).not.toBeVisible();

            // * Verify the managed category appears in the sidebar
            await expect(managedCategory(app, 'Flight Ops').headerButton.locator).toContainText('Flight Ops');
        },
    );

    /**
     * @objective Verify that managed categories appear at the top of the sidebar above personal categories like CHANNELS.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme(
        'managed categories appear at the top of the sidebar above personal categories',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create a channel with a managed category
            const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const channel = await createChannelWithManagedCategory(adminClient, team.id, 'Alpha Priority', 'alpha');
            await adminClient.addToChannel(user.id, channel.id);

            // # Log in as regular user
            const app = await openChannel(pw, user, team);

            // * Verify the managed category shows
            await expect(managedCategory(app, 'Alpha Priority').headerButton.locator).toContainText('Alpha Priority', {
                timeout: duration.half_min,
            });

            // * Verify it comes before the CHANNELS category in the sidebar
            const channelsId = await channelsCategoryId(adminClient, user.id, team.id);
            const order = await app.lhs.channelList.categoryKeys();
            expect(order).toContain(channelsId);
            expect(order.indexOf('managed_Alpha Priority')).toBeGreaterThanOrEqual(0);
            expect(order.indexOf('managed_Alpha Priority')).toBeLessThan(order.indexOf(channelsId));
        },
    );

    /**
     * @objective Verify that a managed category is only visible to users who are members of at least one channel in it.
     */
    test(
        'managed category is only visible when user is a member of a channel in it',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create a channel with a managed category (the user is not a member)
            const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const channel = await createChannelWithManagedCategory(adminClient, team.id, 'Secret Ops', 'secret');

            // * The assignment exists: the admin, who created the channel and so is a member, sees it mapped
            expect(await adminClient.getManagedCategories(team.id)).toMatchObject({[channel.id]: 'Secret Ops'});

            // * The server hides it from the user, who isn't a member
            const {client: userClient} = await pw.makeClient({username: user.username, password: user.password});
            expect(await userClient.getManagedCategories(team.id)).not.toHaveProperty(channel.id);

            // # Log in as the user
            const app = await openChannel(pw, user, team);

            // * Verify the sidebar has loaded its categories, and the managed one isn't among them
            await expect(app.lhs.channelList.channel({name: DefaultChannel.TownSquare}).link.locator).toBeVisible();
            const channelsId = await channelsCategoryId(adminClient, user.id, team.id);
            await expect.poll(() => app.lhs.channelList.categoryKeys()).toContain(channelsId);
            expect(await app.lhs.channelList.categoryKeys()).not.toContain('managed_Secret Ops');
            await expect(managedCategory(app, 'Secret Ops').locator).toHaveCount(0);
        },
    );

    /**
     * @objective Verify that channels within a managed category are sorted alphabetically by display name.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme('managed categories sort channels alphabetically', {tag: '@managed_categories'}, async ({pw}) => {
        await pw.ensureFeatureFlag('ManagedChannelCategories', true);
        // # Initialize setup and create two channels in the same managed category, the second alphabetically first
        const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
        await pw.skipIfNoLicense();
        await enableManagedCategories(adminClient);
        await adminClient.addToTeam(team.id, adminUser.id);

        const suffix = Date.now();
        const channelB: Channel = await adminClient.createChannel({
            team_id: team.id,
            name: `bravo-${suffix}`,
            display_name: 'Bravo Channel',
            type: 'O',
        } as never);
        const channelA: Channel = await adminClient.createChannel({
            team_id: team.id,
            name: `alpha-${suffix}`,
            display_name: 'Alpha Channel',
            type: 'O',
        } as never);
        await adminClient.patchChannel(channelB.id, {managed_category_name: 'Sorted Category'} as never);
        await adminClient.patchChannel(channelA.id, {managed_category_name: 'Sorted Category'} as never);
        await adminClient.addToChannel(user.id, channelA.id);
        await adminClient.addToChannel(user.id, channelB.id);

        // # Log in as regular user
        const app = await openChannel(pw, user, team);

        // * Verify the category lists Alpha before Bravo
        await expect(managedCategory(app, 'Sorted Category').headerButton.locator).toContainText('Sorted Category', {
            timeout: duration.half_min,
        });
        await expect
            .poll(() => channelsIn(app, 'managed_Sorted Category').channelKeys())
            .toEqual([channelA.name, channelB.name]);
    });

    /**
     * @objective Verify that channels in managed categories cannot be favorited (favorite button is disabled).
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme('channels in managed categories cannot be favorited', {tag: '@managed_categories'}, async ({pw}) => {
        await pw.ensureFeatureFlag('ManagedChannelCategories', true);
        // # Initialize setup and create a channel with a managed category
        const {adminUser, adminClient, team} = await setupManagedCategoriesTest(pw);
        await pw.skipIfNoLicense();
        await enableManagedCategories(adminClient);
        await adminClient.addToTeam(team.id, adminUser.id);

        const channel = await createChannelWithManagedCategory(adminClient, team.id, 'No Favorites', 'nofav');
        await adminClient.addToChannel(adminUser.id, channel.id);

        // # Log in and open the channel
        const app = await openChannel(pw, adminUser, team, channel.name);

        // * Verify the managed category shows, then that the channel header's favorite button is disabled
        await expect(managedCategory(app, 'No Favorites').headerButton.locator).toContainText('No Favorites', {
            timeout: duration.half_min,
        });
        await expect(app.channelHeader.favoriteButton.locator).toBeDisabled();
    });

    /**
     * @objective Verify that managed category headers do not show a context menu.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme('managed categories do not show a context menu', {tag: '@managed_categories'}, async ({pw}) => {
        await pw.ensureFeatureFlag('ManagedChannelCategories', true);
        // # Initialize setup and create a channel with a managed category
        const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
        await pw.skipIfNoLicense();
        await enableManagedCategories(adminClient);
        await adminClient.addToTeam(team.id, adminUser.id);

        const channel = await createChannelWithManagedCategory(adminClient, team.id, 'No Menu', 'nomenu');
        await adminClient.addToChannel(user.id, channel.id);

        // # Log in as regular user
        const app = await openChannel(pw, user, team);
        const category = managedCategory(app, 'No Menu');
        await expect(category.headerButton.locator).toContainText('No Menu', {timeout: duration.half_min});

        // * The CHANNELS category has its options button; the managed one has none
        const channelsId = await channelsCategoryId(adminClient, user.id, team.id);
        await expect(app.lhs.channelList.category({id: channelsId}).menuButton.locator).toHaveCount(1);
        await expect(category.menuButton.locator).toHaveCount(0);

        // # Right-click the managed category's header
        await category.headerButton.locator.click({button: 'right'});

        // * Verify no category menu opens
        await expect(app.lhs.categoryMenu.locator).toHaveCount(0);
    });

    /**
     * @objective Verify that the channel context menu shows the favorite option as disabled for channels in managed categories.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme(
        'channel context menu shows favorite as disabled in managed category',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create a channel with a managed category
            const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const channel = await createChannelWithManagedCategory(adminClient, team.id, 'Context Menu', 'ctx');
            await adminClient.addToChannel(user.id, channel.id);

            // # Log in as regular user
            const app = await openChannel(pw, user, team);
            await expect(managedCategory(app, 'Context Menu').headerButton.locator).toContainText('Context Menu', {
                timeout: duration.half_min,
            });

            // # Open the channel's menu from its sidebar row
            const row = app.lhs.channelList.channel(channel);
            await row.link.hover();
            const menu = await row.clickOpenMenuButton();

            // * Verify the Favorite option is disabled
            await expect(menu.favoriteMenuItem.locator).toBeVisible();
            await expect(menu.favoriteMenuItem.locator).toHaveAttribute('aria-disabled', 'true');
        },
    );

    /**
     * @objective Verify that the "Move to" option is disabled for non-admin users on channels in managed categories.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme(
        'Move To is disabled for non-admin users on channels in managed categories',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create a channel with a managed category
            const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const channel = await createChannelWithManagedCategory(adminClient, team.id, 'No Move', 'nomove');
            await adminClient.addToChannel(user.id, channel.id);

            // # Log in as regular user
            const app = await openChannel(pw, user, team);
            await expect(managedCategory(app, 'No Move').headerButton.locator).toContainText('No Move', {
                timeout: duration.half_min,
            });

            // # Open the channel's menu from its sidebar row
            const row = app.lhs.channelList.channel(channel);
            await row.link.hover();
            const menu = await row.clickOpenMenuButton();

            // * Verify the Move To option is disabled
            await expect(menu.moveToMenuItem.locator).toBeVisible();
            await expect(menu.moveToMenuItem.locator).toHaveAttribute('aria-disabled', 'true');
        },
    );

    /**
     * @objective Verify that assigning the same managed category name to multiple channels groups them under a single
     * category header in the sidebar.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme(
        'assigning the same category name to multiple channels groups them together',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create two channels with the same managed category
            const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const suffix = Date.now();
            const channel1 = await createChannelWithManagedCategory(
                adminClient,
                team.id,
                'Shared Category',
                `shared1-${suffix}`,
            );
            const channel2 = await createChannelWithManagedCategory(
                adminClient,
                team.id,
                'Shared Category',
                `shared2-${suffix}`,
            );

            // # Add the user to both channels
            await adminClient.addToChannel(user.id, channel1.id);
            await adminClient.addToChannel(user.id, channel2.id);

            // # Log in as regular user
            const app = await openChannel(pw, user, team);

            // * Verify one category holds both channels
            await expect(managedCategory(app, 'Shared Category').headerButton.locator).toContainText(
                'Shared Category',
                {
                    timeout: duration.half_min,
                },
            );
            const keys = await app.lhs.channelList.categoryKeys();
            expect(keys.filter((id) => id === 'managed_Shared Category')).toHaveLength(1);
            const shared = channelsIn(app, 'managed_Shared Category');
            await expect(shared.channel(channel1).link.locator).toBeVisible();
            await expect(shared.channel(channel2).link.locator).toBeVisible();
        },
    );

    /**
     * @objective Verify that when an admin assigns a managed category to a channel, the category appears in the
     * sidebar of other users in real-time via websocket.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar.
     */
    test.fixme(
        'managed category appears in real-time when admin assigns a channel to it',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create a channel without a managed category
            const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const channel: Channel = await adminClient.createChannel({
                team_id: team.id,
                name: `realtime-${Date.now()}`,
                display_name: `Realtime Channel ${Date.now()}`,
                type: 'O',
            } as never);
            await adminClient.addToChannel(user.id, channel.id);

            // # Log in as regular user
            const app = await openChannel(pw, user, team);

            // * Verify the channel shows and the managed category doesn't exist yet
            await expect(app.lhs.channelList.channel(channel).link.locator).toBeVisible();
            const category = managedCategory(app, 'Realtime Ops');
            await expect(category.locator).toHaveCount(0);

            // # Admin assigns a managed category to the channel via API
            await adminClient.patchChannel(channel.id, {managed_category_name: 'Realtime Ops'} as never);

            // * Verify the managed category appears in real-time, with the channel under it
            await expect(category.headerButton.locator).toContainText('Realtime Ops');
            await expect(channelsIn(app, 'managed_Realtime Ops').channel(channel).link.locator).toBeVisible();
        },
    );

    /**
     * @objective Verify that the Enable Managed Channel Categories setting is available in the System Console
     * under Site Configuration > Users and Teams.
     *
     * @knownIssue ManagedChannelCategories defaults to off, so this spec has never actually run in CI.
     * Now that ensureFeatureFlag restarts the server with the flag on, the test runs for real and reveals
     * that the System Console does not render a "TeamSettings.EnableManagedChannelCategories" setting
     * under Users and Teams - the admin UI for this feature is incomplete.
     */
    test.fixme(
        'Enable Managed Channel Categories setting is available in System Console',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup
            const {adminUser} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();

            // # Log in and open Site Configuration > Users and Teams in the System Console
            const {app} = await pw.testBrowser.login(adminUser);
            await app.adminConsolePage.goto();
            await app.admin.sidebar.category('site').section('users_and_teams').clickTitleLink();

            // * Verify the setting is visible (the System Console doesn't render it yet, so its path isn't among the
            // generated setting keys: this is the known issue above)
            const setting = app.admin.setting('TeamSettings.EnableManagedChannelCategories' as never);
            await expect(setting.trueRadio.locator).toBeVisible();
        },
    );

    /**
     * @objective Verify that a non-channel-admin user sees the managed category selector as disabled in channel settings.
     *
     * @knownIssue See the @knownIssue above - the managed category never appears in the sidebar; the
     * channel settings selector also never reaches the disabled state it should once a non-admin opens it.
     */
    test.fixme(
        'non-channel-admin sees the managed category selector as disabled',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', true);
            // # Initialize setup and create a channel with a managed category
            const {adminUser, adminClient, team, user} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await enableManagedCategories(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            const channel = await createChannelWithManagedCategory(adminClient, team.id, 'Locked', 'locked');
            await adminClient.addToChannel(user.id, channel.id);

            // # Log in as regular user and open channel settings
            const app = await openChannel(pw, user, team, channel.name);
            const settings = await openChannelSettingsInfo(app);

            // * Verify the managed category selector shows the category and is disabled
            const selector = settings.info.managedCategory;
            await expect(selector.locator).toContainText('Locked');
            await expect(selector.inputCombobox.locator).toBeDisabled();

            await settings.clickCloseButton();
        },
    );
});

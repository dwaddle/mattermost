// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, getRandomId, test, type PlaywrightExtended} from '@mattermost/playwright-lib';

// Written on the generated page objects: the channel header menu and Channel Settings' Info tab with its managed
// category selector.

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
    // human-readable names, breaking sidebar-item selectors (e.g. #sidebarItem_managed-assign-…).
    await adminClient.patchConfig({PrivacySettings: {UseAnonymousURLs: false}});

    const team = await adminClient.createTeam({
        name: `mgd-${suffix}`,
        display_name: `Managed ${suffix}`,
        type: 'O',
    } as any);
    const user = await pw.createNewUserProfile(adminClient, {prefix: 'mgd-user'});
    await adminClient.addToTeam(team.id, user.id);
    return {adminClient, adminUser, team, user};
}

test.describe('Managed Channel Categories (flag off)', () => {
    /**
     * @objective Verify that the managed category selector is not visible in channel settings when the feature is disabled.
     */
    test(
        'managed category selector is not visible when feature is disabled',
        {tag: '@managed_categories'},
        async ({pw}) => {
            await pw.ensureFeatureFlag('ManagedChannelCategories', false);
            // # Initialize setup (the feature flag above is what turns managed categories off; there is no config
            // setting for it)
            const {adminUser, adminClient, team} = await setupManagedCategoriesTest(pw);
            await pw.skipIfNoLicense();
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Log in and open channel settings
            const {app} = await pw.testBrowser.login(adminUser);
            await app.channelsPage.goto({team, channel: 'town-square'});
            const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
            await settings.tabs.infoTab.select();

            // * Verify managed category selector is not rendered, on an Info tab that has loaded
            await expect(settings.info.nameTextbox.locator).toBeVisible();
            await expect(settings.info.managedCategory.locator).toHaveCount(0);

            await settings.clickCloseButton();
        },
    );
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    enableAutotranslationConfig,
    disableAutotranslationConfig,
    generated,
    hasAutotranslationLicense,
    expect,
    test,
    type App,
} from '@mattermost/playwright-lib';

test(
    'permission exists; Channel Administrators have Manage Channel Auto Translation ON',
    {
        tag: ['@autotranslation', '@permissions'],
    },
    async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasAutotranslationLicense(license.SkuShortName),
            'Skipping test - server does not have Entry or Advanced license',
        );

        // The Edit Scheme link stays disabled until the permissions migration finishes
        await pw.ensurePhase2MigrationCompleted();

        const {app} = await pw.testBrowser.login(adminUser);
        await gotoSystemSchemePage(app);

        await expectManageChannelAutoTranslationChecked(app, 'channel_admin');
    },
);

test(
    'System Administrators have Manage Channel Auto Translation ON',
    {
        tag: ['@autotranslation', '@permissions'],
    },
    async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasAutotranslationLicense(license.SkuShortName),
            'Skipping test - server does not have Entry or Advanced license',
        );

        // The Edit Scheme link stays disabled until the permissions migration finishes
        await pw.ensurePhase2MigrationCompleted();

        const {app} = await pw.testBrowser.login(adminUser);
        await gotoSystemSchemePage(app);

        await expectManageChannelAutoTranslationChecked(app, 'system_admin');
    },
);

test.describe('autotranslation configuration tests', () => {
    test(
        'DM menu follows effective RestrictDMAndGM client config',
        {
            tag: ['@autotranslation', '@permissions'],
        },
        async ({pw}) => {
            const {adminClient, user, team} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            const originalConfig = await adminClient.getConfig();

            try {
                await enableAutotranslationConfig(adminClient, {
                    mockBaseUrl: process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010',
                    targetLanguages: ['en', 'es'],
                });
                await expect.poll(async () => (await adminClient.getClientConfig()).EnableAutoTranslation).toBe('true');
                const restrictDMAndGM = (await adminClient.getClientConfig()).RestrictDMAndGMAutotranslation;
                const shouldShowEditHeader = restrictDMAndGM === 'true';

                const peerData = await pw.random.user('dm-peer');
                const peerUser = await adminClient.createUser(peerData, '', '');
                await adminClient.addToTeam(team.id, peerUser.id);
                await adminClient.createDirectChannel([user.id, peerUser.id]);

                const {app, channelsPage} = await pw.testBrowser.login(user);
                await channelsPage.goto(team.name, `@${peerUser.username}`);
                await channelsPage.toBeVisible();

                const menu = await app.channelHeader.clickOpenMenuButton();
                if (shouldShowEditHeader) {
                    await expect(menu.editHeaderMenuItem.locator).toBeVisible();
                    await expect(menu.channelSettingsMenuItem.locator).toHaveCount(0);
                } else {
                    await expect(menu.channelSettingsMenuItem.locator).toBeVisible();
                    await expect(menu.editHeaderMenuItem.locator).toHaveCount(0);
                }
            } finally {
                await adminClient.updateConfig(originalConfig as any);
            }
        },
    );

    test(
        'DM menu shows Edit Header when RestrictDMAndGM is enabled',
        {
            tag: ['@autotranslation', '@permissions'],
        },
        async ({pw}) => {
            const {adminClient, user, team} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            const originalConfig = await adminClient.getConfig();

            try {
                await enableAutotranslationConfig(adminClient, {
                    mockBaseUrl: process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010',
                    targetLanguages: ['en', 'es'],
                });
                const configAfterEnable = (await adminClient.getConfig()) as any;
                await adminClient.updateConfig({
                    ...configAfterEnable,
                    AutoTranslationSettings: {
                        ...configAfterEnable.AutoTranslationSettings,
                        RestrictDMAndGM: true,
                    },
                } as any);

                await expect
                    .poll(
                        async () => ((await adminClient.getConfig()) as any)?.AutoTranslationSettings?.RestrictDMAndGM,
                    )
                    .toBe(true);
                await expect.poll(async () => (await adminClient.getClientConfig()).EnableAutoTranslation).toBe('true');
                await expect
                    .poll(async () => (await adminClient.getClientConfig()).RestrictDMAndGMAutotranslation)
                    .toBe('true');

                const peerData = await pw.random.user('dm-peer-restricted');
                const peerUser = await adminClient.createUser(peerData, '', '');
                await adminClient.addToTeam(team.id, peerUser.id);
                await adminClient.createDirectChannel([user.id, peerUser.id]);

                const {app, channelsPage} = await pw.testBrowser.login(user);
                await channelsPage.goto(team.name, `@${peerUser.username}`);
                await channelsPage.toBeVisible();

                const menu = await app.channelHeader.clickOpenMenuButton();
                await expect(menu.editHeaderMenuItem.locator).toBeVisible();
                await expect(menu.channelSettingsMenuItem.locator).toHaveCount(0);
            } finally {
                await adminClient.updateConfig(originalConfig as any);
            }
        },
    );

    test(
        'DM header saves from Channel Settings',
        {
            tag: ['@autotranslation', '@permissions'],
        },
        async ({pw}) => {
            const {adminClient, user, team} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            await enableAutotranslationConfig(adminClient, {
                mockBaseUrl: process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010',
                targetLanguages: ['en', 'es'],
            });

            const otherUserData = await pw.random.user('dm-peer');
            const otherUser = await adminClient.createUser(otherUserData, '', '');
            await adminClient.addToTeam(team.id, otherUser.id);
            const dmChannel = await adminClient.createDirectChannel([user.id, otherUser.id]);

            const {app, channelsPage} = await pw.testBrowser.login(user);
            await channelsPage.goto(team.name, `@${otherUser.username}`);
            await channelsPage.toBeVisible();

            const settings = await openChannelSettings(app);

            const newHeader = `DM header ${pw.random.id()}`;
            await settings.info.fillHeaderTextbox(newHeader);
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();

            await expect.poll(async () => (await adminClient.getChannel(dmChannel.id)).header).toBe(newHeader);
        },
    );

    test(
        'user without permission cannot enable autotranslation at channel level',
        {
            tag: ['@autotranslation', '@permissions'],
        },
        async ({pw}) => {
            const {adminClient, user, team} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            // Enable autotranslation
            await enableAutotranslationConfig(adminClient, {
                mockBaseUrl: process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010',
                targetLanguages: ['en', 'es'],
            });

            const channelName = `autotranslation-perm-${pw.random.id()}`;
            const created = await adminClient.createChannel({
                team_id: team.id,
                name: channelName,
                display_name: 'Permission Test Channel',
                type: 'O',
            });
            await adminClient.addToChannel(user.id, created.id);

            const {app, channelsPage} = await pw.testBrowser.login(user);
            await channelsPage.goto(team.name, channelName);
            await channelsPage.toBeVisible();

            const settings = await openChannelSettings(app);
            const configTabVisible = await settings.tabs.configurationTab.locator.isVisible();
            if (configTabVisible) {
                await settings.tabs.configurationTab.select();
                await expect(settings.configuration.autotranslationSwitch.locator).not.toBeVisible();
            }

            // Restore autotranslation to disabled via patchConfig (race-safe)
            await disableAutotranslationConfig(adminClient);
        },
    );
});

/** Opens the System Scheme page under System Console > Permissions. */
async function gotoSystemSchemePage(app: App) {
    await app.page.goto(generated.AdminConsolePage.path() + '/user_management/permissions/system_scheme');
    await expect(app.admin.permissions.rowItems.first()).toBeVisible();
}

/**
 * Checks "Manage Channel Auto Translation" is checked (ON) for a role: its rows (public and private channels) are the
 * ones keyed `<role>-…-manage_<type>_channel_auto_translation`.
 */
async function expectManageChannelAutoTranslationChecked(app: App, role: string) {
    const {permissions} = app.admin;
    const keys = (await permissions.rowKeys()).filter(
        (k) => k.startsWith(`${role}-`) && k.endsWith('_channel_auto_translation'),
    );
    expect(keys.length).toBeGreaterThan(0);
    for (const key of keys) {
        await expect(permissions.row(key).checkbox.checked.locator).toBeVisible();
    }
}

/** Opens Channel Settings from the channel header menu. */
async function openChannelSettings(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await expect(settings.tabs.infoTab.locator).toBeVisible();
    return settings;
}

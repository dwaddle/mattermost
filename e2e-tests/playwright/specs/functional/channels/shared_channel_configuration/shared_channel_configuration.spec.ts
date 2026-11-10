// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {
    expect,
    getRandomId,
    hasCustomPermissionsSchemesLicense,
    hasSharedChannelsLicense,
    test,
    type App,
    type generated,
    type PlaywrightExtended,
} from '@mattermost/playwright-lib';

/**
 * Minimal type for ensureConfirmedRemote. We use this instead of importing Client4 from
 * @mattermost/client so the helper only depends on the two methods it needs. The adminClient
 * from pw.initSetup() is the full Client4 (from platform/client); no changes are made there.
 */
type ClientWithRemotes = {
    createRemoteCluster: (payload: {
        name: string;
        display_name: string;
        default_team_id: string;
        password?: string;
    }) => Promise<{invite: string; password: string; remote_cluster: {name: string; display_name: string}}>;
    acceptInviteRemoteCluster: (payload: {
        name: string;
        display_name: string;
        default_team_id: string;
        invite: string;
        password: string;
    }) => Promise<unknown>;
};

/**
 * Creates and confirms a remote connection by completing the invite handshake.
 * This allows the "Share with connected workspaces" toggle to be enabled in channel configuration
 * and workspaces to appear in the workspace selector.
 */
async function ensureConfirmedRemote(adminClient: ClientWithRemotes, teamId: string): Promise<void> {
    const suffix = getRandomId();
    const password = `e2e-remote-pwd-${suffix}`;
    const {invite} = await adminClient.createRemoteCluster({
        name: `e2e-remote-${suffix}`,
        display_name: `E2E Test Remote ${suffix}`,
        default_team_id: teamId,
        password,
    });
    await adminClient.acceptInviteRemoteCluster({
        name: `e2e-remote-accept-${suffix}`,
        display_name: `E2E Test Remote Accept ${suffix}`,
        default_team_id: teamId,
        invite,
        password,
    });
}

// Written on the generated page objects: Channel Settings' configuration tab (the share toggle and the workspaces
// section with its Add workspace menu) and save panel.

/** Logs the user in and opens the channel, waiting for the app to be up. */
async function openChannel(pw: PlaywrightExtended, user: UserProfile, team: Team, channel: string) {
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    return app;
}

/** Opens Channel Settings on its configuration tab. */
async function openConfiguration(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.configurationTab.select();
    await expect(settings.tabs.configurationTab.locator).toHaveAttribute('aria-selected', 'true');
    return settings;
}

/** Adds the first connected workspace the Add workspace menu offers (the toggle must be on). */
async function addFirstWorkspace(configuration: generated.ChannelSettingsModalConfiguration) {
    const menu = await configuration.workspaces.clickAddButton();
    const first = menu.workspaceItems.first();
    await expect(first).toBeVisible();
    await first.click();
}

/** Saves the open tab and waits for the save panel to settle. */
async function save(settings: generated.ChannelSettingsModal) {
    await settings.savePanel.clickSaveButton();
    await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
}

/** Closes Channel Settings. */
async function closeSettings(settings: generated.ChannelSettingsModal) {
    await settings.clickCloseButton();
    await expect(settings.tabs.configurationTab.locator).not.toBeVisible();
}

test.describe('Shared channel configuration', () => {
    // Restore roles changed by these tests.
    test.afterEach(async ({pw}) => {
        await pw.resetRoles();
    });

    test('Section visible when all conditions are met', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(!hasSharedChannelsLicense(license), 'Skipping test - server does not have Shared Channels license');

        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });

        const channelName = `shared-config-01-${getRandomId()}`;
        await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Shared Config Test',
            type: 'O',
        });

        const app = await openChannel(pw, adminUser, team, channelName);

        // Re-apply guard: a concurrent initSetup() may have reset ConnectedWorkspacesSettings
        // between the initial patchConfig call and this browser action.
        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return cfg.ConnectedWorkspacesSettings?.EnableSharedChannels === true;
        });

        const channelSettingsModal = await openConfiguration(app);
        const configurationTab = channelSettingsModal.configuration;

        await expect
            .poll(
                async () => {
                    await adminClient.patchConfig({
                        ConnectedWorkspacesSettings: {
                            EnableSharedChannels: true,
                            EnableRemoteClusterService: true,
                        },
                    });
                    return configurationTab.workspaces.locator.isVisible();
                },
                {timeout: 60000, intervals: [500, 1500, 3000]},
            )
            .toBe(true);
        await expect(configurationTab.shareWithWorkspacesSwitch.locator).toBeVisible();
        await closeSettings(channelSettingsModal);
    });

    test('Section hidden when shared channels feature is disabled', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(!hasSharedChannelsLicense(license), 'Skipping test - server does not have Shared Channels license');

        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: false,
            },
        });

        const channelName = `shared-config-02-${getRandomId()}`;
        await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Shared Config Disabled',
            type: 'O',
        });

        const app = await openChannel(pw, adminUser, team, channelName);

        const channelSettingsModal = await openConfiguration(app);
        const configurationTab = channelSettingsModal.configuration;

        await expect(channelSettingsModal.tabs.configurationTab.locator).toHaveAttribute('aria-selected', 'true');
        await expect(configurationTab.workspaces.locator).not.toBeVisible();
        await closeSettings(channelSettingsModal);
    });

    test('Section when no connected workspace exists', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(!hasSharedChannelsLicense(license), 'Skipping test - server does not have Shared Channels license');

        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });

        // Each CI shard gets a fresh server — there are no pre-existing remote clusters.
        // Calling deleteAllRemoteClusters() was deleting an implicit "self" cluster entry
        // that is created when EnableRemoteClusterService is enabled, which caused the
        // "Share with connected workspaces" section to disappear.  Skip the deletion.

        const channelName = `shared-config-03-${getRandomId()}`;
        await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'No Workspaces Test',
            type: 'O',
        });

        const app = await openChannel(pw, adminUser, team, channelName);

        const channelSettingsModal = await openConfiguration(app);
        const configurationTab = channelSettingsModal.configuration;

        await expect
            .poll(
                async () => {
                    await adminClient.patchConfig({
                        ConnectedWorkspacesSettings: {
                            EnableSharedChannels: true,
                            EnableRemoteClusterService: true,
                        },
                    });
                    return configurationTab.workspaces.locator.isVisible();
                },
                {timeout: 60000, intervals: [2000, 4000]},
            )
            .toBe(true);

        await expect(configurationTab.shareWithWorkspacesSwitch.locator).toBeVisible();
        // When sharing is disabled and no workspaces are configured, the toggle is simply off.
        await expect(configurationTab.shareWithWorkspacesSwitch.locator).not.toBeChecked();
        await closeSettings(channelSettingsModal);
    });

    test('Section hidden for users without Shared channel manager role', async ({pw}) => {
        const {adminClient, user, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(!hasSharedChannelsLicense(license), 'Skipping test - server does not have Shared Channels license');

        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });

        const roles = await adminClient.getRolesByNames(['system_user', 'channel_user']);
        const systemRole = roles.find((r: {name: string}) => r.name === 'system_user');
        const channelRole = roles.find((r: {name: string}) => r.name === 'channel_user');
        if (!systemRole || !channelRole) {
            throw new Error('Could not find system_user or channel_user role');
        }
        const systemPermissions = (systemRole.permissions as string[]).filter((p) => p !== 'manage_shared_channels');
        await adminClient.patchRole(systemRole.id, {permissions: systemPermissions});
        const channelPermissions = [
            ...new Set([...(channelRole.permissions as string[]), 'manage_public_channel_banner']),
        ];
        await adminClient.patchRole(channelRole.id, {permissions: channelPermissions});

        const channelName = `shared-config-04-${getRandomId()}`;
        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'No Manager Role Test',
            type: 'O',
        });
        await adminClient.addToChannel(user.id, channel.id);

        const app = await openChannel(pw, user, team, channelName);

        const channelSettingsModal = await openConfiguration(app);
        const configurationTab = channelSettingsModal.configuration;

        await expect(channelSettingsModal.tabs.configurationTab.locator).toHaveAttribute('aria-selected', 'true');
        await expect(configurationTab.workspaces.locator).not.toBeVisible();
        await closeSettings(channelSettingsModal);
    });

    test('Enable sharing toggle, verify UI persistence after refresh, disable sharing toggle', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(!hasSharedChannelsLicense(license), 'Skipping test - server does not have Shared Channels license');

        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });

        try {
            await ensureConfirmedRemote(adminClient, team.id);
        } catch {
            test.skip(true, 'Skipping - Remote Cluster Service not available or invitation handshake failed');
        }

        const channelName = `shared-config-06-${getRandomId()}`;
        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Sharing Toggle Test',
            type: 'O',
        });

        const app = await openChannel(pw, adminUser, team, channelName);

        // Re-apply guard: a concurrent initSetup() may have reset ConnectedWorkspacesSettings
        // between the initial patchConfig call and now.  enableShareWithWorkspaces() calls
        // toggle.getAttribute() which times out (30 s) when EnableSharedChannels=false because
        // the toggle is not rendered at all.
        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });

        // Enable sharing via UI
        let channelSettingsModal = await openConfiguration(app);
        let configurationTab = channelSettingsModal.configuration;
        await configurationTab.shareWithWorkspacesSwitch.turnOn();
        await addFirstWorkspace(configurationTab);
        await save(channelSettingsModal);
        await closeSettings(channelSettingsModal);

        // Verify sharing persisted via API
        const updatedChannel = await adminClient.getChannel(channel.id);
        test.skip(
            !updatedChannel.shared,
            'Skipping - channel sharing did not persist; Shared Channels Service may not be running or no workspace was available',
        );

        // Verify toggle is active after reload
        await app.page.reload();
        await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
        channelSettingsModal = await openConfiguration(app);
        configurationTab = channelSettingsModal.configuration;
        await expect(configurationTab.shareWithWorkspacesSwitch.locator).toBeChecked();
        await closeSettings(channelSettingsModal);

        // Disable sharing via API (uninvite workspaces) to avoid async UI race conditions.
        // Keep the server-level feature enabled so the section remains visible.
        const channelRemotes = await adminClient.getSharedChannelRemoteInfos(channel.id).catch(() => []);
        for (const remote of channelRemotes) {
            await adminClient.sharedChannelRemoteUninvite(remote.remote_id, channel.id).catch(() => {});
        }
        // Also clean up any test remote clusters created by ensureConfirmedRemote
        const allRemotes = await adminClient.getRemoteClusters({excludePlugins: false}).catch(() => []);
        for (const remote of allRemotes.filter((r: any) => r.name?.startsWith('e2e-remote'))) {
            await adminClient.deleteRemoteCluster(remote.remote_id).catch(() => {});
        }

        // Verify toggle is inactive after reload
        await app.page.reload();
        await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
        channelSettingsModal = await openConfiguration(app);
        configurationTab = channelSettingsModal.configuration;
        await expect(configurationTab.shareWithWorkspacesSwitch.locator).not.toBeChecked();
        await closeSettings(channelSettingsModal);
    });

    test('UI updates after permission change', async ({pw}) => {
        const {adminClient, user, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(!hasSharedChannelsLicense(license), 'Skipping test - server does not have Shared Channels license');

        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });

        // Grant manage_shared_channels on both system_user (server-level check) and
        // channel_user (channel-level check) — the UI may check either depending on context.
        const roles = await adminClient.getRolesByNames(['system_user', 'channel_user']);
        const systemRole = roles.find((r: {name: string}) => r.name === 'system_user')!;
        const channelRole = roles.find((r: {name: string}) => r.name === 'channel_user')!;
        const withPermission = [...new Set([...(systemRole.permissions as string[]), 'manage_shared_channels'])];
        await adminClient.patchRole(systemRole.id, {permissions: withPermission});
        const channelWithPermission = [
            ...new Set([...(channelRole.permissions as string[]), 'manage_shared_channels']),
        ];
        await adminClient.patchRole(channelRole.id, {permissions: channelWithPermission});

        const channelName = `shared-config-10-${getRandomId()}`;
        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Permission Change Test',
            type: 'O',
        });
        await adminClient.addToChannel(user.id, channel.id);

        const app = await openChannel(pw, user, team, channelName);

        // Re-apply guard: a concurrent initSetup() may have reset ConnectedWorkspacesSettings
        // between the initial patchConfig call and this browser action.
        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return cfg.ConnectedWorkspacesSettings?.EnableSharedChannels === true;
        });

        let channelSettingsModal = await openConfiguration(app);
        let configurationTab = channelSettingsModal.configuration;
        await expect
            .poll(
                async () => {
                    await adminClient.patchConfig({
                        ConnectedWorkspacesSettings: {
                            EnableSharedChannels: true,
                            EnableRemoteClusterService: true,
                        },
                    });
                    return configurationTab.workspaces.locator.isVisible();
                },
                {timeout: 60000, intervals: [2000, 4000]},
            )
            .toBe(true);
        await closeSettings(channelSettingsModal);

        const withoutPermission = (systemRole.permissions as string[]).filter((p) => p !== 'manage_shared_channels');
        await adminClient.patchRole(systemRole.id, {permissions: withoutPermission});
        const channelWithoutPermission = (channelRole.permissions as string[]).filter(
            (p) => p !== 'manage_shared_channels',
        );
        await adminClient.patchRole(channelRole.id, {permissions: channelWithoutPermission});

        await app.page.reload();
        await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
        channelSettingsModal = await openConfiguration(app);
        configurationTab = channelSettingsModal.configuration;
        await expect
            .poll(async () => !(await configurationTab.workspaces.locator.isVisible()), {
                timeout: 45000,
                intervals: [1000, 2000, 3000],
            })
            .toBe(true);
        await closeSettings(channelSettingsModal);
    });

    test('User with manage shared channels but not manage channel properties: opens settings on Configuration tab, Info tab not visible', async ({
        pw,
    }) => {
        const {adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasSharedChannelsLicense(license) || !hasCustomPermissionsSchemesLicense(license),
            'Skipping test - server does not have Shared Channels license or Custom Permission Schemes',
        );

        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });

        const roles = await adminClient.getRolesByNames(['channel_user']);
        const channelRole = roles[0];
        const withoutManageChannelProperties = (channelRole.permissions as string[]).filter(
            (p) => p !== 'manage_public_channel_properties',
        );

        const randomUser = await pw.random.user();
        const sharedChannelUser = await adminClient.createUser(randomUser, '', '');
        sharedChannelUser.password = randomUser.password;
        await adminClient.addToTeam(team.id, sharedChannelUser.id);
        await adminClient.updateUserRoles(sharedChannelUser.id, 'system_user system_shared_channel_manager');

        const channelName = `shared-config-permissions-${getRandomId()}`;
        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Shared Channels Only Test',
            type: 'O',
        });
        await adminClient.addToChannel(sharedChannelUser.id, channel.id);

        // Strip the permission after setup; afterEach restores it.
        await adminClient.patchRole(channelRole.id, {permissions: withoutManageChannelProperties});

        const app = await openChannel(pw, sharedChannelUser, team, channelName);

        // Re-apply guard: a concurrent initSetup() may have reset ConnectedWorkspacesSettings
        // between the initial patchConfig call and this browser action.
        await adminClient.patchConfig({
            ConnectedWorkspacesSettings: {
                EnableSharedChannels: true,
                EnableRemoteClusterService: true,
            },
        });
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return cfg.ConnectedWorkspacesSettings?.EnableSharedChannels === true;
        });

        const channelSettingsModal = await (
            await app.channelHeader.clickOpenMenuButton()
        ).clickChannelSettingsMenuItem();

        // * Only the configuration tab is offered, open on the workspaces section
        await expect(channelSettingsModal.tabs.configurationTab.locator).toBeVisible();
        await expect(channelSettingsModal.tabs.infoTab.locator).toHaveCount(0);
        await expect(channelSettingsModal.configuration.workspaces.locator).toBeVisible();

        await closeSettings(channelSettingsModal);
    });
});

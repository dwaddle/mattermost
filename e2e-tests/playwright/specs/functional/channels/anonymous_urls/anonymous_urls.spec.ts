// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Channel} from '@mattermost/types/channels';
import type {Team} from '@mattermost/types/teams';

import {expect, generated, getAdminClient, test, type App} from '@mattermost/playwright-lib';

// Written on the generated page objects: the System Console's Users and Teams setting and Save, the sidebar's "+" menu
// and the new channel dialog (name, URL section, Create / Cancel), the team menu and the create-team form (name, Next,
// URL, Finish), Channel Settings' and Team Settings' info tabs, the channel header, the channel switcher's results by
// channel id, the search box and results by post id with their Jump link, the post list, and the channel header's
// plugin actions (Calls).

declare module '@mattermost/playwright-lib' {
    interface PluginKeys {
        com_mattermost_calls: true;
    }
}

const OBFUSCATED_SLUG_RE = /^[a-z0-9]{26}$/;

async function skipIfNoAdvancedLicense(adminClient: any) {
    const license = await adminClient.getClientLicenseOld();
    test.skip(license.SkuShortName !== 'advanced', 'Skipping test - server does not have enterprise advanced license');
}

async function setAnonymousUrls(adminClient: any, enabled: boolean) {
    await adminClient.patchConfig({PrivacySettings: {UseAnonymousURLs: enabled}});
}

function expectObfuscatedSlug(slug: string) {
    expect(slug).toMatch(OBFUSCATED_SLUG_RE);
}

function expectReadableSlug(slug: string, expectedSlug?: string) {
    if (expectedSlug) {
        expect(slug).toBe(expectedSlug);
    }

    expect(slug).not.toMatch(OBFUSCATED_SLUG_RE);
}

/** Opens the channel (default: the team's town square; `@user` or a group channel name for messages). */
async function goto(app: App, team: Pick<Team, 'name'> | string, channel = 'town-square') {
    const path = channel.startsWith('@') || /^[a-z0-9]{40}$/.test(channel) ? 'messages' : 'channels';
    await app.channelsPage.goto({team, channel, path});
}

/** Logs the user in on the team's town square (their first team when none is given). */
async function login(pw: any, user: any, team?: Pick<Team, 'name'>) {
    const {app} = await pw.testBrowser.login(user);
    if (team) {
        await goto(app, team);
    } else {
        await app.page.goto('/');
        await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
    }
    return app as App;
}

/** Opens the new channel dialog from the sidebar's "+" menu. */
async function openNewChannelModal(app: App) {
    const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
    await expect(modal.nameTextbox.locator).toBeVisible();
    return modal;
}

async function createChannelFromUI(app: App, displayName: string) {
    const modal = await openNewChannelModal(app);
    await modal.fillNameTextbox(displayName);
    await modal.clickConfirmButton();
    await expect(modal.nameTextbox.locator).not.toBeVisible();
    await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
}

/** Opens the create-team form from the team menu. */
async function openCreateTeamForm(app: App) {
    await (await app.lhs.header.clickOpenTeamMenuButton()).clickCreateTeamMenuItem();
    await expect(app.createTeam.nameTextbox.locator).toBeVisible();
    return app.createTeam;
}

async function createTeamFromUI(app: App, displayName: string) {
    const form = await openCreateTeamForm(app);
    await form.fillNameTextbox(displayName);
    await form.clickNextButton();
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
}

async function getChannelByDisplayName(adminClient: any, teamId: string, displayName: string): Promise<Channel> {
    const channels = await adminClient.getChannels(teamId);
    const channel = channels.find((candidate: any) => candidate.display_name === displayName);

    expect(channel).toBeDefined();

    return channel!;
}

async function getTeamByDisplayName(adminClient: any, displayName: string): Promise<Team> {
    const teams = await adminClient.getMyTeams();
    const team = teams.find((candidate: any) => candidate.display_name === displayName);

    expect(team).toBeDefined();

    return team!;
}

async function createAnonymousUrlChannel(
    app: App,
    adminClient: any,
    teamName: string,
    teamId: string,
    displayName: string,
) {
    await setAnonymousUrls(adminClient, true);

    // Wait until the server confirms UseAnonymousURLs=true.
    // expect.poll gives reliable retry semantics vs. a manual break-loop.
    await expect
        .poll(
            async () => {
                const cfg = await adminClient.getConfig();
                return cfg.PrivacySettings?.UseAnonymousURLs;
            },
            {timeout: duration.half_min, intervals: [500, 1000, 2000]},
        )
        .toBe(true);

    // Final re-apply immediately before the UI action to close the race window
    // between the polling confirmation and the channel-creation POST reaching
    // the server (the modal open + fill + submit adds ~200–500 ms of latency).
    await setAnonymousUrls(adminClient, true);

    await createChannelFromUI(app, displayName);

    const channel = await getChannelByDisplayName(adminClient, teamId, displayName);
    expectObfuscatedSlug(channel.name);
    await expect(app.page).toHaveURL(new RegExp(`/${teamName}/channels/${channel.name}$`));

    return channel;
}

/** Posts a message from the center composer and returns its post id. */
async function postMessage(app: App, message: string) {
    const {postCreate, postList} = app.center;
    await postCreate.fillMessageTextbox(message);
    await postCreate.clickSendButton();
    await expect
        .poll(async () => {
            const id = (await postList.postKeys()).at(-1);
            return id ? postList.post({id}).messageText.locator.textContent() : '';
        })
        .toContain(message);
    return (await postList.postKeys()).at(-1)!;
}

/** Finds a channel with the channel switcher (Ctrl/Cmd+K) and opens it. */
async function switchTo(app: App, search: string, channel: Pick<Channel, 'id'>) {
    await app.center.postCreate.messageTextbox.locator.press('ControlOrMeta+K');
    await app.quickSwitchModal.searchTextbox.fill(search);
    const result = app.quickSwitchModal.suggestions.item(channel.id).locator;
    await expect(result).toBeVisible();
    return result;
}

/** The System Console's anonymous URLs setting (Site Configuration > Users and Teams). */
async function openAnonymousUrlsSetting(app: App) {
    await app.page.goto(`${generated.AdminConsolePage.path()}/site_config/users_and_teams`);
    const setting = app.admin.setting('PrivacySettings.UseAnonymousURLs');
    await expect(setting.trueRadio.locator).toBeVisible();
    return setting;
}

/** Saves the System Console page and waits for the button to settle back to "Save". */
async function saveConsole(app: App) {
    await app.admin.clickSaveButton();
    await expect(app.admin.saveButton.locator).toHaveText('Save');
}

test.describe('Anonymous URLs', () => {
    // initSetup patches only the on-prem overrides, so PrivacySettings survives from whichever
    // test ran last. Start every test from the default (off); tests needing it on enable it.
    test.beforeEach(async () => {
        const {adminClient} = await getAdminClient({skipLog: true});
        await setAnonymousUrls(adminClient, false);
    });

    /**
     * @objective Verify that the anonymous URLs setting can be toggled on from System Console and persists after navigation
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'enables anonymous URLs setting from System Console and verifies it persists',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            // # Initialize setup and check license
            const {adminUser, adminClient} = await pw.initSetup({withDefaultProfileImage: false});
            const license = await adminClient.getClientLicenseOld();
            test.skip(
                license.SkuShortName !== 'advanced',
                'Skipping test - server does not have enterprise advanced license',
            );

            // # Log in as admin and open Users and Teams
            const {app} = await pw.testBrowser.login(adminUser);
            let setting = await openAnonymousUrlsSetting(app);

            // * Verify the setting is initially false
            await expect(setting.falseRadio.locator).toBeChecked();
            await expect(setting.trueRadio.locator).not.toBeChecked();

            // # Enable anonymous URLs by clicking the True radio
            await setting.trueRadio.locator.check();

            // * Verify it is now true
            await expect(setting.trueRadio.locator).toBeChecked();

            // # Save settings
            await saveConsole(app);
            await expect
                .poll(async () => (await adminClient.getConfig()).PrivacySettings?.UseAnonymousURLs === true, {
                    timeout: duration.half_min,
                    intervals: [500, 1500, 3000],
                })
                .toBe(true);

            // # Navigate away and come back
            await app.page.goto(`${generated.AdminConsolePage.path()}/environment/notifications`);
            await expect(setting.trueRadio.locator).not.toBeVisible();

            // Re-apply guard: a concurrent initSetup() → updateConfig(defaultConfig) may have
            // reset PrivacySettings.UseAnonymousURLs=false while we were navigating away.
            // Re-patch and confirm propagation before navigating back.
            await adminClient.patchConfig({PrivacySettings: {UseAnonymousURLs: true}});
            await expect
                .poll(async () => (await adminClient.getConfig()).PrivacySettings?.UseAnonymousURLs === true, {
                    timeout: duration.half_min,
                    intervals: [500, 1000, 2000],
                })
                .toBe(true);

            setting = await openAnonymousUrlsSetting(app);

            // * Verify the setting is still enabled
            await expect(setting.trueRadio.locator).toBeChecked();

            // # Reset to false for cleanup
            await setting.falseRadio.locator.check();
            await saveConsole(app);
        },
    );

    /**
     * @objective Verify that the channel URL editor is hidden when creating a new channel with anonymous URLs enabled
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'hides channel URL editor when creating new channel with anonymous URLs enabled',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            // # Initialize setup and configure anonymous URLs
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            const license = await adminClient.getClientLicenseOld();
            test.skip(
                license.SkuShortName !== 'advanced',
                'Skipping test - server does not have enterprise advanced license',
            );

            await adminClient.addToTeam(team.id, adminUser.id);
            await setAnonymousUrls(adminClient, true);

            await expect
                .poll(
                    async () => {
                        const cfg = await adminClient.getConfig();
                        return cfg.PrivacySettings?.UseAnonymousURLs === true;
                    },
                    {timeout: duration.half_min, intervals: [500, 1500, 3000]},
                )
                .toBe(true);

            // # Log in and open the new channel dialog
            const app = await login(pw, adminUser, team);
            await setAnonymousUrls(adminClient, true);
            const modal = await openNewChannelModal(app);

            // # Fill in a display name
            await modal.fillNameTextbox('Anonymous Test Channel');

            // * The URL section stays hidden
            await expect(modal.nameTextbox.locator).toHaveValue('Anonymous Test Channel');
            await expect
                .poll(async () => !(await modal.url.labelText.locator.isVisible()), {
                    timeout: 30000,
                    intervals: [500, 1500],
                })
                .toBe(true);

            await modal.clickCancelButton();
            await expect(modal.nameTextbox.locator).not.toBeVisible();
        },
    );

    /**
     * @objective Verify that a channel created with anonymous URLs enabled gets an obfuscated URL slug
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'creates channel with obfuscated URL slug when anonymous URLs enabled',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            // # Initialize setup and enable anonymous URLs
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            const license = await adminClient.getClientLicenseOld();
            test.skip(
                license.SkuShortName !== 'advanced',
                'Skipping test - server does not have enterprise advanced license',
            );

            await setAnonymousUrls(adminClient, true);

            await adminClient.addToTeam(team.id, adminUser.id);

            // # Create a channel through the UI
            const app = await login(pw, adminUser, team);
            const channelDisplayName = 'Obfuscated Channel ' + Date.now();
            const modal = await openNewChannelModal(app);
            await modal.fillNameTextbox(channelDisplayName);
            await setAnonymousUrls(adminClient, true);
            await modal.clickConfirmButton();
            await expect(app.channelHeader.openMenuButton.locator).toContainText(channelDisplayName);

            // * The channel's URL slug is obfuscated, not derived from its name
            const createdChannel = await getChannelByDisplayName(adminClient, team.id, channelDisplayName);

            const humanReadableSlug = channelDisplayName.toLowerCase().replace(/\s+/g, '-');
            expect(createdChannel.name).not.toBe(humanReadableSlug);

            expect(createdChannel.name).toMatch(/^[a-z0-9]{26}$/);

            expect(createdChannel.display_name).toBe(channelDisplayName);
        },
    );

    /**
     * @objective Verify that the channel URL editor is shown when creating a new channel with anonymous URLs disabled
     */
    test(
        'shows channel URL editor when creating new channel with anonymous URLs disabled',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            // # Initialize setup
            const {adminUser} = await pw.initSetup({withDefaultProfileImage: false});

            // # Open the new channel dialog
            const app = await login(pw, adminUser);
            const modal = await openNewChannelModal(app);

            // # Fill in a display name
            await modal.fillNameTextbox('Test Channel URL');

            // * The URL section shows
            await expect(modal.url.labelText.locator).toBeVisible();

            await modal.clickCancelButton();
            await expect(modal.nameTextbox.locator).not.toBeVisible();
        },
    );

    /**
     * @objective Verify that the team URL step is skipped when creating a team with anonymous URLs enabled
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'skips team URL step when creating team with anonymous URLs enabled',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            // # Initialize setup and enable anonymous URLs
            const {adminUser, adminClient} = await pw.initSetup({withDefaultProfileImage: false});
            const license = await adminClient.getClientLicenseOld();
            test.skip(
                license.SkuShortName !== 'advanced',
                'Skipping test - server does not have enterprise advanced license',
            );

            await setAnonymousUrls(adminClient, true);

            const app = await login(pw, adminUser);
            await setAnonymousUrls(adminClient, true);

            // # Open the create-team form
            const form = await openCreateTeamForm(app);

            // * The name step's button creates the team (no URL step follows)
            await expect(form.nextButton.locator).toContainText('Create');

            // # Create the team
            const teamName = 'Anonymous Team ' + Date.now();
            await form.fillNameTextbox(teamName);
            await form.clickNextButton();
            await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();

            // * The team got an obfuscated URL slug
            const createdTeam = await getTeamByDisplayName(adminClient, teamName);
            expect(createdTeam.name).toMatch(/^[a-z0-9]{26}$/);
        },
    );

    /**
     * @objective Verify that the team URL step is shown when creating a team with anonymous URLs disabled
     */
    test(
        'shows team URL step when creating team with anonymous URLs disabled',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            // # Initialize setup
            const {adminUser} = await pw.initSetup({withDefaultProfileImage: false});

            // # Open the create-team form
            const app = await login(pw, adminUser);
            const form = await openCreateTeamForm(app);

            // * The name step leads to a next step
            await expect(form.nextButton.locator).toContainText('Next');

            // # Fill in the name and go on
            await form.fillNameTextbox('Test Team URL Step');
            await form.clickNextButton();

            // * The URL step shows, finishing the form
            await expect(form.urlTextbox.locator).toBeVisible();
            await expect(form.finishButton.locator).toBeVisible();
            await expect(form.finishButton.locator).toContainText('Finish');
        },
    );

    /**
     * @objective Verify that archiving and unarchiving an anonymous URL channel keeps its route
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'preserves archived anonymous channel routes and restores channel access after unarchive',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);
            await setAnonymousUrls(adminClient, true);
            await adminClient.addToTeam(team.id, adminUser.id);

            const app = await login(pw, adminUser, team);

            await setAnonymousUrls(adminClient, true);

            // # Create a channel with an obfuscated slug
            const channelDisplayName = `Archived Anonymous ${pw.random.id()}`;
            await createChannelFromUI(app, channelDisplayName);

            const createdChannel = await getChannelByDisplayName(adminClient, team.id, channelDisplayName);
            expectObfuscatedSlug(createdChannel.name);

            // # Archive and unarchive it
            await adminClient.deleteChannel(createdChannel.id);
            const archivedChannel = await adminClient.getChannel(createdChannel.id);

            // * The slug survives both
            expect(archivedChannel.name).toBe(createdChannel.name);

            const restoredChannel = await adminClient.unarchiveChannel(createdChannel.id);
            expect(restoredChannel.name).toBe(createdChannel.name);

            // # Open it from the sidebar
            await app.page.reload();
            await app.lhs.channelList.channel(createdChannel).clickLink();

            // * The channel opens on its original route
            await expect(app.channelHeader.openMenuButton.locator).toContainText(channelDisplayName);
            await expect(app.page).toHavePath(`/${team.name}/channels/${createdChannel.name}`);
        },
    );

    /**
     * @objective Verify that enabling anonymous URLs leaves existing readable routes alone and obfuscates only new
     * channels and teams
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'keeps existing readable routes unchanged and obfuscates only newly created channels and teams',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Create a channel and a team with readable slugs before enabling anonymous URLs
            const legacyChannelSlug = `legacy-channel-${pw.random.id()}`;
            const legacyChannelDisplayName = `Legacy Channel ${pw.random.id()}`;
            const legacyChannel = await adminClient.createChannel({
                team_id: team.id,
                name: legacyChannelSlug,
                display_name: legacyChannelDisplayName,
                type: 'O',
            });

            const legacyTeamSlug = `legacy-team-${pw.random.id()}`;
            const legacyTeamDisplayName = `Legacy Team ${pw.random.id()}`;
            const legacyTeam = await adminClient.createTeam({
                name: legacyTeamSlug,
                display_name: legacyTeamDisplayName,
                type: 'O',
            } as any);

            expectReadableSlug(legacyChannel.name, legacyChannelSlug);
            expectReadableSlug(legacyTeam.name, legacyTeamSlug);

            // # Enable anonymous URLs
            await setAnonymousUrls(adminClient, true);

            // * The existing slugs are unchanged
            const legacyChannelAfterToggle = await adminClient.getChannel(legacyChannel.id);
            const legacyTeamAfterToggle = await adminClient.getTeam(legacyTeam.id);

            expectReadableSlug(legacyChannelAfterToggle.name, legacyChannelSlug);
            expectReadableSlug(legacyTeamAfterToggle.name, legacyTeamSlug);

            // * The legacy channel still opens on its readable route
            const {app} = await pw.testBrowser.login(adminUser);
            await goto(app, team, legacyChannelSlug);
            await expect(app.page).toHavePath(`/${team.name}/channels/${legacyChannelSlug}`);

            // # Create a new channel
            const anonymousChannelDisplayName = `Anonymous Channel ${pw.random.id()}`;
            await goto(app, team);
            await setAnonymousUrls(adminClient, true);
            await pw.waitUntil(async () => {
                const cfg = await adminClient.getConfig();
                return (cfg as any).PrivacySettings?.UseAnonymousURLs === true;
            });
            await createChannelFromUI(app, anonymousChannelDisplayName);

            // * It gets an obfuscated slug and route
            const anonymousChannel = await getChannelByDisplayName(adminClient, team.id, anonymousChannelDisplayName);

            expectObfuscatedSlug(anonymousChannel.name);
            await expect(app.page).toHavePath(`/${team.name}/channels/${anonymousChannel.name}`);

            // # Create a new team
            const anonymousTeamDisplayName = `Anonymous Team ${pw.random.id()}`;
            await setAnonymousUrls(adminClient, true);
            await createTeamFromUI(app, anonymousTeamDisplayName);

            // * It gets an obfuscated slug and route
            const anonymousTeam = await getTeamByDisplayName(adminClient, anonymousTeamDisplayName);

            expectObfuscatedSlug(anonymousTeam.name);
            await expect(app.page).toHaveURL(new RegExp(`/${anonymousTeam.name}/`));
        },
    );

    /**
     * @objective Verify that direct and group message routes stay readable with anonymous URLs enabled
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'keeps direct and group message routes readable when anonymous URLs are enabled',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);
            await setAnonymousUrls(adminClient, true);
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Create a direct and a group message with a post in each
            const secondUser = await pw.createNewUserProfile(adminClient, {prefix: 'anonymousurlsdm'});
            const thirdUser = await pw.createNewUserProfile(adminClient, {prefix: 'anonymousurlsgm'});
            await adminClient.addToTeam(team.id, secondUser.id);
            await adminClient.addToTeam(team.id, thirdUser.id);

            const dmChannel = await adminClient.createDirectChannel([adminUser.id, secondUser.id]);
            const gmChannel = await adminClient.createGroupChannel([adminUser.id, secondUser.id, thirdUser.id]);

            const dmMessage = `Anonymous URL DM ${pw.random.id()}`;
            const gmMessage = `Anonymous URL GM ${pw.random.id()}`;
            const dmPost = await adminClient.createPost({channel_id: dmChannel.id, message: dmMessage});
            const gmPost = await adminClient.createPost({channel_id: gmChannel.id, message: gmMessage});

            // * Their names stay readable
            expect(dmChannel.type).toBe('D');
            expect(gmChannel.type).toBe('G');
            expectReadableSlug(dmChannel.name);
            expectReadableSlug(gmChannel.name);
            expect(dmChannel.name).toContain(adminUser.id);
            expect(dmChannel.name).toContain(secondUser.id);

            // * The direct message opens on its readable route, with its post
            const {app} = await pw.testBrowser.login(adminUser);
            await goto(app, team, `@${secondUser.username}`);

            await expect(app.page).toHavePath(`/${team.name}/messages/@${secondUser.username}`);
            await expect(app.center.postList.post(dmPost).messageText.locator).toContainText(dmMessage);

            // * And so does the group message
            await goto(app, team, gmChannel.name);

            await expect(app.page).toHavePath(`/${team.name}/messages/${gmChannel.name}`);
            await expect(app.center.postList.post(gmPost).messageText.locator).toContainText(gmMessage);
        },
    );

    /**
     * @objective Verify that renaming an anonymous URL channel keeps its obfuscated route
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'renames an anonymous URL channel without changing its obfuscated route',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {adminUser, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);
            await setAnonymousUrls(adminClient, true);
            await adminClient.addToTeam(team.id, adminUser.id);

            const app = await login(pw, adminUser, team);

            // # Create a channel with an obfuscated slug
            const originalDisplayName = `Original Channel ${pw.random.id()}`;
            await setAnonymousUrls(adminClient, true);
            await pw.waitUntil(async () => {
                const cfg = await adminClient.getConfig();
                return (cfg as any).PrivacySettings?.UseAnonymousURLs === true;
            });
            await createChannelFromUI(app, originalDisplayName);

            const createdChannel = await getChannelByDisplayName(adminClient, team.id, originalDisplayName);
            const originalSlug = createdChannel.name;
            expectObfuscatedSlug(originalSlug);

            // # Rename it in Channel Settings
            const renamedDisplayName = `Renamed Channel ${pw.random.id()}`;
            const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
            await settings.info.fillNameTextbox(renamedDisplayName);
            await settings.savePanel.clickSaveButton();

            await pw.waitUntil(
                async () => (await adminClient.getChannel(createdChannel.id)).display_name === renamedDisplayName,
            );
            await settings.clickCloseButton();
            await expect(settings.info.nameTextbox.locator).not.toBeVisible();

            // * The slug is unchanged
            const renamedChannel = await adminClient.getChannel(createdChannel.id);

            expect(renamedChannel.display_name).toBe(renamedDisplayName);
            expect(renamedChannel.name).toBe(originalSlug);
            expectObfuscatedSlug(renamedChannel.name);

            // * The original route opens the renamed channel
            await goto(app, team, originalSlug);

            await expect(app.page).toHavePath(`/${team.name}/channels/${originalSlug}`);
            await expect(app.channelHeader.openMenuButton.locator).toContainText(renamedDisplayName);
        },
    );

    /**
     * @objective Verify that renaming an anonymous URL team keeps its obfuscated route
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'renames an anonymous URL team without changing its obfuscated route',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {adminUser, adminClient} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);
            await setAnonymousUrls(adminClient, true);

            const app = await login(pw, adminUser);

            // # Create a team with an obfuscated slug
            const originalTeamDisplayName = `Original Team ${pw.random.id()}`;
            await setAnonymousUrls(adminClient, true);
            await createTeamFromUI(app, originalTeamDisplayName);

            const createdTeam = await getTeamByDisplayName(adminClient, originalTeamDisplayName);
            const originalTeamSlug = createdTeam.name;
            expectObfuscatedSlug(originalTeamSlug);

            // # Rename it in Team Settings
            const renamedTeamDisplayName = `Renamed Team ${pw.random.id()}`;
            let teamSettings = await (await app.lhs.header.clickOpenTeamMenuButton()).clickTeamSettingsMenuItem();
            await teamSettings.info.fillNameTextbox(renamedTeamDisplayName);
            await teamSettings.savePanel.clickSaveButton();

            await pw.waitUntil(
                async () => (await adminClient.getTeam(createdTeam.id)).display_name === renamedTeamDisplayName,
            );
            await teamSettings.clickCloseButton();
            await expect(teamSettings.info.nameTextbox.locator).not.toBeVisible();

            // * The slug is unchanged
            const renamedTeam = await adminClient.getTeam(createdTeam.id);

            expect(renamedTeam.display_name).toBe(renamedTeamDisplayName);
            expect(renamedTeam.name).toBe(originalTeamSlug);
            expectObfuscatedSlug(renamedTeam.name);

            // * The original route opens the team, with its new name
            await goto(app, originalTeamSlug);

            await expect(app.page).toHaveURL(new RegExp(`/${originalTeamSlug}/`));

            teamSettings = await (await app.lhs.header.clickOpenTeamMenuButton()).clickTeamSettingsMenuItem();
            await expect(teamSettings.info.nameTextbox.locator).toHaveValue(renamedTeamDisplayName);
            await teamSettings.clickCloseButton();
            await expect(teamSettings.info.nameTextbox.locator).not.toBeVisible();
        },
    );

    /**
     * @objective Verify that permalinks to an anonymous URL channel open it, before and after disabling anonymous URLs
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'opens anonymous channel permalinks before and after disabling anonymous URLs',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {adminClient, team, user} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);
            await setAnonymousUrls(adminClient, true);

            const app = await login(pw, user, team);

            // # Create a channel and post in it
            const displayName = `Permalink Channel ${pw.random.id()}`;
            const channel = await createAnonymousUrlChannel(app, adminClient, team.name, team.id, displayName);

            const message = `Anonymous permalink message ${pw.random.id()}`;
            const postId = await postMessage(app, message);
            const permalink = `/${team.name}/pl/${postId}`;

            // # Open the post's permalink
            await app.page.goto(permalink);

            // * It opens the channel on its obfuscated route, showing the post
            await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
            await expect(app.page).toHavePath(`/${team.name}/channels/${channel.name}`);
            await expect(app.center.postList.post({id: postId}).messageText.locator).toContainText(message);

            // # Disable anonymous URLs and open the permalink again
            await setAnonymousUrls(adminClient, false);
            await app.page.goto(permalink);

            // * It still opens the same route
            await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
            await expect(app.page).toHavePath(`/${team.name}/channels/${channel.name}`);
            await expect(app.center.postList.post({id: postId}).messageText.locator).toContainText(message);
        },
    );

    /**
     * @objective Verify that the channel switcher finds channels with obfuscated URLs
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test('channel search finds channels with obfuscated URLs', {tag: '@anonymous_urls'}, async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup({withDefaultProfileImage: false});
        await skipIfNoAdvancedLicense(adminClient);
        await setAnonymousUrls(adminClient, true);

        await adminClient.addToTeam(team.id, user.id);
        const app = await login(pw, user, team);

        await setAnonymousUrls(adminClient, true);

        // # Create three channels
        const createdChannels = [];
        for (let i = 1; i <= 3; i++) {
            const displayName = `Search Test Channel ${i} ${pw.random.id()}`;
            const channel = await createAnonymousUrlChannel(app, adminClient, team.name, team.id, displayName);
            createdChannels.push({channel, displayName});
        }

        const targetChannel = createdChannels[0];

        // # Search for the first from town square
        await goto(app, team);
        const result = await switchTo(app, targetChannel.displayName.substring(0, 15), targetChannel.channel);

        // * It is found by name, and opens on its obfuscated route
        await expect(result).toContainText(targetChannel.displayName);
        await result.click();

        await expect(app.channelHeader.openMenuButton.locator).toContainText(targetChannel.displayName);
        await expect(app.page).toHavePath(`/${team.name}/channels/${targetChannel.channel.name}`);
    });

    /**
     * @objective Verify that jumping from a post search result opens the anonymous URL channel
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test('navigates post search results back to anonymous URL channels', {tag: '@anonymous_urls'}, async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup({withDefaultProfileImage: false});
        await skipIfNoAdvancedLicense(adminClient);
        await setAnonymousUrls(adminClient, true);

        const app = await login(pw, user, team);

        // # Create a channel and post a searchable message
        const displayName = `Search Channel ${pw.random.id()}`;
        const channel = await createAnonymousUrlChannel(app, adminClient, team.name, team.id, displayName);
        const message = `AnonymousSearchableMessage${pw.random.id()}`;
        const postId = await postMessage(app, message);

        // # Search for it from town square
        await goto(app, team);
        await app.globalHeader.search.clickOpenButton();
        await app.searchBox.inputSearchbox.locator.fill(message);
        await app.searchBox.inputSearchbox.locator.press('Enter');

        const result = app.search.results.post({id: postId});
        await expect(result.messageText.locator).toContainText(message);

        // # Jump to it
        await result.locator.hover();
        await result.menu.clickJumpLink();

        // * The channel opens on its obfuscated route, showing the post
        await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
        await expect(app.page).toHaveURL(new RegExp(`/${team.name}/channels/${channel.name}`));
        await expect(app.center.postList.post({id: postId}).messageText.locator).toContainText(message);
    });

    /**
     * @objective Verify that channels with unicode and emoji names get anonymous URLs and stay findable
     *
     * @precondition
     * Server must have an Enterprise Advanced license
     */
    test(
        'creates anonymous URL channels from unicode and emoji display names and keeps them discoverable',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {user, adminClient, team} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);
            await setAnonymousUrls(adminClient, true);

            const app = await login(pw, user, team);

            // # Create a channel from each name and post in it
            const channelTemplates = ['Design review 🚀', 'Roadmap 中文', 'Support & Ops عربى'];
            const createdChannels = [];

            for (const template of channelTemplates) {
                const displayName = `${template} ${pw.random.id().slice(0, 6)}`;
                const channel = await createAnonymousUrlChannel(app, adminClient, team.name, team.id, displayName);

                createdChannels.push({channel, displayName});

                const message = `anonymous-url edge case ${displayName}`;
                const postId = await postMessage(app, message);

                // * The post shows in the channel, on its obfuscated route
                await expect(app.center.postList.post({id: postId}).messageText.locator).toContainText(message);
                await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
                await expect(app.page).toHaveURL(new RegExp(`/${team.name}/channels/${channel.name}$`));
            }

            // # Find the second with the channel switcher
            const searchableChannel = createdChannels[1];

            await goto(app, team);
            const result = await switchTo(app, searchableChannel.displayName, searchableChannel.channel);
            await result.click();

            // * It opens on its obfuscated route
            await expect(app.channelHeader.openMenuButton.locator).toContainText(searchableChannel.displayName);
            await expect(app.page).toHaveURL(new RegExp(`/${team.name}/channels/${searchableChannel.channel.name}$`));
        },
    );

    /**
     * @objective Verify that the Calls entry point works in anonymous URL channels with special-character names
     *
     * @precondition
     * Server must have an Enterprise Advanced license and the Calls plugin
     */
    test(
        'shows calls entry point in anonymous URL channels with special-character names and preserves the obfuscated route',
        {tag: '@anonymous_urls'},
        async ({pw}) => {
            const {adminUser, adminClient, team, user} = await pw.initSetup({withDefaultProfileImage: false});
            await skipIfNoAdvancedLicense(adminClient);

            const pluginStatuses = await adminClient.getPluginStatuses();
            test.skip(
                !pluginStatuses.some((plugin: {plugin_id: string}) => plugin.plugin_id === 'com.mattermost.calls'),
                'Skipping test - Calls plugin is not installed',
            );

            await pw.ensurePluginsLoaded(['com.mattermost.calls']);
            await pw.shouldHaveCallsEnabled();
            await setAnonymousUrls(adminClient, true);
            await adminClient.addToTeam(team.id, adminUser.id);

            // # Create a channel with a special-character name
            const app = await login(pw, user, team);

            const displayName = `Calls & Planning 🚀 ${pw.random.id().slice(0, 6)}`;
            const channel = await createAnonymousUrlChannel(app, adminClient, team.name, team.id, displayName);
            await adminClient.addToChannel(adminUser.id, channel.id);

            // * The Calls button shows
            await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
            await expect(app.channelHeader.pluginActions.action('com_mattermost_calls').locator).toBeVisible();

            // # Open the channel as another member
            const {app: other} = await pw.testBrowser.login(adminUser);
            await goto(other, team, channel.name);

            // * It opens on its obfuscated route, with the Calls button
            await expect(other.channelHeader.openMenuButton.locator).toContainText(displayName);
            await expect(other.page).toHaveURL(new RegExp(`/${team.name}/channels/${channel.name}$`));
            const callButton = other.channelHeader.pluginActions.action('com_mattermost_calls');
            await expect(callButton.locator).toBeVisible();

            // # Start a call
            await callButton.click();

            // * The channel and its route stay as they were
            await expect(other.channelHeader.openMenuButton.locator).toContainText(displayName);
            await expect(other.page).toHaveURL(new RegExp(`/${team.name}/channels/${channel.name}`));
        },
    );
});

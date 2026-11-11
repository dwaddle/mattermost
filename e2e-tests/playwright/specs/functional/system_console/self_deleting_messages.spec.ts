// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {AdminConfig} from '@mattermost/types/config';

import {Api, expect, generated, openChannel, test} from '@mattermost/playwright-lib';

import {concealedPost, reveal, sendBorMessage, timeRemaining} from '../channels/burn_on_read/support';

/**
 * Patch the Posts page required fields to known valid values so tests that
 * load the page always start with a saveable form state, regardless of what
 * other parallel tests may have left in the server config.
 */
async function resetPostsConfig(adminClient: {patchConfig: (config: Partial<AdminConfig>) => Promise<unknown>}) {
    await adminClient.patchConfig({
        ServiceSettings: {
            PersistentNotificationIntervalMinutes: 5,
            PersistentNotificationMaxRecipients: 5,
            PersistentNotificationMaxCount: 6,
        },
    } as Partial<AdminConfig>);
}

test.describe('System Console > Self-Deleting Messages', () => {
    test('admin can enable and disable self-deleting messages', async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Reset Posts section required fields so Save button is always enabled
        await resetPostsConfig(adminClient);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);

        // # Visit system console
        await app.adminConsolePage.goto();

        // # Navigate to Posts section
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        // * Verify Posts section is visible
        await expect(app.admin.pageElement('PostSettings').locator).toBeVisible();

        // Get BoR setting elements
        const enableToggleTrue = app.admin.setting('ServiceSettings.EnableBurnOnRead').trueRadio.locator;
        const enableToggleFalse = app.admin.setting('ServiceSettings.EnableBurnOnRead').falseRadio.locator;
        const durationDropdown = app.admin.setting('ServiceSettings.BurnOnReadDurationSeconds').valueCombobox.locator;
        const maxTTLDropdown = app.admin.setting('ServiceSettings.BurnOnReadMaximumTimeToLiveSeconds').valueCombobox
            .locator;

        // # If feature is enabled, disable it first
        if (await enableToggleTrue.isChecked()) {
            await enableToggleFalse.click();
            await app.admin.saveButton.commit({wait: Api.PatchConfig});
            await expect(app.admin.saveButton).toBeSaved();
        }

        // * Verify dropdowns are disabled when feature is off
        await expect(durationDropdown).toBeDisabled();
        await expect(maxTTLDropdown).toBeDisabled();

        // # Enable the feature
        await enableToggleTrue.click();

        // * Verify feature is enabled
        await expect(enableToggleTrue).toBeChecked();

        // * Verify dropdowns are now enabled
        await expect(durationDropdown).toBeEnabled();
        await expect(maxTTLDropdown).toBeEnabled();

        // # Save settings
        await app.admin.saveButton.commit({wait: Api.PatchConfig});
        await expect(app.admin.saveButton).toBeSaved();

        // # Navigate away and back to verify persistence
        await app.admin.sidebar.category('user_management').section('system_users').clickTitleLink();
        await expect(page).toHaveURL(/\/user_management\/users/);
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        // * Verify feature is still enabled
        await expect(enableToggleTrue).toBeChecked();
    });

    test('admin can configure message duration', async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Reset Posts section required fields so Save button is always enabled
        await resetPostsConfig(adminClient);

        // # Ensure BoR is enabled via API
        const config = await adminClient.getConfig();
        config.ServiceSettings.EnableBurnOnRead = true;
        await adminClient.patchConfig(config);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);

        // # Visit system console
        await app.adminConsolePage.goto();

        // # Navigate to Posts section
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        await expect(app.admin.pageElement('PostSettings').locator).toBeVisible();
        const durationDropdown = app.admin.setting('ServiceSettings.BurnOnReadDurationSeconds').valueCombobox.locator;

        // # Select 60 seconds duration
        await durationDropdown.selectOption('60');

        // # Save settings
        await app.admin.saveButton.commit({wait: Api.PatchConfig});
        await expect(app.admin.saveButton).toBeSaved();

        // # Navigate away and back
        await app.admin.sidebar.category('user_management').section('system_users').clickTitleLink();
        await expect(page).toHaveURL(/\/user_management\/users/);
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        // * Verify duration is still 60 seconds
        await expect(durationDropdown).toHaveValue('60');
    });

    test('admin can configure maximum time to live', async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Reset Posts section required fields so Save button is always enabled
        await resetPostsConfig(adminClient);

        // # Ensure BoR is enabled via API
        const config = await adminClient.getConfig();
        config.ServiceSettings.EnableBurnOnRead = true;
        await adminClient.patchConfig(config);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);

        // # Visit system console
        await app.adminConsolePage.goto();

        // # Navigate to Posts section
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        await expect(app.admin.pageElement('PostSettings').locator).toBeVisible();
        const maxTTLDropdown = app.admin.setting('ServiceSettings.BurnOnReadMaximumTimeToLiveSeconds').valueCombobox
            .locator;

        // # Select 1 day (86400 seconds) max TTL
        await maxTTLDropdown.selectOption('86400');

        // # Save settings
        await app.admin.saveButton.commit({wait: Api.PatchConfig});
        await expect(app.admin.saveButton).toBeSaved();

        // # Navigate away and back
        await app.admin.sidebar.category('user_management').section('system_users').clickTitleLink();
        await expect(page).toHaveURL(/\/user_management\/users/);
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        // * Verify max TTL is still 1 day
        await expect(maxTTLDropdown).toHaveValue('86400');
    });

    test('dropdowns are disabled when feature is disabled', async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Disable BoR via API to start with a known state
        const config = await adminClient.getConfig();
        config.ServiceSettings.EnableBurnOnRead = false;
        await adminClient.patchConfig(config);
        await expect
            .poll(
                async () => {
                    const cfg = await adminClient.getConfig();
                    return cfg.ServiceSettings?.EnableBurnOnRead === false;
                },
                {message: 'the server has the burn-on-read settings just patched'},
            )
            .toBe(true);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);

        // # Visit system console
        await app.adminConsolePage.goto();

        // # Navigate to Posts section
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        await expect(app.admin.pageElement('PostSettings').locator).toBeVisible();
        const enableToggleTrue = app.admin.setting('ServiceSettings.EnableBurnOnRead').trueRadio.locator;
        const enableToggleFalse = app.admin.setting('ServiceSettings.EnableBurnOnRead').falseRadio.locator;
        const durationDropdown = app.admin.setting('ServiceSettings.BurnOnReadDurationSeconds').valueCombobox.locator;
        const maxTTLDropdown = app.admin.setting('ServiceSettings.BurnOnReadMaximumTimeToLiveSeconds').valueCombobox
            .locator;

        // * Verify feature is disabled (from API config) — use built-in retry to tolerate render lag
        await expect(enableToggleFalse).toBeChecked({timeout: 10000});

        // * Verify dropdowns are disabled when feature is off
        await expect(durationDropdown).toBeDisabled({timeout: 30000});
        await expect(maxTTLDropdown).toBeDisabled({timeout: 30000});

        // # Enable the feature (just toggle, don't save)
        await enableToggleTrue.click();

        // * Verify dropdowns are now enabled
        await expect(durationDropdown).not.toBeDisabled({timeout: 30000});
        await expect(maxTTLDropdown).not.toBeDisabled({timeout: 30000});

        // # Toggle back to disabled
        await enableToggleFalse.click();

        // * Verify dropdowns are disabled again
        await expect(durationDropdown).toBeDisabled({timeout: 30000});
        await expect(maxTTLDropdown).toBeDisabled({timeout: 30000});
    });

    test('settings persist after page reload', async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Configure BoR via API with specific values (using valid dropdown options)
        // Duration: 300 (5 minutes), Max TTL: 259200 (3 days)
        await adminClient.patchConfig({
            ServiceSettings: {
                EnableBurnOnRead: true,
                BurnOnReadDurationSeconds: 300,
                BurnOnReadMaximumTimeToLiveSeconds: 259200,
            },
        });
        // Wait until the server confirms the patch before logging in, so the browser
        // reads the correct value when it loads the Posts section. A concurrent
        // initSetup() reset may otherwise overwrite BurnOnReadDurationSeconds.
        await expect
            .poll(
                async () => {
                    const cfg = await adminClient.getConfig();
                    return cfg.ServiceSettings.BurnOnReadDurationSeconds === 300;
                },
                {message: 'the server has the burn-on-read settings just patched'},
            )
            .toBe(true);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);

        // # Visit system console
        await app.adminConsolePage.goto();

        // # Navigate to Posts section
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        await expect(app.admin.pageElement('PostSettings').locator).toBeVisible();
        const enableToggleTrue = app.admin.setting('ServiceSettings.EnableBurnOnRead').trueRadio.locator;
        const durationDropdown = app.admin.setting('ServiceSettings.BurnOnReadDurationSeconds').valueCombobox.locator;
        const maxTTLDropdown = app.admin.setting('ServiceSettings.BurnOnReadMaximumTimeToLiveSeconds').valueCombobox
            .locator;

        // * Verify configured values are displayed
        await expect(enableToggleTrue).toBeChecked();
        await expect(durationDropdown).toHaveValue('300');
        await expect(maxTTLDropdown).toHaveValue('259200');

        // Re-apply guard: a concurrent initSetup() may reset BoR config between
        // the initial page load and this reload.
        await adminClient.patchConfig({
            ServiceSettings: {
                BurnOnReadDurationSeconds: 300,
                BurnOnReadMaximumTimeToLiveSeconds: 259200,
            },
        });
        await expect
            .poll(
                async () => {
                    const cfg = await adminClient.getConfig();
                    return cfg.ServiceSettings.BurnOnReadDurationSeconds === 300;
                },
                {message: 'the server has the burn-on-read settings just patched'},
            )
            .toBe(true);

        // # Reload directly to Posts section
        await page.goto(generated.AdminConsolePage.path({section: 'site_config/posts'}));
        await page.waitForLoadState('networkidle');

        // * Verify values persist after reload — toHaveValue has built-in retry
        await expect(enableToggleTrue).toBeChecked({timeout: 5000});
        await expect(durationDropdown).toHaveValue('300', {timeout: 5000});
        await expect(maxTTLDropdown).toHaveValue('259200', {timeout: 5000});
    });

    test('BoR toggle appears in channels when feature is enabled in System Console', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Reset Posts section required fields so Save button is always enabled
        await resetPostsConfig(adminClient);

        // # First, disable BoR via API to start clean
        const config = await adminClient.getConfig();
        config.ServiceSettings.EnableBurnOnRead = false;
        await adminClient.patchConfig(config);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);

        // # Visit system console
        await app.adminConsolePage.goto();

        // # Navigate to Posts section
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        await expect(app.admin.pageElement('PostSettings').locator).toBeVisible();
        const enableToggleTrue = app.admin.setting('ServiceSettings.EnableBurnOnRead').trueRadio.locator;

        // # Enable BoR feature
        await enableToggleTrue.click();
        await app.admin.saveButton.commit({wait: Api.PatchConfig});
        await expect(app.admin.saveButton).toBeSaved();

        // Re-apply guard: concurrent initSetup() may reset EnableBurnOnRead between UI save and navigation
        await adminClient.patchConfig({ServiceSettings: {EnableBurnOnRead: true}});
        await expect
            .poll(
                async () => {
                    const cfg = await adminClient.getConfig();
                    return cfg.ServiceSettings.EnableBurnOnRead === true;
                },
                {message: 'the server has the burn-on-read settings just patched'},
            )
            .toBe(true);

        // # Navigate to Channels by going to the team URL
        await page.goto(`/${team.name}/channels/off-topic`);
        await page.waitForLoadState('networkidle');

        // * Verify BoR toggle is visible in post create area
        const borButton = app.center.postCreate.burnOnReadButton.locator;
        await expect(borButton).toBeVisible({timeout: 10000});
    });

    test('BoR toggle is hidden when feature is disabled in System Console', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Reset Posts section required fields so Save button is always enabled
        await resetPostsConfig(adminClient);

        // # First, enable BoR via API
        const config = await adminClient.getConfig();
        config.ServiceSettings.EnableBurnOnRead = true;
        await adminClient.patchConfig(config);

        // # Log in as admin
        const {app, page} = await pw.testBrowser.login(adminUser);

        // # Visit system console
        await app.adminConsolePage.goto();

        // # Navigate to Posts section
        await app.admin.sidebar.category('site').section('posts').clickTitleLink();
        await page.waitForLoadState('networkidle');

        await expect(app.admin.pageElement('PostSettings').locator).toBeVisible();
        const enableToggleFalse = app.admin.setting('ServiceSettings.EnableBurnOnRead').falseRadio.locator;

        // # Disable BoR feature
        await enableToggleFalse.click();
        await app.admin.saveButton.commit({wait: Api.PatchConfig});
        await expect(app.admin.saveButton).toBeSaved();

        // Re-apply guard: concurrent initSetup() may re-enable BoR between UI save and navigation
        await adminClient.patchConfig({ServiceSettings: {EnableBurnOnRead: false}});
        await expect
            .poll(
                async () => {
                    const cfg = await adminClient.getConfig();
                    return cfg.ServiceSettings.EnableBurnOnRead === false;
                },
                {message: 'the server has the burn-on-read settings just patched'},
            )
            .toBe(true);

        // # Navigate to Channels by going to the team URL
        await page.goto(`/${team.name}/channels/off-topic`);
        await page.waitForLoadState('networkidle');

        // * Verify BoR toggle is NOT visible in post create area
        const borButton = app.center.postCreate.burnOnReadButton.locator;
        await expect(borButton).not.toBeVisible({timeout: 5000});
    });

    test('configured duration affects timer countdown in channels', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            license.SkuShortName !== 'advanced' && license.short_sku_name !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Configure BoR with 5 minute (300 seconds) duration
        const config = await adminClient.getConfig();
        config.ServiceSettings.EnableBurnOnRead = true;
        config.ServiceSettings.BurnOnReadDurationSeconds = 300; // 5 minutes
        config.ServiceSettings.BurnOnReadMaximumTimeToLiveSeconds = 604800; // 7 days (so max TTL doesn't interfere)
        await adminClient.patchConfig(config);

        // # Verify the config was applied before proceeding (guard against state pollution)
        await expect
            .poll(
                async () => {
                    const cfg = await adminClient.getConfig();
                    return cfg.ServiceSettings.BurnOnReadDurationSeconds === 300;
                },
                {message: 'the server has the burn-on-read settings just patched'},
            )
            .toBe(true);

        // # Create a second user to receive the message
        const randomUser = await pw.random.user();
        const receiver = await adminClient.createUser(randomUser, '', '');
        (receiver as any).password = randomUser.password;
        await adminClient.addToTeam(team.id, receiver.id);

        // # Create a private channel with sender and receiver
        const channelName = `bor-test-${Date.now().toString(36)}`;
        const channel = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: `BoR Duration Test ${channelName}`,
            type: 'P',
        } as any);
        await adminClient.addToChannel(receiver.id, channel.id);

        // # Log in as admin (sender) and post a BoR message
        const senderApp = await openChannel(pw, adminUser, {team, channel: channelName});
        await adminClient.patchConfig({
            ServiceSettings: {
                EnableBurnOnRead: true,
                BurnOnReadDurationSeconds: 300,
                BurnOnReadMaximumTimeToLiveSeconds: 604800,
            },
        });
        await sendBorMessage(senderApp, `Duration test ${Date.now()}`);

        // # Log in as the receiver and find the concealed message
        const receiverApp = await openChannel(pw, receiver as any, {team, channel: channelName});
        const {post} = await concealedPost(receiverApp);

        // Re-apply guard: TTL is set by the server at reveal time; ensure BurnOnReadDurationSeconds
        // is still 300 at the moment of reveal — a concurrent initSetup() may have reset it.
        await adminClient.patchConfig({
            ServiceSettings: {
                EnableBurnOnRead: true,
                BurnOnReadDurationSeconds: 300,
                BurnOnReadMaximumTimeToLiveSeconds: 604800,
            },
        });

        // # Reveal it
        await reveal(post);

        // * Verify the timer shows about 5 minutes: between 4:10 (250s) and 5:00 (300s), allowing for test time
        await expect(post.burnOnReadTimerButton.locator).toBeVisible({timeout: 15000});
        const totalSeconds = await timeRemaining(post);
        expect(totalSeconds).toBeGreaterThanOrEqual(250);
        expect(totalSeconds).toBeLessThanOrEqual(300);
    });
});

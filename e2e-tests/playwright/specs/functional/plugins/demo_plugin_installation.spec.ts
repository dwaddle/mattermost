// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {demoPluginId, demoPluginUrl, getPluginStatus, test, expect} from '@mattermost/playwright-lib';

test('should install and enable demo plugin from URL', async ({pw}) => {
    // # Create and navigate to channels page
    const {adminClient, user, team} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(user);

    await app.teamPage.goto({team});
    await expect(app.center.composer.locator).toBeVisible();

    // # Enable public links before installing plugin
    await adminClient.patchConfig({
        FileSettings: {EnablePublicLink: true},
        ServiceSettings: {
            EnableGifPicker: true,
            EnableOnboardingFlow: false,
            EnableTutorial: false,
        },
        PluginSettings: {
            Plugins: {
                [demoPluginId]: {
                    username: 'demouser',
                    channelname: 'demo_plugin',
                    lastname: 'User',
                },
            },
        },
    });

    // # Remove any existing install, so the install below really downloads from the URL.
    // pw.installAndEnablePlugin is a no-op for an active plugin and only enables an installed
    // one, and the setup project pre-installs the demo plugin, so it would never install here.
    await adminClient.removePlugin(demoPluginId);

    // * Verify the plugin is gone
    await expect.poll(async () => (await getPluginStatus(adminClient, demoPluginId)).isInstalled).toBe(false);

    // # Install from URL and enable
    await adminClient.installPluginFromUrl(demoPluginUrl, true);
    await adminClient.enablePlugin(demoPluginId);

    // * Verify it's active (API validation, no UI)
    await expect
        .poll(async () => {
            return pw.isPluginActive(adminClient, demoPluginId);
        })
        .toBe(true);

    // * Verify plugin details
    const plugins = await adminClient.getPlugins();
    const demoPlugin = plugins.active.find((p) => p.id === demoPluginId);
    expect(demoPlugin).toBeDefined();

    // # Dismiss overlay again if it reappeared after plugin activation.
    // No fixed wait needed — the composer's fill/click actions auto-wait for the
    // input to become interactable once the overlay clears.
    await app.page.keyboard.press('Escape');

    // # Execute slash command
    const {postCreate, postList} = app.center;
    const before = (await postList.postKeys()).at(-1);
    await postCreate.fillMessageTextbox('/demo_plugin true');
    await postCreate.clickSendButton();

    // * Verify the response post
    await expect.poll(async () => (await postList.postKeys()).at(-1)).not.toBe(before);
    const post = postList.post({id: (await postList.postKeys()).at(-1)!});
    await expect(post.locator).toContainText('enabled');
});

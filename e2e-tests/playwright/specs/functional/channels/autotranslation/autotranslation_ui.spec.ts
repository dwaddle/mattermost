// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    disableAutotranslationConfig,
    enableAutotranslationConfig,
    enableChannelAutotranslation,
    getAdminClient,
    hasAutotranslationLicense,
    setUserChannelAutotranslation,
    expect,
    test,
    setMockSourceLanguage,
    type App,
} from '@mattermost/playwright-lib';

import {centerPostContaining} from './support';

// Autotranslation tests involve real UI interactions with plugin state and can run
// longer than the default 60 s in loaded CI.  Set per-test timeout to 2 minutes.
test.beforeEach(async () => {
    test.setTimeout(duration.two_min);
});

// Disable AutoTranslationSettings at end of file so leftover state cannot leak
// into other suites. Individual tests enable the feature via
// enableAutotranslationConfig() as needed.
test.afterAll(async () => {
    try {
        const {adminClient} = await getAdminClient({skipLog: true});
        await disableAutotranslationConfig(adminClient);
    } catch {
        // Best-effort cleanup.
    }
});
test(
    'translated message has indicator; click opens Show Translation modal',
    {
        tag: ['@autotranslation'],
    },
    async ({pw}) => {
        const {adminClient, user, userClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasAutotranslationLicense(license.SkuShortName),
            'Skipping test - server does not have Entry or Advanced license',
        );
        const translationUrl = process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010';
        await enableAutotranslationConfig(adminClient, {
            mockBaseUrl: translationUrl,
            targetLanguages: ['en', 'es'],
        });

        const channelName = `autotranslation-modal-${pw.random.id()}`;
        const created = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Show Translation Modal Test',
            type: 'O',
        });
        await enableChannelAutotranslation(adminClient, created.id);
        await adminClient.addToChannel(user.id, created.id);
        await setUserChannelAutotranslation(userClient, created.id, true);

        // Re-apply config immediately before posting so the server translates this message.
        // A concurrent initSetup() can reset AutoTranslationSettings.Enable to false.
        await enableAutotranslationConfig(adminClient, {
            mockBaseUrl: translationUrl,
            targetLanguages: ['en', 'es'],
        });
        // Confirm Enable=true before posting — translation happens at creation time,
        // so the config must be confirmed before posts are submitted.
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        // Verify the mock translation service is reachable before attempting to use it.
        try {
            await fetch(translationUrl, {signal: AbortSignal.timeout(3000)});
        } catch {
            test.skip(
                true,
                `Mock translation service not reachable at ${translationUrl}. ` +
                    'Start the service or set TRANSLATION_SERVICE_URL to run this test.',
            );
            return;
        }
        // Set Spanish source so the mock returns source='es', triggering es→en translation.
        await setMockSourceLanguage(translationUrl, 'es');

        const poster = await pw.random.user('poster');
        const createdPoster = await adminClient.createUser(poster, '', '');
        await adminClient.addToTeam(team.id, createdPoster.id);
        await adminClient.addToChannel(createdPoster.id, created.id);
        const {client: posterClient} = await pw.makeClient({
            username: poster.username,
            password: poster.password,
        });
        if (!posterClient) {
            throw new Error('Failed to create poster client');
        }

        // Create a second poster to show translation indicator (only visible with multiple users)
        const poster2 = await pw.random.user('poster2');
        const createdPoster2 = await adminClient.createUser(poster2, '', '');
        await adminClient.addToTeam(team.id, createdPoster2.id);
        await adminClient.addToChannel(createdPoster2.id, created.id);
        const {client: posterClient2} = await pw.makeClient({
            username: poster2.username,
            password: poster2.password,
        });
        if (!posterClient2) {
            throw new Error('Failed to create second poster client');
        }

        // Post Spanish message that's long enough for reliable detection
        await posterClient.createPost({
            channel_id: created.id,
            message: 'Este es un texto para la modal de traducción automática que debe ser lo suficientemente largo',
            user_id: createdPoster.id,
        });
        // Second user posts a message so the first user's translation indicator appears
        await posterClient2.createPost({
            channel_id: created.id,
            message: 'Segundo usuario con mensaje más largo para mejor detección de idioma',
            user_id: createdPoster2.id,
        });

        const {app, channelsPage} = await pw.testBrowser.login(user);
        await channelsPage.goto(team.name, channelName);
        await channelsPage.toBeVisible();

        // Re-apply config + reload to counter concurrent initSetup() resets.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        await page.reload();
        await expect(app.center.composer.locator).toBeVisible();
        // Post-reload re-apply: a concurrent initSetup() may have reset
        // Enable during the ~500ms reload window.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });

        // * Wait for post by searching for the Spanish original (mock appends "[translated to en]", no real translation)
        const modalPost = await centerPostContaining(
            app,
            'Este es un texto para la modal de traducción automática',
            15000,
        );

        // * Check for translation button - if it exists, click it and verify modal
        const translationButton = modalPost.translationButton.locator;
        const hasTranslationButton = (await translationButton.count()) > 0;

        // Translation button should be present - test expects translation to happen
        if (!hasTranslationButton) {
            throw new Error(
                'Translation button not found on post. Expected autotranslation to produce a translated message indicator.',
            );
        }

        // Translation happened - verify the modal opens
        await translationButton.click();
        const showTranslationDialog = app.showTranslationModal;
        await expect(showTranslationDialog.locator).toBeVisible();
        await expect(showTranslationDialog.original.locator).toContainText('ORIGINAL');
        await expect(showTranslationDialog.translated.locator).toContainText('AUTO-TRANSLATED');
    },
);

test(
    'message actions include Show translation',
    {
        tag: ['@autotranslation'],
    },
    async ({pw}) => {
        const {adminClient, user, userClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasAutotranslationLicense(license.SkuShortName),
            'Skipping test - server does not have Entry or Advanced license',
        );
        const translationUrl = process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010';
        await enableAutotranslationConfig(adminClient, {
            mockBaseUrl: translationUrl,
            targetLanguages: ['en', 'es'],
        });

        const channelName = `autotranslation-dotmenu-${pw.random.id()}`;
        const created = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Dot Menu Show Translation Test',
            type: 'O',
        });
        await enableChannelAutotranslation(adminClient, created.id);
        await adminClient.addToChannel(user.id, created.id);
        await setUserChannelAutotranslation(userClient, created.id, true);

        const poster = await pw.random.user('poster');
        const createdPoster = await adminClient.createUser(poster, '', '');
        await adminClient.addToTeam(team.id, createdPoster.id);
        await adminClient.addToChannel(createdPoster.id, created.id);
        const {client: posterClient} = await pw.makeClient({
            username: poster.username,
            password: poster.password,
        });
        if (!posterClient) {
            throw new Error('Failed to create poster client');
        }

        // Create a second poster to show translation indicator (only visible with multiple users)
        const poster2 = await pw.random.user('poster2');
        const createdPoster2 = await adminClient.createUser(poster2, '', '');
        await adminClient.addToTeam(team.id, createdPoster2.id);
        await adminClient.addToChannel(createdPoster2.id, created.id);
        const {client: posterClient2} = await pw.makeClient({
            username: poster2.username,
            password: poster2.password,
        });
        if (!posterClient2) {
            throw new Error('Failed to create second poster client');
        }

        // Re-apply config immediately before posting so the server translates this message.
        // A concurrent initSetup() can reset AutoTranslationSettings.Enable to false.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        // Confirm Enable=true before posting — translation happens at creation time,
        // so the config must be confirmed before posts are submitted.
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        // Verify the mock translation service is reachable before attempting to use it.
        // setMockSourceLanguage() swallows connection errors internally, so we probe the
        // service directly. If it is not running, skip rather than fail — the service is
        // an external dependency started by CI but not typically present in local runs.
        try {
            await fetch(translationUrl, {signal: AbortSignal.timeout(3000)});
        } catch {
            test.skip(
                true,
                `Mock translation service not reachable at ${translationUrl}. ` +
                    'Start the service or set TRANSLATION_SERVICE_URL to run this test.',
            );
            return;
        }
        // Set Spanish source so the mock returns source='es', triggering es→en translation.
        await setMockSourceLanguage(translationUrl, 'es');
        // Post Spanish message that's long enough for reliable detection.
        await posterClient.createPost({
            channel_id: created.id,
            message: 'Este mensaje es para probar el menú de acciones con la opción de mostrar traducción automática',
            user_id: createdPoster.id,
        });
        // Second post ensures the first post's translation indicator is rendered
        // (the UI only renders it for posts that are not the last in the channel).
        await posterClient2.createPost({
            channel_id: created.id,
            message: 'Segundo usuario con mensaje más largo para mejor detección de idioma',
            user_id: createdPoster2.id,
        });

        const {app, channelsPage, page} = await pw.testBrowser.login(user);
        await channelsPage.goto(team.name, channelName);
        await channelsPage.toBeVisible();

        // Pre-reload re-apply: ensure Enable=true before the page loads so the client
        // fetches posts with translations active.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        await page.reload();
        await expect(app.center.composer.locator).toBeVisible();
        // Post-reload re-apply: a concurrent initSetup() on another shard may have reset
        // Enable during the ~500ms reload window. Re-confirm before badge check.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });

        // * Wait for the channel-level autotranslation badge — confirms the feature is active.
        await expect(app.channelHeader.autotranslationBadgeText.locator).toBeVisible({timeout: 15000});

        // * Wait for the translated target post to appear.
        // The mock appends "[translated to en]" to the original Spanish text, confirming
        // translation.state==='ready' so that "Show translation" will be in the dot menu.
        const post = await centerPostContaining(app, 'Este mensaje es para probar el menú de acciones', 15000);
        await expect(post.locator).toContainText(/\[translated to en\]/i, {timeout: 15000});

        // * Open dot menu using the established hover → wait → click pattern
        await post.locator.hover();
        const dotMenu = await post.menu.clickDotMenuButton();

        // Move mouse away so it doesn't hover over Remind and trigger its submenu.
        // The submenu's MUI portal sets aria-hidden on the main menu, breaking getByRole.
        await page.mouse.move(0, 0);

        // * Verify the "Show translation" menu item is present
        await expect(dotMenu.showTranslationMenuItem.locator).toBeVisible({timeout: 10000});
    },
);

test(
    'any user can disable and enable again autotranslation for themselves in a channel',
    {
        tag: ['@autotranslation'],
    },
    async ({pw}) => {
        const {adminClient, user, userClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasAutotranslationLicense(license.SkuShortName),
            'Skipping test - server does not have Entry or Advanced license',
        );
        const translationUrl = process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010';
        await enableAutotranslationConfig(adminClient, {
            mockBaseUrl: translationUrl,
            targetLanguages: ['en', 'es'],
        });

        const channelName = `autotranslation-toggle-${pw.random.id()}`;
        const created = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Autotranslation Toggle Test',
            type: 'O',
        });
        await enableChannelAutotranslation(adminClient, created.id);
        await adminClient.addToChannel(user.id, created.id);
        await setUserChannelAutotranslation(userClient, created.id, true);

        const {app, channelsPage} = await pw.testBrowser.login(user);
        await channelsPage.goto(team.name, channelName);
        await channelsPage.toBeVisible();

        // Defeat concurrent initSetup() config resets: re-apply on every poll iteration until badge appears.
        await expect
            .poll(
                async () => {
                    await enableAutotranslationConfig(adminClient, {
                        mockBaseUrl: translationUrl,
                        targetLanguages: ['en', 'es'],
                    });
                    return app.channelHeader.autotranslationBadgeText.locator.isVisible();
                },
                {timeout: duration.one_min, intervals: [2000]},
            )
            .toBeTruthy();

        await clickAutotranslationMenuItem(app, 'Disable autotranslation');
        await app.disableAutotranslationModal.clickConfirmButton();

        await expect(app.channelHeader.autotranslationBadgeText.locator).not.toBeVisible();

        // Re-apply config before opening menu to ensure "Enable autotranslation" option is present.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        await clickAutotranslationMenuItem(app, 'Enable autotranslation');

        // Poll with config re-apply until badge reappears.
        await expect
            .poll(
                async () => {
                    await enableAutotranslationConfig(adminClient, {
                        mockBaseUrl: translationUrl,
                        targetLanguages: ['en', 'es'],
                    });
                    return app.channelHeader.autotranslationBadgeText.locator.isVisible();
                },
                {timeout: duration.one_min, intervals: [2000]},
            )
            .toBeTruthy();
    },
);

test(
    'autotranslation badge is only visible on translated channels',
    {
        tag: ['@autotranslation'],
    },
    async ({pw}) => {
        const {adminClient, user, userClient, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasAutotranslationLicense(license.SkuShortName),
            'Skipping test - server does not have Entry or Advanced license',
        );
        const translationUrl = process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010';
        await enableAutotranslationConfig(adminClient, {
            mockBaseUrl: translationUrl,
            targetLanguages: ['en', 'es'],
        });

        const translatedChannelName = `autotranslation-badge-${pw.random.id()}`;
        const translatedChannel = await adminClient.createChannel({
            team_id: team.id,
            name: translatedChannelName,
            display_name: 'Translated Channel',
            type: 'O',
        });
        await enableChannelAutotranslation(adminClient, translatedChannel.id);
        await adminClient.addToChannel(user.id, translatedChannel.id);
        await setUserChannelAutotranslation(userClient, translatedChannel.id, true);

        const noTranslationChannelName = `no-translation-${pw.random.id()}`;
        const noTranslationChannel = await adminClient.createChannel({
            team_id: team.id,
            name: noTranslationChannelName,
            display_name: 'No Translation Channel',
            type: 'O',
        });
        await adminClient.addToChannel(user.id, noTranslationChannel.id);

        const {app, channelsPage} = await pw.testBrowser.login(user);

        await app.channelsPage.goto({team, channel: translatedChannelName});

        // Re-apply config + reload to counter concurrent initSetup() resets.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        await page.reload();
        // Post-reload re-apply: firing the CONFIG_CHANGED WebSocket event during page load
        // rather than after prevents it from disrupting the badge render.
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['en', 'es']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        await expect(app.center.composer.locator).toBeVisible();

        await expect(app.channelHeader.autotranslationBadgeText.locator).toBeVisible({timeout: 15000});

        await channelsPage.goto(team.name, noTranslationChannelName);
        await channelsPage.toBeVisible();
        await expect(app.channelHeader.autotranslationBadgeText.locator).not.toBeVisible();
    },
);

test(
    'unsupported language does not show channel badge and shows message in channel header menu',
    {
        tag: ['@autotranslation'],
    },
    async ({pw}) => {
        const {adminClient, user, team} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();
        test.skip(
            !hasAutotranslationLicense(license.SkuShortName),
            'Skipping test - server does not have Entry or Advanced license',
        );
        const translationUrl = process.env.TRANSLATION_SERVICE_URL || 'http://localhost:3010';
        // Target languages intentionally exclude 'en' so the test user's default locale is
        // unsupported. Changing the user's own locale instead (e.g. to 'fr') would also switch
        // the webapp UI language, breaking the literal English text assertions below as soon as
        // that locale gets a translation for these strings.
        await enableAutotranslationConfig(adminClient, {
            mockBaseUrl: translationUrl,
            targetLanguages: ['es', 'de'],
        });

        const channelName = `autotranslation-unsupported-${pw.random.id()}`;
        const created = await adminClient.createChannel({
            team_id: team.id,
            name: channelName,
            display_name: 'Unsupported Language Test',
            type: 'O',
        });
        await enableChannelAutotranslation(adminClient, created.id);
        await adminClient.addToChannel(user.id, created.id);

        const {app, channelsPage} = await pw.testBrowser.login(user);
        await channelsPage.goto(team.name, channelName);
        await channelsPage.toBeVisible();

        // Re-apply config + reload to ensure the browser reads the latest AutoTranslationSettings.
        // The badge should still be absent ('es'/'de' targets don't include the test user's
        // default 'en' locale), but the server config must be active so the channel header menu
        // shows the "unsupported" notice. Re-applying again right as the page reloads ensures a
        // CONFIG_CHANGED WebSocket event firing during load carries our config rather than a
        // stale reset from another parallel worker's initSetup().
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['es', 'de']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        await page.reload();
        await enableAutotranslationConfig(adminClient, {mockBaseUrl: translationUrl, targetLanguages: ['es', 'de']});
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (cfg as any).AutoTranslationSettings?.Enable === true;
        });
        await expect(app.center.composer.locator).toBeVisible();

        await expect(app.channelHeader.autotranslationBadgeText.locator).not.toBeVisible({timeout: 30000});

        const channelMenu = await app.channelHeader.clickOpenMenuButton();
        const autotranslationItem = channelMenu.autotranslationMenuItem.locator;
        await expect(autotranslationItem).toContainText('Auto-translation', {timeout: 30000});
        await expect(autotranslationItem).toContainText('Your language is not supported', {timeout: 30000});
        await expect(autotranslationItem).toBeDisabled();
    },
);

/** Opens the channel header menu and clicks its auto-translation item, once it reads `label`. */
async function clickAutotranslationMenuItem(app: App, label: string) {
    const menu = await app.channelHeader.clickOpenMenuButton();
    await expect(menu.autotranslationMenuItem.locator).toContainText(label);
    await menu.autotranslationMenuItem.click();
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {demoPluginId, duration, expect, openChannel, test} from '@mattermost/playwright-lib';

import {postContaining} from './support';

test('should crash plugin via /crash command and verify recovery', async ({pw}) => {
    // # Setup
    const {adminClient, user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: townSquare});
    const composer = app.center.postCreate;

    // # Pick /crash from the slash command autocomplete and send it
    await composer.fillMessageTextbox('/cr');
    await composer.message.suggestions.item('/crash').select();
    await composer.clickSendButton();

    // * The plugin says it's crashing
    await postContaining(app, 'Crashing plugin', 30_000);

    // * The plugin recovers (polls every 1s, for up to 10s)
    await expect
        .poll(async () => pw.isPluginActive(adminClient, demoPluginId), {
            timeout: duration.ten_sec,
            intervals: [duration.one_sec],
        })
        .toBe(true);

    // The crash kills the plugin process mid-request. The server's auto-restart only
    // guarantees isPluginActive flips back to true — it doesn't guarantee every hook
    // (e.g. interactive dialog submit, post action callbacks) came back in a clean
    // state. ensureDemoPlugin() is a no-op once isPluginActive is true, so it can no
    // longer be relied on to paper over a partial recovery like the old unconditional
    // patchConfig-on-every-spec setup incidentally did. Force one real disable/enable
    // cycle through the same OnActivate path installAndEnablePlugin trusts, so later
    // specs in this worker don't inherit a partially-recovered plugin.
    await adminClient.disablePlugin(demoPluginId);
    await adminClient.enablePlugin(demoPluginId);
    await expect.poll(() => pw.isPluginActive(adminClient, demoPluginId), {timeout: duration.half_min}).toBe(true);

    // * Its commands are offered again
    await composer.fillMessageTextbox('/demo');
    await expect(composer.message.suggestions.item('/demo_plugin').locator).toBeVisible();
});

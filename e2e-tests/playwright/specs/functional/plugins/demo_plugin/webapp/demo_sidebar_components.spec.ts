// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannel, test} from '@mattermost/playwright-lib';

import {sendDemoSlashCommand} from '../helpers';
import {sendCommand} from '../server/slash_commands/support';

import {DEMO} from './support';

test('should show Demo Plugin enabled/disabled status in left sidebar header', async ({pw}) => {
    // # Set up the demo plugin and open Town Square (its slash command works from any channel)
    const {user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: 'town-square'});
    const status = app.plugins.comMattermostDemoPlugin.lhsHeader.statusText;

    /** Sends /demo_plugin <enabled> and waits for the sidebar header to follow. */
    async function setHooks(enabled: boolean) {
        await sendDemoSlashCommand(app.page, () => sendCommand(app, `/demo_plugin ${enabled}`));
        await expect(status.locator).toHaveText(enabled ? 'Enabled' : 'Disabled');
    }

    // # Explicitly enable the hooks first. A concurrently running instance of this spec
    // (e.g. via --repeat-each) or another spec toggling the same global /demo_plugin hooks
    // state could have left them disabled, so the initial "Enabled" state can't be assumed.
    await setHooks(true);

    // # Disable the hooks: the sidebar header follows
    await setHooks(false);

    // # Re-enable them
    await setHooks(true);
});

test('should show demo plugin plug icon at the bottom of the team sidebar', async ({pw}) => {
    // # Set up the demo plugin, put the user on a second team (the team sidebar shows from two teams) and open Town Square
    const {adminClient, user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const otherTeam = await adminClient.createTeam(await pw.random.team());
    await adminClient.addToTeam(otherTeam.id, user.id);
    const app = await openChannel(pw, user, {team, channel: 'town-square'});

    // * The plugin's icon shows at the bottom of the team sidebar
    await expect(app.plugins.comMattermostDemoPlugin.teamSidebarIcon.locator).toBeVisible();
});

test('should show Demo Plugin Item in Browse or create channels menu and trigger alert with team ID', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: 'town-square'});

    // # Open the "Browse or create channels" menu
    const menu = await app.lhs.header.clickOpenBrowseOrAddMenuButton();

    // * The plugin's item shows
    await expect(menu.plugin(DEMO).locator).toHaveText('Demo Plugin Item');

    // # Click it: the plugin shows an alert naming the team
    const dialog = app.page.waitForEvent('dialog');
    await menu.plugin(DEMO).click();
    const alert = await dialog;

    // * The alert names the current team
    expect(alert.type()).toBe('alert');
    expect(alert.message()).toBe(`Demo Plugin: Browse menu item clicked! Team ID: ${team.id}`);
    await alert.accept();
});

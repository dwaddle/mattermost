// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannel, test} from '@mattermost/playwright-lib';

import {DEMO} from './support';

test('should show demo plugin settings sections and save changes with alert confirmation', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: townSquare});

    // # Open Settings and the plugin's tab
    const modal = await app.globalHeader.clickSettingsButton();
    await modal.tabs.plugin(DEMO).select();

    // * The plugin's panel shows its header, its action and its three sections
    const {settings} = app;
    await expect(settings.pluginPanel(DEMO).locator).toContainText('Demo Plugin Settings');
    await expect(settings.pluginAction.locator).toContainText('Example action');
    // the action's button is compass SectionNotice's built-in primary button, which takes no testid
    await expect(settings.pluginAction.locator.getByRole('button')).toHaveText('Here is the button text');
    const first = settings.section('Test section number 1');
    const second = settings.section('Test section number 2');
    const disabled = settings.section('Test section disabled');
    await expect(first.title.locator).toHaveText('Test section number 1');
    await expect(second.title.locator).toHaveText('Test section number 2');
    await expect(disabled.title.locator).toHaveText('Test section disabled');

    // * The two active sections can be edited; the disabled one can't
    await expect(first.editButton.locator).toBeVisible();
    await expect(second.editButton.locator).toBeVisible();
    await expect(disabled.editButton.locator).toHaveCount(0);

    // The plugin confirms each save with an alert
    const alerts: string[] = [];
    app.page.on('dialog', async (dialog) => {
        alerts.push(dialog.message());
        await dialog.accept();
    });

    // # Section 1: choose Option 2 for setting 1 and save
    await first.clickEditButton();
    await first.setting('setting1').option('2').check();
    await first.clickSaveButton();

    // * The plugin received setting 1 = 2
    await expect.poll(() => alerts[0]).toBe('saving {setting1}: 2');

    // # Section 2: choose Option 1 for setting 3 and save
    await second.clickEditButton();
    await second.setting('setting3').option('1').check();
    await second.clickSaveButton();

    // * The plugin received setting 3 = 1
    await expect.poll(() => alerts[1]).toBe('saving {setting3}: 1');
});

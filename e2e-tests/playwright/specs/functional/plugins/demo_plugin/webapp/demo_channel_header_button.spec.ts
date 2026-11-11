// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannel, test} from '@mattermost/playwright-lib';

import {DEMO} from './support';

test('should open right-hand sidebar when demo plugin App Bar button is clicked', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: 'town-square'});
    const demo = app.plugins.comMattermostDemoPlugin;

    // # Click the plugin's App Bar button
    await expect(app.appBar.plugin(DEMO).locator).toBeVisible();
    await app.appBar.plugin(DEMO).click();

    // * The plugin's panel opens with its content
    const panel = app.rhs.plugin(DEMO);
    await expect(panel.locator).toBeVisible();
    await expect(demo.rhs.triggeredText.locator).toHaveText(
        'You have triggered the right-hand sidebar component of the demo plugin.',
    );
    await expect(demo.rhs.translatedText.locator).toHaveText('This is the English String');

    // * Its custom route links show their paths
    await expect(demo.rhs.rootRouteLink.locator).toHaveText('/plug/com.mattermost.demo-plugin/roottest');
    await expect(demo.rhs.teamRouteLink.locator).toHaveText(`/${team.name}/com.mattermost.demo-plugin/teamtest`);

    // * The pop-out section shows both buttons, enabled (not clicked: a pop-out window crashes in the test browser)
    await expect(demo.rhs.popoutTitleText.locator).toHaveText('Pop Out RHS Demo');
    await expect(demo.rhs.popoutButton.locator).toBeEnabled();
    await expect(demo.rhs.popoutEffectButton.locator).toBeEnabled();

    // # Follow the /roottest link
    await demo.rhs.clickRootRouteLink();

    // * The custom route renders
    await expect(app.page).toHaveURL(/\/plug\/com\.mattermost\.demo-plugin\/roottest$/);
    await expect(demo.rootRouteText.locator).toHaveText('Demo plugin route.');

    // # Go back and close the panel
    await app.page.goBack();
    await panel.header.clickCloseButton();

    // * The panel is gone
    await expect(panel.locator).not.toBeVisible();
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, Msg, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify the clock display setting switches to the 24-hour clock and is saved as the
 * user's preference.
 */
test('switches the clock display to 24-hour and saves it', {tag: '@settings'}, async ({pw}) => {
    const {team, user, userClient} = await pw.initSetup();

    // # Log in and open Settings > Display
    const {app} = await pw.testBrowser.login(user);
    await app.teamPage.goto({team});
    await expect(app.center.composer.locator).toBeVisible();
    await app.globalHeader.clickSettingsButton();
    await app.userSettingsModal.tabs.tab('display').select();

    // # Expand the clock section and choose the 24-hour clock
    const clock = app.settings.section('clock');
    await clock.clickEditButton();
    await expect(clock.option('false').locator).toBeChecked();
    await clock.option('true').check();
    await clock.clickSaveButton();

    // * The collapsed section shows the 24-hour clock
    await expect(clock).toContainMessage(Msg.user.settings.display.militaryClock);

    // * It's saved as the user's preference
    const prefs = (await userClient.getMyPreferences()) as unknown as Array<{
        category: string;
        name: string;
        value: string;
    }>;
    expect(prefs.find((p) => p.category === 'display_settings' && p.name === 'use_military_time')?.value).toBe('true');
});

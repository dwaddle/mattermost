// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {expect, type App, type generated, type PlaywrightExtended} from '@mattermost/playwright-lib';

/**
 * Channel Settings' access rules tab (shown as Membership Policy) on the generated page objects: the rules table,
 * the auto-add checkbox, the save panel, and the dialogs a save can open (membership changes, self-exclusion).
 */

/** Logs the user in and opens the channel, waiting for the app to be up. */
export async function openChannel(pw: PlaywrightExtended, user: UserProfile, team: Team, channel: {name: string}) {
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    return app;
}

/** Opens Channel Settings from the channel header menu. */
export async function openChannelSettings(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await expect(settings.tabs.infoTab.locator).toBeVisible();
    return settings;
}

/** Opens Channel Settings on its access rules tab. */
export async function openAccessRules(app: App) {
    const settings = await openChannelSettings(app);
    await settings.tabs.accessRulesTab.select();
    await expect(settings.accessRules.locator).toBeVisible();
    return settings;
}

/** Closes Channel Settings (with nothing unsaved, one click). */
export async function closeSettings(settings: generated.ChannelSettingsModal) {
    await settings.clickCloseButton();
    await expect(settings.tabs.infoTab.locator).not.toBeVisible();
}

/** Saves the access rules tab and returns the membership changes dialog, which opens when members would change. */
export async function saveRules(app: App, settings: generated.ChannelSettingsModal) {
    const save = settings.savePanel.saveButton.locator;
    await expect(save).toBeEnabled();
    await save.click();
    return app.channelAccessRulesConfirmModal;
}

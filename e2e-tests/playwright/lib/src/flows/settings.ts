// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {App, ChannelSettingsModal, TeamSettingsModal, Tabs} from '@/ui/generated';
import type {ChannelSettingsModalTab, TeamSettingsModalTab} from '@/ui/generated/sets';

/** Selects `tab` and returns once it is the selected tab. */
async function selectTab(tabs: Tabs, tab: string): Promise<void> {
    const target = tabs.tab(tab);
    await target.locator.waitFor();
    await target.select();
    await target.locator.and(target.locator.page().locator('[aria-selected="true"]')).waitFor();
}

/**
 * Opens Channel Settings from the channel header menu, on `tab` (the modal opens on Info):
 * `const settings = await openChannelSettings(app, 'configuration')`. Returns once that tab is selected.
 */
export async function openChannelSettings(
    app: App,
    tab: ChannelSettingsModalTab = 'info',
): Promise<ChannelSettingsModal> {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await selectTab(settings.tabs, tab);
    return settings;
}

/** Closes Channel Settings with its close button and returns once the modal is gone. */
export async function closeChannelSettings(settings: ChannelSettingsModal): Promise<void> {
    await settings.clickCloseButton();
    await settings.locator.waitFor({state: 'hidden'});
}

/**
 * Opens Team Settings from the team menu, on `tab` (the modal opens on Info):
 * `const settings = await openTeamSettings(app, 'access')`. Returns once that tab is selected.
 */
export async function openTeamSettings(app: App, tab: TeamSettingsModalTab = 'info'): Promise<TeamSettingsModal> {
    const settings = await (await app.lhs.header.clickOpenTeamMenuButton()).clickTeamSettingsMenuItem();
    await selectTab(settings.tabs, tab);
    return settings;
}

/** Closes Team Settings with its close button and returns once the modal is gone. */
export async function closeTeamSettings(settings: TeamSettingsModal): Promise<void> {
    await settings.clickCloseButton();
    await settings.locator.waitFor({state: 'hidden'});
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {expect, generated, type App} from '@mattermost/playwright-lib';

export type CenterPost = ReturnType<App['center']['postList']['post']>;

/** The most recent center post whose text contains `text`, once it shows (within `timeout`). */
export async function centerPostContaining(app: App, text: string | RegExp, timeout?: number): Promise<CenterPost> {
    const item = app.center.postList.postItems.filter({hasText: text}).last();
    await expect(item).toBeVisible({timeout});
    const testId = (await item.getAttribute('data-testid'))!;
    return app.center.postList.post({id: testId.slice(testId.lastIndexOf(':') + 1)});
}

/** A center post found some other way (a filtered list item): the generated post rooted in that element. */
export function postIn(app: App, item: Locator): CenterPost {
    return new generated.PostItem(app.page, 'center.post_list.post', item);
}

/** Opens the channel header menu and clicks its auto-translation item, once it reads `label`. */
export async function clickAutotranslationMenuItem(app: App, label: string) {
    const menu = await app.channelHeader.clickOpenMenuButton();
    await expect(menu.autotranslationMenuItem.locator).toContainText(label);
    await menu.autotranslationMenuItem.click();
}

/** Turns auto-translation off for the current user in this channel (the menu item, then the dialog's confirm). */
export async function disableAutotranslationForMe(app: App) {
    await clickAutotranslationMenuItem(app, 'Disable autotranslation');
    await app.disableAutotranslationModal.clickConfirmButton();
}

/** Opens Channel Settings on its Configuration tab. */
export async function openConfiguration(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.configurationTab.select();
    await expect(settings.tabs.configurationTab.locator).toHaveAttribute('aria-selected', 'true');
    return settings;
}

/** Saves the open Channel Settings tab, and closes Channel Settings. */
export async function saveAndClose(settings: generated.ChannelSettingsModal) {
    await settings.savePanel.clickSaveButton();
    await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
    await settings.clickCloseButton();
}

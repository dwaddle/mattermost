// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import {expect, type App} from '@mattermost/playwright-lib';

// the demo plugin's own UI (`app.plugins.comMattermostDemoPlugin`), generated from its repo
import '../../../../../plugins/com_mattermost_demo_plugin';

/** The demo plugin's key in the host's plugin slots (`app.appBar.plugin(DEMO)`). */
export const DEMO = 'com_mattermost_demo_plugin';

const assetPath = path.resolve(__dirname, '../../../../../asset');

/**
 * The Root Modal is up with its three base lines; with `elementClicked`, also the "Element clicked in the menu: X"
 * line, and without it, no such line.
 */
export async function expectRootModal(app: App, elementClicked?: string) {
    const modal = app.plugins.comMattermostDemoPlugin.rootModal;
    await expect(modal.triggeredText.locator).toHaveText('You have triggered the root component of the demo plugin.');
    await expect(modal.clickToCloseText.locator).toHaveText('Click anywhere to close.');
    await expect(modal.translatedText.locator).toHaveText('This is the English String');
    if (elementClicked) {
        await expect(modal.elementClickedText.locator).toHaveText(`Element clicked in the menu: ${elementClicked}`);
    } else {
        await expect(modal.elementClickedText.locator).toHaveCount(0);
    }
}

/** Closes the Root Modal (a click anywhere on it) and waits for it to go. */
export async function closeRootModal(app: App) {
    const modal = app.plugins.comMattermostDemoPlugin.rootModal;
    await modal.clickToCloseText.locator.click();
    await expect(modal.triggeredText.locator).toHaveCount(0);
}

/** Uploads an asset through the attachment menu's "Your computer" entry (the plugin turns the button into a menu). */
export async function uploadFromYourComputer(app: App, filename: string) {
    const composer = app.center.postCreate;
    const upload = app.page.waitForResponse(
        (r) => r.url().includes('/api/v4/files') && r.request().method() === 'POST' && r.ok(),
        {timeout: 60_000},
    );
    const chooser = app.page.waitForEvent('filechooser');
    await composer.clickAttachButton();
    await composer.attachMenu.clickYourComputerLink();
    await (await chooser).setFiles(path.join(assetPath, filename));
    await upload;
}

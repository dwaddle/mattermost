// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {
    expect,
    formatMessage,
    generated,
    Msg,
    type AdminInterval,
    type AdminLevel,
    type AdminPreset,
    type App,
} from '@mattermost/playwright-lib';

/**
 * The System Console's Server Logs page on the generated `app.admin.serverLogs`: its filter row (each filter is a
 * menu opened by its button, whose value shows in a read-only textbox), the entries and the plain text viewer.
 */

/** Opens the page, on `query` ("?search=timeout&range=60") to open it with filters, once the System Console shows. */
export async function gotoServerLogs(app: App, query = '') {
    await app.page.goto(generated.AdminConsolePage.path({section: 'reporting/server_logs'}) + query);
    await app.admin.sidebar.locator.waitFor();
}

/** The page once its structured viewer shows (a plain text viewer has no entry list). */
export async function expectStructuredViewer(app: App) {
    await expect(app.admin.serverLogs.entriesList.locator).toBeVisible();
}

/** Every entry the structured viewer lists. */
export function logEntries(app: App) {
    return app.admin.serverLogs.entry.locator;
}

/**
 * The entry whose text contains `text` (the entries of a test are unique): its row, and its parts (level, node,
 * message and the toggle that expands it) found inside the row.
 */
export function logEntryWith(app: App, text: string) {
    const row = logEntries(app).filter({hasText: text});
    return {row, parts: new generated.AdminServerLogsEntry(app.page, app.admin.serverLogs.entry.scope, row)};
}

/** Turns live tail on at the given poll interval: picking an interval is what enables polling. */
export async function selectLiveTailInterval(app: App, interval: AdminInterval) {
    const menu = await app.admin.serverLogs.clickLiveTailButton();
    await menu.interval(interval).click();
}

/** Shows a single node. The node menu is only shown on a cluster. */
export async function selectNode(app: App, node: string) {
    const menu = await app.admin.serverLogs.clickNodeButton();
    await menu.node(node).click();
}

/** Checks or unchecks a level in the levels menu, then closes the menu. */
export async function toggleLevel(app: App, level: AdminLevel) {
    const menu = await app.admin.serverLogs.clickLevelsButton();
    await menu.level(level).click();
    await app.page.keyboard.press('Escape');
}

/** Applies a time range: one of the presets (minutes), or all time. */
export async function selectDuration(app: App, range: AdminPreset | 'all') {
    const menu = await app.admin.serverLogs.clickDurationButton();
    await (range === 'all' ? menu.allMenuItemRadio : menu.preset(range)).click();
}

/** Opens the custom range dialog from the Duration menu and applies the range it starts with, the last hour. */
export async function applyDefaultCustomRange(app: App) {
    const menu = await app.admin.serverLogs.clickDurationButton();
    const dialog = await menu.clickCustomMenuItemRadio();
    await expect(dialog.locator).toBeVisible();
    await dialog.clickConfirmButton();
    await expect(dialog.locator).not.toBeVisible();
}

/** The viewer for the format that shows: the structured one has a search box, the plain text one line numbers. */
export async function expectLogFormat(app: App, format: 'structured' | 'plain') {
    const logs = app.admin.serverLogs;
    if (format === 'structured') {
        await expect(logs.logFormatTextbox.locator).toHaveValue(formatMessage(Msg.admin.logs.logFormatStructured));
        await expect(logs.searchTextbox.locator).toBeVisible();
    } else {
        await expect(logs.logFormatTextbox.locator).toHaveValue(formatMessage(Msg.admin.logs.logFormatPlain));
        await expect(logs.lineNumbersToggleButton.locator).toBeVisible();
        await expect(logs.searchTextbox.locator).not.toBeVisible();
    }
}

/** Switches the log format from the Log format menu. */
export async function selectLogFormat(app: App, format: 'structured' | 'plain') {
    const menu = await app.admin.serverLogs.clickLogFormatButton();
    await (format === 'structured' ? menu.structuredMenuItemRadio : menu.plainMenuItemRadio).click();
}

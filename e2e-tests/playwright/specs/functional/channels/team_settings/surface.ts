// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {expect, type App, type generated, type PlaywrightExtended} from '@mattermost/playwright-lib';

/**
 * Team Settings on the generated page objects: the dialog's tabs, the membership tab (rules, auto-add, sync status,
 * its confirm and self-exclusion dialogs), the membership policies tab (list, editor, confirm and delete dialogs), and
 * the access tab (discoverability, mode-flip dialog).
 */

/** Logs the user in on the team's town square, waiting for the app to be up. */
export async function openTeam(pw: PlaywrightExtended, user: UserProfile, team: Team) {
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: 'town-square'});
    return app;
}

/** Opens Team Settings from the team menu. */
export async function openTeamSettings(app: App) {
    const settings = await (await app.lhs.header.clickOpenTeamMenuButton()).clickTeamSettingsMenuItem();
    await expect(settings.tabs.tab('info').locator).toBeVisible();
    return settings;
}

/** Opens Team Settings on its membership tab. */
export async function openTeamMembershipTab(app: App) {
    const settings = await openTeamSettings(app);
    await settings.tabs.tab('team_membership').select();
    await expect(settings.membership.locator).toBeVisible();
    return settings;
}

/** Opens Team Settings on its membership policies tab. */
export async function openAccessPoliciesTab(app: App) {
    const settings = await openTeamSettings(app);
    await settings.tabs.tab('access_policies').select();
    await expect(settings.accessPolicies.addPolicyButton.locator).toBeVisible();
    return settings;
}

/** Opens Team Settings on its access tab. */
export async function openAccessTab(app: App) {
    const settings = await openTeamSettings(app);
    await settings.tabs.tab('access').select();
    await expect(settings.access.discoverability.privateButton.locator).toBeVisible();
    return settings;
}

/**
 * Closes Team Settings. With unsaved changes (the save panel offering Save) the first click only warns; the second
 * closes. After a save the panel stays to say so, without Save, and one click closes.
 */
export async function closeTeamSettings(settings: generated.TeamSettingsModal) {
    const unsaved = await settings.savePanel.saveButton.locator.isVisible();
    await settings.clickCloseButton();
    if (unsaved) {
        await settings.clickCloseButton();
    }
    await expect(settings.tabs.tab('info').locator).not.toBeVisible();
}

/** Saves the open tab from its save panel. */
export async function save(settings: generated.TeamSettingsModal) {
    const button = settings.savePanel.saveButton.locator;
    await expect(button).toBeEnabled();
    await button.click();
}

/** A membership policy's row in the policies tab's list, by its name (rows are keyed by policy id). */
export function policyRow(settings: generated.TeamSettingsModal, name: string) {
    return settings.accessPolicies.policies.rowItems.filter({hasText: name});
}

/** Assigns a channel to the policy being edited, through the channel selector dialog. */
export async function addChannel(editor: generated.TeamSettingsModalAccessPoliciesEditor, channel: {id: string}) {
    const selector = await editor.clickAddChannelsButton();
    const option = selector.channels.results.channel(channel).locator;
    await expect(option).toBeVisible();
    await option.click();
    await selector.channels.clickSaveButton();

    // the channel is committed to the form only once the dialog has closed; a save before that races it
    await expect(selector.channels.saveButton.locator).not.toBeVisible();
    await expect(editor.channels.row(channel.id).locator).toBeVisible();
}

/** Saves the policy being edited and confirms it in the "Save and apply policy" dialog. */
export async function applyPolicy(settings: generated.TeamSettingsModal) {
    await save(settings);
    const confirm = settings.accessPolicies.editor.confirmModal;
    await expect(confirm.confirmButton.locator).toHaveText(/Apply policy/);
    await confirm.clickConfirmButton();
    await expect(confirm.confirmButton.locator).not.toBeVisible();
}

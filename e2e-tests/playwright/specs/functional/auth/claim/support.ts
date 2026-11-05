// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';
import type {Team} from '@mattermost/types/teams';

import {expect, type App, type generated, type PlaywrightExtended} from '@mattermost/playwright-lib';

import {logIn, openLogin} from '../support';

/**
 * Switching an account's sign-in method on the generated page objects: log in on the login page, open Profile >
 * Security, edit Sign-in Method and follow its switch link to the claim page.
 */

/** Logs in through the login page and opens the team's town square. */
export async function logInToTeam(pw: PlaywrightExtended, page: Page, loginId: string, password: string, team: Team) {
    const app = await openLogin(pw, page);
    await logIn(app, loginId, password);
    await expect(page).not.toHaveURL(/\/login/);
    await app.channelsPage.goto({team, channel: 'town-square'});
    return app;
}

/** Opens Profile > Security. */
export async function openSecurity(app: App) {
    await (await app.globalHeader.clickOpenAccountMenuButton()).clickProfileMenuItem();
    await app.userSettingsModal.tabs.tab('security').select();
    await expect(app.settings.section('signin').locator).toBeVisible();
}

/** Edits Sign-in Method in Profile > Security and follows its link to switch to `to`. */
export async function switchSignInTo(app: App, to: generated.SettingsSwitchTo) {
    await openSecurity(app);
    await app.settings.section('signin').clickEditButton();
    await app.settings.section('signin').switchTo(to).click();
}

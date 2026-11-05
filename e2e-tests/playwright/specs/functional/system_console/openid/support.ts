// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, type App} from '@mattermost/playwright-lib';

/** The masked value the server returns for a saved secret. */
export const FAKE_SETTING = '********************************';

type Provider = 'openid' | 'google' | 'gitlab' | 'office365';

/** Opens System Console > OpenID Connect and picks a provider. */
export async function chooseProvider(app: App, provider: Provider) {
    await app.page.goto(`${generated.AdminConsolePage.path()}/authentication/openid`);
    const select = app.admin.setting('openidType').valueCombobox.locator;
    await expect(select).toBeVisible();
    await select.selectOption(provider);
}

/** Saves the page, waiting for Save to settle. */
export async function save(app: App) {
    await expect(app.admin.saveButton.locator).toBeEnabled();
    await app.admin.saveButton.click();
    await expect(app.admin.saveButton.locator).toBeSaved();
}

/** Logs out from the System Console menu, landing on the login page. */
export async function logOut(app: App) {
    const menu = await app.admin.sidebar.header.clickMenuButton();
    await menu.clickLogOutMenuItem();
    await expect(app.login.loginIdTextbox.locator).toBeVisible();
}

/** Checks the login page offers the provider's button, linking to this server's OAuth path (and in its color). */
export async function expectOAuthLogin(app: App, provider: Provider, label: string, path: string, color?: string) {
    const button = app.login.external(provider).locator;
    await expect(button).toHaveText(label);

    // Buttons use absolute site URLs on this server (e.g. http://localhost:8055/oauth/google/login)
    const origin = new URL(app.page.url()).origin.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    await expect(button).toHaveAttribute('href', new RegExp(`^${origin}${path}(\\?extra=expired)?$`));
    if (color) {
        const rgb = hexToRgb(color);
        await expect(button).toHaveCSS('color', rgb);
        await expect(button).toHaveCSS('border-color', rgb);
    }
}

function hexToRgb(hex: string): string {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

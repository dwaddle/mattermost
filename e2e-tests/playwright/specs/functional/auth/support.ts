// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import {App, expect, generated, testConfig, type PlaywrightExtended} from '@mattermost/playwright-lib';

/**
 * The login and signup pages on the generated page objects, for a browser that isn't logged in. Errors from the
 * server show in each page's banner; a signup field's own error is its message.
 */

/** Opens the login page (past the native-app landing page). */
export async function openLogin(pw: PlaywrightExtended, page: Page) {
    await pw.hasSeenLandingPage();
    const app = new App(page);
    await app.loginPage.goto();
    await expect(app.login.loginIdTextbox.locator).toBeVisible();
    return app;
}

/** Fills the login form and submits it. */
export async function logIn(app: App, loginId: string, password: string) {
    await app.login.fillLoginIdTextbox(loginId);
    await app.login.fillPasswordTextbox(password);
    await app.login.card.clickLogInButton();
}

/**
 * Opens the login page, follows its SAML or OpenID button and signs in on Keycloak's hosted form (outside the
 * webapp: `pw.keycloakLoginPage`). With `ifFormShown`, a reused Keycloak session that skips the form is fine.
 */
export async function logInWithKeycloak(
    pw: PlaywrightExtended,
    page: Page,
    service: 'saml' | 'openid',
    user: {username: string; password: string},
    {ifFormShown = false} = {},
) {
    const app = await openLogin(pw, page);
    await app.login.external(service).click();
    if (ifFormShown) {
        await pw.keycloakLoginPage.loginIfFormShown(user.username, user.password);
    } else {
        await pw.keycloakLoginPage.login(user.username, user.password);
    }
    return app;
}

const onServer = (url: URL) => url.origin === new URL(testConfig.baseURL).origin;

/**
 * Back on the Mattermost server and past its login page. (A bare `not.toHaveURL(/\/login/)` also matches while the
 * browser is still on the identity provider, before it redirects back.)
 */
export async function expectSignedIn(page: Page) {
    await expect(page).toHaveURL((url) => onServer(url) && !url.pathname.startsWith('/login'));
}

/** On the Mattermost server's login page (not an identity provider's `/login-actions/…` page). */
export async function expectOnLoginPage(page: Page) {
    await expect(page).toHaveURL((url) => onServer(url) && url.pathname === '/login');
}

/** Opening `path` sends a signed-out browser to the login page. */
export async function expectLoginRedirectFrom(page: Page, path: string) {
    // the app may redirect before the navigation commits, which aborts it
    await page.goto(path, {waitUntil: 'commit'}).catch((error: unknown) => {
        if (!/interrupted|ERR_ABORTED/i.test(String(error))) {
            throw error;
        }
    });
    await expectOnLoginPage(page);
}

/** Opens the signup page, with `search` (an invite: `?id=<invite id>`) when given. */
export async function openSignup(pw: PlaywrightExtended, page: Page, search = '') {
    await pw.hasSeenLandingPage();
    const app = new App(page);
    await page.goto(generated.SignupPage.path() + search);
    return app;
}

/** Fills the signup form, accepts the terms and submits it. */
export async function signUp(app: App, user: {email: string; username: string; password: string}) {
    const card = app.signup.card;
    await card.fillEmailTextbox(user.email);
    await card.fillUsernameTextbox(user.username);
    await card.fillPasswordTextbox(user.password);
    await card.setTermsCheckbox(true);
    await card.clickCreateAccountButton();
}

/** Signup lands on the team-join page. */
export async function expectOnSelectTeam(page: Page) {
    await expect(page).toHaveURL(/\/select_team/);
}

/** The text a server rejection for a domain not on the allow list starts with. */
export const DOMAIN_NOT_ALLOWED = /The email you provided does not belong to an accepted domain/;

/** Opens a System Console page by its path under `/admin_console` (e.g. `/authentication/password`). */
export async function openAdminConsole(app: App, path: string) {
    await app.page.goto(generated.AdminConsolePage.path() + path);
    await expect(app.admin.saveButton.locator).toBeVisible();
}

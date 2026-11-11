// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import {testConfig} from '@/test_config';
import {App, LoginPage} from '@/ui/generated';
import type KeycloakLoginPage from '@/ui/pages/keycloak_login';

/** What the auth flows need from `pw`: the landing-page flag and Keycloak's hosted form. */
type AuthFixture = {
    hasSeenLandingPage: (url?: string) => Promise<unknown>;
    keycloakLoginPage: KeycloakLoginPage;
};

const onServer = (url: URL) => url.origin === new URL(testConfig.baseURL).origin;

/** The login page's path on the server, under its subpath when it has one. */
const loginPath = () => testConfig.withSubpath(LoginPage.path());

/**
 * Back on the Mattermost server and past its login page, for `expect(page).toHaveURL(signedInUrl)`. (A bare
 * `not.toHaveURL(/\/login/)` also matches while the browser is still on the identity provider, before it redirects
 * back.)
 */
export const signedInUrl = (url: URL) => onServer(url) && !url.pathname.startsWith(loginPath());

/** On the Mattermost server's login page (not an identity provider's `/login-actions/…` page): `toHaveURL(loginPageUrl)`. */
export const loginPageUrl = (url: URL) => onServer(url) && url.pathname === loginPath();

/** Opens the login page (past the native-app landing page), once its login field shows. */
export async function openLogin(pw: Pick<AuthFixture, 'hasSeenLandingPage'>, page: Page) {
    await pw.hasSeenLandingPage();
    const app = new App(page);
    await app.loginPage.goto();
    await app.login.loginIdTextbox.locator.waitFor();
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
    pw: AuthFixture,
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

/** Opens `path` in a signed-out browser, which the app redirects (to the login page, for a page that needs a session). */
export async function openSignedOut(page: Page, path: string) {
    // the app may redirect before the navigation commits, which aborts it
    await page.goto(path, {waitUntil: 'commit'}).catch((error: unknown) => {
        if (!/interrupted|ERR_ABORTED/i.test(String(error))) {
            throw error;
        }
    });
}

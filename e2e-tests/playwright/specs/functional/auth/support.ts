// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import {
    App,
    expect,
    generated,
    loginPageUrl,
    openSignedOut,
    signedInUrl,
    type PlaywrightExtended,
} from '@mattermost/playwright-lib';

/**
 * The login and signup pages on the generated page objects, for a browser that isn't logged in. Errors from the
 * server show in each page's banner; a signup field's own error is its message.
 */

// the login flows are shared with the LDAP, SAML and OpenID specs, so they live in the lib
export {logIn, logInWithKeycloak, openLogin} from '@mattermost/playwright-lib';

/** Back on the Mattermost server and past its login page (not still on the identity provider). */
export async function expectSignedIn(page: Page) {
    await expect(page).toHaveURL(signedInUrl);
}

/** On the Mattermost server's login page (not an identity provider's `/login-actions/…` page). */
export async function expectOnLoginPage(page: Page) {
    await expect(page).toHaveURL(loginPageUrl);
}

/** Opening `path` sends a signed-out browser to the login page. */
export async function expectLoginRedirectFrom(page: Page, path: string) {
    await openSignedOut(page, path);
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

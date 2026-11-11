// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {expectOnLoginPage, expectSignedIn, logIn} from '../support';

import {logInToTeam, switchSignInTo} from './support';

/**
 * @objective Verify an email account can switch to OpenID and back to email in one session.
 *
 * @precondition
 * A licensed server with Keycloak OpenID configured and authentication transfer enabled.
 */
test('round-trips an email account through OpenID and back to email', {tag: '@authentication'}, async ({pw, page}) => {
    test.setTimeout(pw.duration.two_min);

    await pw.ensureLicense();
    await pw.skipIfNoLicense();
    const {adminClient, user, team, townSquare} = await pw.initSetup();
    await pw.ensureSiteUrl();
    await pw.ensureKeycloakOpenId();
    const keycloakUser = {
        username: `kc${user.username}`,
        email: user.email,
        firstName: user.first_name || 'First',
        lastName: user.last_name || 'Last',
        password: 'Password1',
    };
    await pw.createKeycloakUser(keycloakUser);
    const newPassword = pw.newTestPassword();

    // # Log in as the email user and switch to OpenID
    const app = await logInToTeam(pw, page, user.username, user.password, team);
    await switchSignInTo(app, 'openid');
    await app.claim.emailToOauth.fillPasswordTextbox(user.password);
    await app.claim.emailToOauth.clickSubmitButton();
    await pw.keycloakLoginPage.login(keycloakUser.username, keycloakUser.password);
    await expectOnLoginPage(page);

    // * The account authenticates through OpenID
    expect((await adminClient.getUser(user.id)).auth_service).toBe('openid');

    // # Log in through OpenID (Keycloak may reuse its session) and switch back to email
    await app.login.openidLink.click();
    await pw.keycloakLoginPage.loginIfFormShown(keycloakUser.username, keycloakUser.password);
    await expectSignedIn(page);
    await app.channelsPage.goto({team, channel: townSquare});
    await switchSignInTo(app, 'email');
    const claim = app.claim.oauthToEmail;
    await claim.fillPasswordTextbox(newPassword);
    await claim.fillConfirmTextbox(newPassword);
    await claim.clickSubmitButton();
    await expectOnLoginPage(page);

    // * Verify the account authenticates with the new email password
    expect((await adminClient.getUser(user.id)).auth_service).toBe('');
    await logIn(app, user.email, newPassword);
    await expectSignedIn(page);
});

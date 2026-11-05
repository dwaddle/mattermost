// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {App, expect, generated, test} from '@mattermost/playwright-lib';

/** Opens a user's System Console profile and checks its authentication method. */
async function expectAuthMethod(app: App, userId: string, method: string) {
    await app.page.goto(`${generated.AdminConsolePage.path()}/user_management/user/${userId}`);
    await expect(app.admin.user.authMethodText.locator).toHaveText(method);
}

/**
 * @objective Verify an LDAP-provisioned user's System Console profile shows Authentication Method LDAP.
 *
 * @precondition
 * An LDAP directory reachable at the configured LdapSettings.LdapServer/LdapPort.
 */
test(
    'MM-T953_3 shows LDAP as the authentication method for a directory user',
    {tag: '@authentication'},
    async ({pw, page}) => {
        await pw.ensureLicense();
        await pw.skipIfNoLicense();

        const {adminUser, adminClient} = await pw.initSetup();
        await pw.ensureOpenldap();
        const ldapUser = pw.generateLdapUser();
        await pw.createLdapUser(ldapUser);

        // # Provision the directory user through the login form
        await pw.hasSeenLandingPage();
        const login = new App(page);
        await login.loginPage.goto();
        await login.login.fillLoginIdTextbox(ldapUser.username);
        await login.login.fillPasswordTextbox(ldapUser.password);
        await login.login.card.clickLogInButton();
        await expect(page).not.toHaveURL(/\/login/);

        const provisionedUser = await adminClient.getUserByUsername(ldapUser.username);
        const {app} = await pw.testBrowser.login(adminUser);

        // * The user's System Console profile shows the authentication method
        await expectAuthMethod(app, provisionedUser.id, 'LDAP');
    },
);

/**
 * @objective Verify a SAML user's System Console profile shows Authentication Method SAML.
 *
 * @precondition
 * A licensed server with the User Detail page available.
 */
test('MM-T953_4 shows SAML as the authentication method for a SAML user', {tag: '@authentication'}, async ({pw}) => {
    await pw.ensureLicense();
    await pw.skipIfNoLicense();

    const {adminUser, adminClient, user} = await pw.initSetup();

    // # Switch the user to SAML authentication and log in as the admin
    await adminClient.updateUserAuth(user.id, {auth_service: 'saml', auth_data: user.email});

    const {app} = await pw.testBrowser.login(adminUser);

    // * The user's System Console profile shows the authentication method
    await expectAuthMethod(app, user.id, 'SAML');
});

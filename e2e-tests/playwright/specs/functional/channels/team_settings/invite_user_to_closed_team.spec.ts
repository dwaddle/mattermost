// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import {expect, formatMessage, Msg, test, type App} from '@mattermost/playwright-lib';

/**
 * Types the email in the invite dialog's people input, takes its suggestion and sends the invite. The suggestion is
 * the user's own when the email belongs to an account, and "Add email" otherwise.
 */
async function inviteByEmail(app: App, email: string, user?: Pick<UserProfile, 'id'>) {
    const invite = app.invitationModal.invite;
    const input = invite.users.inputCombobox.locator;
    await input.click();
    await input.pressSequentially(email, {delay: 50});

    // the menu offers the suggestion once its search finishes; Enter takes it
    const suggestion = user ? invite.users.user(user) : invite.users.emailOption;
    await expect(suggestion.locator).toBeVisible({timeout: 15000});
    await input.press('Enter');
    await expect(input).toHaveValue('');
    await expect(invite.sendButton.locator).toBeEnabled();
    await invite.clickSendButton();
}

/**
 * @objective Verify that a user with a valid email domain can be invited to a closed team,
 * and a user with an invalid email domain is rejected with the correct error message.
 *
 * Written on the generated page objects: the team menu, Team Settings' Access tab (allowed-domains checkbox and
 * input, save panel), and the invite dialog's people input and its suggestions (a user by id, or Add email), Send button and result sections.
 */
test('MM-T388 Invite new user to closed team with email domain restriction', {tag: '@team_settings'}, async ({pw}) => {
    const emailDomain = 'sample.mattermost.com';

    // # Set up admin user and team
    const {adminUser, adminClient, team} = await pw.initSetup();

    // # Enable email invitations so the invite modal shows "Add email" option
    await adminClient.patchConfig({
        ServiceSettings: {EnableEmailInvitations: true},
    });

    // # Create a new user NOT on the team (default email is @sample.mattermost.com)
    const newUser = await adminClient.createUser(await pw.random.user(), '', '');

    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');
    const {app} = await pw.testBrowser.login(adminUser);

    // # Navigate to team
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open Team Settings Modal and go to Access tab
    const settings = await (await app.lhs.header.clickOpenTeamMenuButton()).clickTeamSettingsMenuItem();
    await settings.tabs.tab('access').select();

    // # Enable "Allow only users with a specific email domain" and add the domain
    await settings.access.allowedDomainsCheckbox.locator.check();
    const domains = settings.access.allowedDomains.inputCombobox.locator;
    await domains.fill(emailDomain);
    await domains.press('Enter');

    // # Save changes
    await settings.savePanel.clickSaveButton();
    await expect(settings.savePanel.messageText.locator).toHaveText(formatMessage(Msg.saveChangesPanel.saved));

    // # Close the Team Settings modal and wait for it to disappear
    await settings.clickCloseButton();
    await expect(settings.closeButton.locator).not.toBeVisible();

    // Re-apply email invitations immediately before opening the invite modal: a
    // concurrent initSetup() → patchConfig(defaultConfig) resets
    // ServiceSettings.EnableEmailInvitations: false between the initial patchConfig and here.
    await adminClient.patchConfig({
        ServiceSettings: {EnableEmailInvitations: true},
    });
    await pw.waitUntil(async () => {
        const cfg = await adminClient.getConfig();
        return cfg.ServiceSettings?.EnableEmailInvitations === true;
    });

    // # Open team menu and click 'Invite People', and invite the user with a valid email domain
    await (await app.lhs.header.clickOpenTeamMenuButton()).clickInvitePeopleMenuItem();
    await inviteByEmail(app, newUser.email, newUser);

    // * Verify that the user has been successfully invited to the team
    const result = app.invitationModal.result;
    await expect(result.sent.locator).toContainText('This member has been added to the team.');

    await adminClient.patchConfig({
        ServiceSettings: {EnableEmailInvitations: true},
    });
    await pw.waitUntil(async () => {
        const cfg = await adminClient.getConfig();
        return cfg.ServiceSettings?.EnableEmailInvitations === true;
    });

    // # Click 'Invite More People' to return to the invite form
    await result.clickInviteMoreButton();

    // # Invite a user with an invalid email domain (not sample.mattermost.com)
    const invalidEmail = `user.${pw.random.id()}@invalid.com`;
    await inviteByEmail(app, invalidEmail);

    // * Verify that the invite failed with the correct domain restriction error
    await expect(result.notSent.locator).toContainText(
        `The following email addresses do not belong to an accepted domain: ${invalidEmail}.`,
    );
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

// Written on the generated page objects: the Add Bot form (username, default token expiry with its policy hint, Save),
// the integrations confirmation page, the bot list (bots keyed by user id, their tokens keyed by token id, with status,
// expiry, Regenerate and the revealed token) and the regenerate dialog with its expiry picker.

test.describe('Bot account personal access token expiry @bot_accounts @personal_access_tokens', () => {
    test('creates and regenerates a user-owned bot token under an enforced maximum lifetime', async ({pw}) => {
        test.setTimeout(120000);
        const {adminUser, adminClient, team} = await pw.initSetup();

        await adminClient.patchConfig({
            ServiceSettings: {
                EnableBotAccountCreation: true,
                EnableUserAccessTokens: true,
                MaximumPersonalAccessTokenLifetimeDays: 30,
            },
        });
        await pw.waitUntil(async () => {
            const cfg = await adminClient.getConfig();
            return (
                cfg.ServiceSettings?.EnableBotAccountCreation === true &&
                cfg.ServiceSettings?.EnableUserAccessTokens === true &&
                cfg.ServiceSettings?.MaximumPersonalAccessTokenLifetimeDays === 30
            );
        });

        const {app} = await pw.testBrowser.login(adminUser);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Create a user-owned bot account. Add Bot always creates a default token.
        const username = `patbot${Date.now().toString(36).slice(-8)}`;
        await app.page.goto(`/${team.name}/integrations/bots/add`);
        const form = app.integrations.botForm;
        await form.fillUsernameTextbox(username);

        // * The default-token expiry picker is enforced and clamped by the 30-day policy.
        const expiry = form.defaultToken.expiryCombobox.locator;
        await expect(expiry).toBeVisible();
        await expect(expiry).not.toContainText('No expiry');
        await expect(expiry).toContainText('30 days');
        await expect(expiry).not.toContainText('90 days');
        await expect(form.defaultToken.expiryEnforcedText.locator).toHaveText(
            'Your administrator requires all personal access tokens to have an expiry date.',
        );

        await form.clickSaveButton();
        await app.page.waitForURL(/\/integrations\/confirm\?type=bots/);
        await expect(app.integrations.confirm.copyTokenButton.locator).toBeVisible();

        // # Return to the bot list and regenerate the default token.
        await app.page.goto(`/${team.name}/integrations/bots`);
        const botUser = await adminClient.getUserByUsername(username);
        const bot = app.integrations.bots.bot({user_id: botUser.id});
        await expect(bot.locator).toBeVisible();

        // * The default token is the bot's only token, active, with an expiry date rather than "Never"
        await expect(bot.tokenItems).toHaveCount(1);
        const token = bot.token({id: (await bot.tokenKeys())[0]});
        await expect(token.locator).toContainText('Default Token');
        await expect(token.statusText.locator).toHaveText('Active');
        await expect(token.expiryText.locator).toContainText('Expires:');
        await expect(token.expiryText.locator).not.toContainText('Never');

        await token.clickRegenerateLink();
        const regenerate = app.botTokenRegenerateModal;
        await expect(regenerate.locator).toContainText('Regenerate Token?');
        await expect(regenerate.expiryCombobox.locator).toBeVisible();
        await expect(regenerate.expiryCombobox.locator).not.toContainText('No expiry');
        await expect(regenerate.confirmButton.locator).toHaveText('Yes, Regenerate');
        await regenerate.clickConfirmButton();

        // * The rotated secret is revealed using the same one-time-copy pattern.
        await expect(bot.newToken.locator).toContainText('Access Token:');
        await expect(bot.newToken.copyButton.locator).toBeVisible();
    });
});

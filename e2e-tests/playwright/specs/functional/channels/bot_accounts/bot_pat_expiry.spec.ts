// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, duration, Msg} from '@mattermost/playwright-lib';

test.describe('Bot account personal access token expiry @bot_accounts @personal_access_tokens', () => {
    test('creates and regenerates a user-owned bot token under an enforced maximum lifetime', async ({pw}) => {
        test.setTimeout(duration.two_min);
        const {adminUser, adminClient, team, townSquare} = await pw.initSetup();

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
        await app.channelsPage.goto({team, channel: townSquare});

        // # Create a user-owned bot account. Add Bot always creates a default token.
        const username = `patbot${Date.now().toString(36).slice(-8)}`;
        await app.page.goto(`/${team.name}/integrations/bots/add`);
        const form = app.integrations.botForm;
        await form.fillUsernameTextbox(username);

        // * The default-token expiry picker is enforced and clamped by the 30-day policy.
        const expiry = form.defaultToken.expiryCombobox.locator;
        await expect(expiry).toBeVisible();
        await expect(expiry).not.toContainMessage(Msg.user.settings.tokens.expiry.none);
        await expect(expiry).toContainText('30 days');
        await expect(expiry).not.toContainMessage(Msg.user.settings.tokens.expiry['90d']);
        await expect(form.defaultToken.expiryEnforcedText.locator).toHaveMessage(
            Msg.user.settings.tokens.expiryEnforced,
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
        await expect(token.locator).toContainMessage(Msg.bot.token.default.description);
        await expect(token.statusText.locator).toHaveMessage(Msg.user.settings.tokens.status.active);
        await expect(token.expiryText.locator).toContainMessage(Msg.user.settings.tokens.expiry._);
        await expect(token.expiryText.locator).not.toContainMessage(Msg.user.settings.tokens.expiry.never);

        await token.clickRegenerateLink();
        const regenerate = app.botTokenRegenerateModal;
        await expect(regenerate.locator).toContainMessage(Msg.user.settings.tokens.confirmRegenerateTitle);
        await expect(regenerate.expiryCombobox.locator).toBeVisible();
        await expect(regenerate.expiryCombobox.locator).not.toContainMessage(Msg.user.settings.tokens.expiry.none);
        await expect(regenerate.confirmButton.locator).toHaveMessage(Msg.user.settings.tokens.confirmRegenerateButton);
        await regenerate.clickConfirmButton();

        // * The rotated secret is revealed using the same one-time-copy pattern.
        await expect(bot.newToken.locator).toContainMessage(Msg.user.settings.tokens.token);
        await expect(bot.newToken.copyButton.locator).toBeVisible();
    });
});

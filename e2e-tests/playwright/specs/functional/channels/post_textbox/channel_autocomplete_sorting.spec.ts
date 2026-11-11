// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, formatMessage, Msg, suggestionTestKey, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that the "Other Channels" group in the ~channel autocomplete in the message input prioritizes
 * channels whose DisplayName matches the search term.
 *
 * Written on the generated page objects: the composer's suggestions, keyed by channel name, in the order shown.
 */
test(
    'MM-67953 channel mention autocomplete prioritizes DisplayName matches in Other Channels',
    {tag: ['@mentions']},
    async ({pw}) => {
        // # Initialize setup
        const {team, user, adminClient, userClient} = await pw.initSetup();

        // # Create channels whose DisplayName matches the search term (user is NOT a member)
        const conversation = await adminClient.createChannel({
            team_id: team.id,
            name: 'ac-gamma-conversation-' + Date.now(),
            display_name: 'Gamma: Conversation',
            type: 'O',
        });
        const logs = await adminClient.createChannel({
            team_id: team.id,
            name: 'ac-gamma-logs-' + Date.now(),
            display_name: 'Gamma: Logs',
            type: 'O',
        });

        // # Create channels that match only by purpose
        const alpha = await adminClient.createChannel({
            team_id: team.id,
            name: 'ac-alpha-channel-' + Date.now(),
            display_name: 'Alpha Channel',
            type: 'O',
            purpose: 'alpha release of gamma',
        });
        const beta = await adminClient.createChannel({
            team_id: team.id,
            name: 'ac-beta-channel-' + Date.now(),
            display_name: 'Beta Channel',
            type: 'O',
            purpose: 'beta release of gamma',
        });

        const townSquare = await userClient.getChannelByName(team.id, 'town-square');
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Type a channel mention
        const composer = app.center.postCreate;
        await composer.messageTextbox.locator.pressSequentially('~gamma');

        // * Verify the four channels are suggested under "Other Channels"
        const {suggestions} = composer.message;
        const otherChannels = app.page.getByRole('group', {name: formatMessage(Msg.suggestion.mention.morechannels)});
        await expect(otherChannels).toBeVisible();
        const expected = [conversation, logs, alpha, beta];
        for (const channel of expected) {
            await expect(otherChannels).toContainText(channel.display_name);
        }

        // * Verify DisplayName matches come first, then the purpose-only matches
        await expect(suggestions.itemList).toHaveKeys(expected.map((channel) => suggestionTestKey(`~${channel.name}`)));
    },
);

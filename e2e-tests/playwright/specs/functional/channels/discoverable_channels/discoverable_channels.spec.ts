// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {Channel} from '@mattermost/types/channels';

import {expect, test} from '@mattermost/playwright-lib';

/**
 * These specs cover the Discoverable Private Channels request-to-join UX
 * (MM-68764). They only run when the DiscoverableChannels feature flag is
 * enabled on the server (e.g. MM_FEATUREFLAGS_DiscoverableChannels=true);
 * otherwise they self-skip.
 *
 * Written on the generated page objects: Browse Channels (rows keyed by channel name, with Request to join and
 * Withdraw), the channel switcher (results keyed by channel id), and the Request to Join and Join Private Channel
 * dialogs.
 */

async function createDiscoverableChannel(adminClient: Client4, teamId: string): Promise<Channel> {
    const suffix = Date.now();
    return adminClient.createChannel({
        team_id: teamId,
        name: `disc-private-${suffix}`,
        display_name: `Discoverable Private ${suffix}`,
        type: 'P',
        discoverable: true,
    } as Channel);
}

/**
 * @knownIssue Browse Channels' search results intermittently omit the "Request to join"
 * button for a discoverable private channel: browse_channels.tsx races the typed-search
 * fetch against loadDiscoverableChannels(), and whichever resolves last overwrites the
 * other's row.
 */
test.fixme(
    'MM-68764 non-member requests to join a discoverable private channel from Browse Channels and can withdraw',
    {tag: ['@discoverable_channels']},
    async ({pw}) => {
        await pw.ensureFeatureFlag('DiscoverableChannels', true);

        // # Initialize setup and create a discoverable private channel the user is not a member of
        const {team, user, adminClient, townSquare} = await pw.initSetup();
        const channel = await createDiscoverableChannel(adminClient, team.id);

        // # Log in as the non-member user and open Browse Channels
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: 'town-square'});
        const browse = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickBrowseChannelsMenuItem();

        // # Find the discoverable channel
        await browse.searchTextbox.fill(channel.display_name);
        const row = browse.list.channel(channel);

        // * The row offers "Request to join" rather than a Join button
        await expect(row.requestButton.locator).toBeVisible();
        await expect(row.joinButton.locator).toHaveCount(0);

        // # Request to join and confirm in the modal
        const requestModal = await row.clickRequestButton();
        await requestModal.clickConfirmButton();

        // * The row flips to the pending "Withdraw" state
        await expect(row.withdrawButton.locator).toBeVisible();

        // # Withdraw the request
        await row.clickWithdrawButton();

        // * The row returns to the "Request to join" state
        await expect(row.requestButton.locator).toBeVisible();
    },
);

test(
    'MM-68764 selecting a discoverable private channel from Find Channels opens Request to Join, not the legacy join',
    {tag: ['@discoverable_channels']},
    async ({pw}) => {
        await pw.ensureFeatureFlag('DiscoverableChannels', true);

        // # Initialize setup and create a discoverable private channel the user is not a member of
        const {team, user, adminClient, townSquare} = await pw.initSetup();
        const channel = await createDiscoverableChannel(adminClient, team.id);

        // # Log in as the non-member user
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Open Find Channels and locate the discoverable channel
        const switcher = await app.lhs.header.clickFindChannelsButton();
        await switcher.searchTextbox.fill(channel.display_name);
        const result = switcher.suggestions.item(channel.id);
        await expect(result.locator).toBeVisible();

        // # Select the discoverable channel
        await result.locator.click();

        // * The Request to Join modal opens instead of the legacy private-channel join
        // confirmation, and no "Join private channel" dialog is shown.
        await expect(app.requestJoinChannelModal.confirmButton.locator).toBeVisible();
        await expect(app.joinPrivateChannelModal.locator).toHaveCount(0);
    },
);

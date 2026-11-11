// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, DefaultChannel} from '@mattermost/playwright-lib';

/**
 * @objective Verify channel drafts on the global Drafts page are scoped to the
 * current active team, while each team's Drafts LHS entry and pencil icons stay
 * independent.
 */
test('MM-T4410 Channel Drafts are scoped to current active team', {tag: '@messaging'}, async ({pw}) => {
    const team1Draft = `team1-draft-${pw.random.id()}`;
    const team2Draft = `team2-draft-${pw.random.id()}`;

    // # Create a user on Team1 and add them to a second team
    const {user, team: team1, adminClient} = await pw.initSetup();
    const team2 = await pw.createNewTeam(adminClient, {
        name: 'team',
        displayName: 'Team',
        type: 'O',
        unique: true,
    });
    await adminClient.addToTeam(team2.id, user.id);
    const [team1TownSquare, team1OffTopic, team2TownSquare, team2OffTopic] = await Promise.all([
        adminClient.getChannelByName(team1.id, DefaultChannel.TownSquare),
        adminClient.getChannelByName(team1.id, DefaultChannel.OffTopic),
        adminClient.getChannelByName(team2.id, DefaultChannel.TownSquare),
        adminClient.getChannelByName(team2.id, DefaultChannel.OffTopic),
    ]);

    const {app} = await pw.testBrowser.login(user);
    const composer = app.center.postCreate;
    const title = app.channelHeader.openMenuButton.locator;
    const channels = app.lhs.channelList;

    // # Open Town Square on Team1 and leave a channel draft
    await app.channelsPage.goto({team: team1, channel: team1TownSquare});
    await composer.fillMessageTextbox(team1Draft);

    // # Switch away so the draft is persisted with show:true
    await channels.channel(team1OffTopic).clickLink();
    await expect(title).toContainText(team1OffTopic.display_name);

    // * Global Drafts appears in the LHS with count 1
    await expect(app.lhs.draftsLink.locator).toBeVisible();
    await expect(app.lhs.drafts.draftBadgeText.locator).toHaveText('1');

    // * Town Square shows a pencil icon for the draft
    // (move the mouse off the sidebar first: the pencil is hidden while its row is hovered)
    await composer.messageTextbox.locator.hover();
    await expect(channels.channel(team1TownSquare).draftText.locator).toBeVisible();

    // # Switch to Team2
    await app.teamSidebar.team(team2.id).locator.click();

    // * Team1's Town Square draft icon is not carried over into Team2's sidebar
    await expect(channels.channel(team2TownSquare).link.locator).toBeVisible();
    await expect(channels.channel(team2TownSquare).draftText.locator).toHaveCount(0);

    // # Open Team2 Off-Topic and leave a different channel draft
    await channels.channel(team2OffTopic).clickLink();
    await expect(title).toContainText(team2OffTopic.display_name);
    await composer.fillMessageTextbox(team2Draft);

    // # Switch away so the Team2 draft is persisted with show:true
    await channels.channel(team2TownSquare).clickLink();
    await expect(title).toContainText(team2TownSquare.display_name);

    // * Global Drafts appears in the LHS with count 1 for Team2 only
    await expect(app.lhs.drafts.draftBadgeText.locator).toHaveText('1');

    // * Off-Topic on Team2 shows a pencil icon for the draft
    await composer.messageTextbox.locator.hover();
    await expect(channels.channel(team2OffTopic).draftText.locator).toBeVisible();

    // # Open global Drafts on Team2
    await app.lhs.clickDraftsLink();

    // * Only the current team's draft is listed, for Off-Topic
    const drafts = app.drafts;
    await expect.poll(async () => (await drafts.list.draftKeys()).length).toBe(1);
    await expect(drafts.tabs.draftsCountText.locator).toHaveText('1');
    const team2DraftRow = drafts.list.draft(team2OffTopic.id);
    await expect(team2DraftRow.header.locator).toContainText('In:');
    await expect(team2DraftRow.header.locator).toContainText(team2OffTopic.display_name);
    await expect(team2DraftRow.message.locator).toContainText(team2Draft);

    // # Switch back to Team1
    await app.teamSidebar.team(team1.id).locator.click();

    // * Team2's Off-Topic draft icon is not carried over into Team1's sidebar
    await expect(channels.channel(team1OffTopic).link.locator).toBeVisible();
    await expect(channels.channel(team1OffTopic).draftText.locator).toHaveCount(0);

    // * Drafts remains visible with count scoped to Team1
    await expect(app.lhs.drafts.draftBadgeText.locator).toHaveText('1');

    // # Open global Drafts on Team1
    await app.lhs.clickDraftsLink();

    // * Only the Town Square draft from Team1 is listed
    await expect.poll(async () => (await drafts.list.draftKeys()).length).toBe(1);
    await expect(drafts.tabs.draftsCountText.locator).toHaveText('1');
    const team1DraftRow = drafts.list.draft(team1TownSquare.id);
    await expect(team1DraftRow.header.locator).toContainText('In:');
    await expect(team1DraftRow.header.locator).toContainText(team1TownSquare.display_name);
    await expect(team1DraftRow.message.locator).toContainText(team1Draft);
    await expect(drafts.list.draft(team2OffTopic.id).locator).toHaveCount(0);
});

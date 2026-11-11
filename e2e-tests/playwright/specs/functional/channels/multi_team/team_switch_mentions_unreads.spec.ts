// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, DefaultChannel} from '@mattermost/playwright-lib';

/**
 * @objective Verify switching teams preserves direct messages and each team's last channel, while team badges distinguish mentions from ordinary unread messages.
 */
test(
    'MM-T433 MM-T437 MM-T438 switches teams and displays multi-team mentions and unreads',
    {tag: '@multi_team'},
    async ({pw}) => {
        // # Create two teams, two users on both teams, and one user only on the first team
        const {user, team, adminClient, userClient} = await pw.initSetup();
        const [sharedUser, firstTeamUser] = await adminClient.createUsers(team.id, 2, 'multi-team');
        const {client: sharedUserClient} = await pw.makeClient(sharedUser);
        const secondTeam = await pw.createNewTeam(adminClient, {
            name: 'team',
            displayName: 'Second Team',
            type: 'O',
            unique: true,
        });
        await adminClient.addToTeam(secondTeam.id, user.id);
        await adminClient.addToTeam(secondTeam.id, sharedUser.id);

        const firstDm = await adminClient.createDirectChannel([user.id, sharedUser.id]);
        const secondDm = await adminClient.createDirectChannel([user.id, firstTeamUser.id]);
        await userClient.createPost({channel_id: firstDm.id, message: ':)'});
        await userClient.createPost({channel_id: secondDm.id, message: ':('});

        // # Open both DMs on the first team, ending on the second DM, then switch to the second team
        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, path: 'messages', channel: `@${sharedUser.username}`});
        await app.channelsPage.goto({team, path: 'messages', channel: `@${firstTeamUser.username}`});
        const firstTeamButton = app.teamSidebar.team(team.id);
        const secondTeamButton = app.teamSidebar.team(secondTeam.id);
        await secondTeamButton.locator.click();

        // * Verify the second team opens at the top of its channel list and both DMs remain available
        await expect
            .poll(() => page.url(), {timeout: pw.duration.ten_sec})
            .toContain(`/${secondTeam.name}/channels/town-square`);
        await expect(app.lhs.header.openTeamMenuButton.locator).toContainText(secondTeam.display_name);
        await expect(app.lhs.channelList.channel(firstDm).link.locator).toBeVisible();
        await expect(app.lhs.channelList.channel(secondDm).link.locator).toBeVisible();

        // # Post in Off-Topic on the second team, then switch back to the first team
        const secondTeamOffTopic = await adminClient.getChannelByName(secondTeam.id, DefaultChannel.OffTopic);
        await app.lhs.channelList.channel(secondTeamOffTopic).clickLink();
        await app.center.postCreate.fillMessageTextbox('Hello World');
        await app.center.postCreate.clickSendButton();
        await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
        const lastId = (await app.center.postList.postKeys()).at(-1)!;
        await expect(app.center.postList.post({id: lastId}).messageText.locator).toHaveText('Hello World');
        await firstTeamButton.locator.click();

        // * Verify team data does not cross-contaminate and the first team's last DM is restored
        const firstTeamOffTopic = await adminClient.getChannelByName(team.id, DefaultChannel.OffTopic);
        await expect(app.lhs.channelList.channel(firstTeamOffTopic).link.locator).not.toHaveAccessibleName(
            / (unread|\d+ mentions?)$/,
        );
        await expect(app.lhs.channelList.channel(firstDm).link.locator).toBeVisible();
        await expect(app.lhs.channelList.channel(secondDm).link.locator).toBeVisible();
        await expect
            .poll(() => page.url(), {timeout: pw.duration.ten_sec})
            .toContain(`/${team.name}/messages/@${firstTeamUser.username}`);

        // # Have the shared user mention the test user twice in the second team's Off-Topic channel
        await sharedUserClient.createPost({
            channel_id: secondTeamOffTopic.id,
            message: `@${user.username} first mention`,
        });
        await sharedUserClient.createPost({
            channel_id: secondTeamOffTopic.id,
            message: `@${user.username} second mention`,
        });

        // * Verify the second team's badge reports two mentions
        await expect(secondTeamButton.mentionsText.locator).toHaveText('2');

        // # Switch to the second team to read its mentions
        await secondTeamButton.locator.click();
        await app.lhs.channelList.channel(secondTeamOffTopic).clickLink();

        // * Verify the second team's mention badge clears
        await expect(secondTeamButton.mentionsText.locator).not.toBeVisible();
        await expect(secondTeamButton.unreadText.locator).not.toBeVisible();

        // # Have the shared user post an ordinary message on the first team while it is in the background
        await sharedUserClient.createPost({
            channel_id: firstTeamOffTopic.id,
            message: 'Hey all',
        });

        // * Verify the first team reports unread activity without a mention count
        await expect(firstTeamButton.unreadText.locator).toBeVisible();
        await expect(firstTeamButton.unreadText.locator).toHaveText('');
        await expect(firstTeamButton.mentionsText.locator).not.toBeVisible();
    },
);

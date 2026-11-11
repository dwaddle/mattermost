// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Team} from '@mattermost/types/teams';

import {expect, test, type App} from '@mattermost/playwright-lib';

/** Opens the search box from the global header. */
async function openSearch(app: App) {
    await app.globalHeader.search.clickOpenButton();
    return app.searchBox.inputSearchbox.locator;
}

/** Searches for the term from the global header. */
async function searchFor(app: App, term: string) {
    const input = await openSearch(app);
    await input.fill(term);
    await input.press('Enter');
}

/** Switches to the team and leaves it from the team menu. */
async function leaveTeam(app: App, team: Team) {
    await app.teamSidebar.team(team.id).locator.click();
    const leaveModal = await (await app.lhs.header.clickOpenTeamMenuButton()).clickLeaveTeamMenuItem();
    await leaveModal.clickConfirmButton();
}

test('team selector should not be visible if user belongs to only one team', async ({pw}) => {
    // # Create a user with only one team, and a channel with a message
    const {adminClient, user, team} = await pw.initSetup();
    const channel = await adminClient.createChannel(
        pw.random.channel({
            teamId: team.id,
            displayName: 'Test Channel',
            name: 'test-channel',
        }),
    );
    const message = 'test message for search';
    await adminClient.addToChannel(user.id, channel.id);
    const post = await adminClient.createPost({channel_id: channel.id, message});
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');

    // # Log in and open the search UI
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    const input = await openSearch(app);

    // * Verify that the team selector is not visible in the search box
    await expect(input).toBeVisible();
    await expect(app.searchBox.teamSelector.openMenuButton.locator).not.toBeVisible();

    // # Now search for the message to see search results
    await input.fill(message);
    await input.press('Enter');
    await expect(app.search.results.post(post).messageText.locator).toHaveText(message);

    // * Verify the team selector is not visible in search results panel
    await expect(app.search.teamSelector.openMenuButton.locator).not.toBeVisible();
});

test('team selector should be visible if user belongs to multiple teams', async ({pw}) => {
    // # Create a user with a second team, and a channel with a message in the first
    const {adminClient, user, team} = await pw.initSetup();
    const secondTeam = await adminClient.createTeam(await pw.random.team('team', 'Team', 'O', true));
    await adminClient.addUsersToTeam(secondTeam.id, [user.id]);
    const channel = await adminClient.createChannel(
        pw.random.channel({
            teamId: team.id,
            displayName: 'Test Channel',
            name: 'test-channel-multi',
        }),
    );
    const message = 'test message for multiple teams search';
    await adminClient.addToChannel(user.id, channel.id);
    const post = await adminClient.createPost({channel_id: channel.id, message});
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');

    // # Log in and open the search UI
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    const input = await openSearch(app);

    // * Verify that the team selector is visible in the search box, and lists both teams and All Teams
    const composerMenu = await app.searchBox.teamSelector.clickOpenMenuButton();
    await expect(composerMenu.team(team).locator).toBeVisible();
    await expect(composerMenu.team(secondTeam).locator).toBeVisible();
    await expect(composerMenu.allTeamsMenuItemRadio.locator).toBeVisible();

    // # Now search for the message to see search results
    await page.keyboard.press('Escape');
    await input.fill(message);
    await input.press('Enter');
    await expect(app.search.results.post(post).messageText.locator).toHaveText(message);

    // * Verify the team selector in the search results panel lists both teams and All Teams
    const resultsMenu = await app.search.teamSelector.clickOpenMenuButton();
    await expect(resultsMenu.team(team).locator).toBeVisible();
    await expect(resultsMenu.team(secondTeam).locator).toBeVisible();
    await expect(resultsMenu.allTeamsMenuItemRadio.locator).toBeVisible();
});

test('team selector should show filter input with more than 4 teams', async ({pw}) => {
    // # Create a user and 4 more teams (for a total of 5)
    const {adminClient, user, team} = await pw.initSetup();
    const teams = [team];
    for (let i = 0; i < 4; i++) {
        const newTeam = await adminClient.createTeam(await pw.random.team('team', 'Team', 'O', true));
        await adminClient.addUsersToTeam(newTeam.id, [user.id]);
        teams.push(newTeam);
    }
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');

    // # Log in, open search and the team selector
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    await openSearch(app);
    const menu = await app.searchBox.teamSelector.clickOpenMenuButton();

    // * Verify the team filter input is visible with 5 teams, and all teams are listed initially
    await expect(menu.filterTextbox.locator).toBeVisible();
    for (const t of teams) {
        await expect(menu.team(t).locator).toBeVisible();
    }

    // # Type filter text to match only one team
    await menu.fillFilterTextbox(teams[2].display_name);

    // * Verify only the matching team is visible (and the currently selected team)
    await expect(menu.team(teams[0]).locator).toBeVisible(); // Current team always visible
    await expect(menu.team(teams[2]).locator).toBeVisible(); // Filtered team
    for (const t of [teams[1], teams[3], teams[4]]) {
        await expect(menu.team(t).locator).not.toBeVisible();
    }

    // # Clear the filter
    await menu.fillFilterTextbox('');

    // * Verify all teams are visible again
    for (const t of teams) {
        await expect(menu.team(t).locator).toBeVisible();
    }
});

test('MM-T5802 team filter list updates when a team is left', async ({pw}) => {
    // # Create a user and 4 more teams (5 total) so the team-filter input renders
    const {adminClient, team, user} = await pw.initSetup();
    const teams = [team];
    for (let i = 0; i < 4; i++) {
        const newTeam = await adminClient.createTeam(await pw.random.team('team', 'Team', 'O', true));
        await adminClient.addUsersToTeam(newTeam.id, [user.id]);
        teams.push(newTeam);
    }
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');

    // # Log in and open the team selector
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    await openSearch(app);
    let menu = await app.searchBox.teamSelector.clickOpenMenuButton();

    // * Verify all 5 teams are listed initially
    for (const t of teams) {
        await expect(menu.team(t).locator).toBeVisible();
    }

    // # Close the menu and the search box, then switch to and leave one of the extra teams
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    const teamToLeave = teams[teams.length - 1];
    await leaveTeam(app, teamToLeave);

    // # Reopen search and the team selector
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
    await openSearch(app);
    menu = await app.searchBox.teamSelector.clickOpenMenuButton();

    // * Verify the left team no longer appears in the filter list, and the remaining teams are still listed
    await expect(menu.team(teamToLeave).locator).not.toBeVisible();
    for (const t of teams.slice(0, -1)) {
        await expect(menu.team(t).locator).toBeVisible();
    }
});

test('MM-T5803 search results narrow to the selected team and update after leaving that team', async ({pw}) => {
    // # Create a user with two teams, each containing a distinct message
    const {adminClient, team, user} = await pw.initSetup();
    const secondTeam = await adminClient.createTeam(await pw.random.team('team', 'Team', 'O', true));
    await adminClient.addUsersToTeam(secondTeam.id, [user.id]);
    const messageInFirstTeam = 'pineapple message in the first team';
    const messageInSecondTeam = 'pineapple message in the second team';
    const firstChannel = await adminClient.getChannelByName(team.id, 'town-square');
    const secondChannel = await adminClient.getChannelByName(secondTeam.id, 'town-square');
    const firstPost = await adminClient.createPost({channel_id: firstChannel.id, message: messageInFirstTeam});
    const secondPost = await adminClient.createPost({channel_id: secondChannel.id, message: messageInSecondTeam});

    // # Log in, open search, and explicitly select "All Teams"
    // (the selector defaults to the currently active team, not "All Teams", on a fresh open)
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: firstChannel});
    const input = await openSearch(app);
    const composerTeamSelector = app.searchBox.teamSelector;
    await (await composerTeamSelector.clickOpenMenuButton()).clickAllTeamsMenuItemRadio();
    await input.fill('pineapple');
    await input.press('Enter');

    // * Verify both teams' messages show up
    const results = app.search.results;
    await expect(results.post(firstPost).messageText.locator).toHaveText(messageInFirstTeam);
    await expect(results.post(secondPost).messageText.locator).toHaveText(messageInSecondTeam);

    // # Reopen the search composer and narrow its team selector to the second team specifically
    // (changing the team via the results panel's own selector updates state but does not refresh
    // the displayed results — the search must be resubmitted via the composer, as below)
    await openSearch(app);
    await (await composerTeamSelector.clickOpenMenuButton()).team(secondTeam).click();

    // # Re-submit the search now that the composer is scoped to the second team
    await input.click();
    await input.press('Enter');

    // * Verify only the second team's message shows
    await expect.poll(() => results.postKeys()).toEqual([secondPost.id]);

    // # Leave the second team and re-run the same search
    await leaveTeam(app, secondTeam);
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
    await searchFor(app, 'pineapple');

    // * Verify only the first team's message shows now that the second team was left
    await expect.poll(() => results.postKeys()).toEqual([firstPost.id]);
});

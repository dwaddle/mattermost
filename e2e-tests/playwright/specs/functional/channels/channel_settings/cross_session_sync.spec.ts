// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import {expect, test, type App, type PlaywrightExtended, DefaultChannel} from '@mattermost/playwright-lib';

/** Creates a public channel from the sidebar's "+" menu and returns its name (the URL slug the app picked). */
async function createPublicChannel(app: App, displayName: string) {
    const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
    await modal.fillNameTextbox(displayName);
    await modal.clickConfirmButton();
    await expect(app.channelHeader.openMenuButton.locator).toContainText(displayName);
    return decodeURIComponent(new URL(app.page.url()).pathname.split('/').pop()!);
}

/** Logs the user in to a new browser session on Town Square. */
async function openSession(pw: PlaywrightExtended, user: UserProfile, team: {name: string}) {
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: DefaultChannel.TownSquare});
    return app;
}

/**
 * @objective Verify that creating and archiving a public channel in one browser session is synced in
 * real time to another session of the same user.
 */
test('MM-T837 syncs public channel create and archive across sessions', {tag: '@channel_settings'}, async ({pw}) => {
    const {user, team} = await pw.initSetup();

    // # Log in as the same user in two separate browser sessions
    const first = await openSession(pw, user, team);
    const second = await openSession(pw, user, team);

    // # Create a public channel in the first session
    const name = await createPublicChannel(first, `RF ${pw.random.id()}`);

    // * Verify the new channel appears in the sidebar of both sessions
    await expect(first.lhs.channelList.channel({name}).link.locator).toBeVisible();
    await expect(second.lhs.channelList.channel({name}).link.locator).toBeVisible();

    // # Archive the channel in the first session, then navigate away from the archived channel
    const archive = await (await first.channelHeader.clickOpenMenuButton()).clickArchiveChannelMenuItem();
    await archive.clickConfirmButton();
    await first.lhs.channelList.channel({name: DefaultChannel.TownSquare}).clickLink();

    // * Verify the channel is removed from the sidebar of both sessions
    await expect(first.lhs.channelList.channel({name}).link.locator).not.toBeVisible();
    await expect(second.lhs.channelList.channel({name}).link.locator).not.toBeVisible();
});

/**
 * @objective Verify that leaving a channel in one browser session removes it from the sidebar of another
 * session that is viewing a different channel, without disrupting that other session's current view.
 */
test(
    'MM-T892 leaving a channel syncs to another session viewing a different channel',
    {tag: '@channel_settings'},
    async ({pw}) => {
        const {user, team} = await pw.initSetup();

        // # Log in as the same user in two separate browser sessions
        const first = await openSession(pw, user, team);
        const second = await openSession(pw, user, team);

        // # Create a public channel in the first session
        const name = await createPublicChannel(first, `Leave ${pw.random.id()}`);

        // * Verify the new channel appears in the second session's sidebar
        await expect(second.lhs.channelList.channel({name}).link.locator).toBeVisible();

        // # Move the second session to a different channel
        await second.lhs.channelList.channel({name: DefaultChannel.OffTopic}).clickLink();
        await expect(second.page).toHaveURL(/\/channels\/off-topic$/);

        // # Leave the channel from the first session while still viewing it
        await (await first.channelHeader.clickOpenMenuButton()).clickLeaveChannelMenuItem();

        // * Verify the first session is redirected to the default channel and the channel is gone from its sidebar
        await expect(first.page).toHaveURL(/\/channels\/town-square$/);
        await expect(first.lhs.channelList.channel({name}).link.locator).not.toBeVisible();

        // * Verify the second session stays on its current channel and the left channel is removed from its sidebar
        await expect(second.lhs.channelList.channel({name}).link.locator).not.toBeVisible();
        await expect(second.page).toHaveURL(/\/channels\/off-topic$/);
    },
);

/**
 * @objective Verify that leaving a channel in one session, while another session of the same user is
 * viewing that same channel, redirects both sessions to the default channel and removes it from both sidebars.
 *
 * MM-T2554 covers the same behavior as MM-T2549 and is covered by this test.
 */
test(
    'MM-T2549 MM-T2554 leaving a viewed channel redirects the other session viewing it to Town Square',
    {tag: '@channel_settings'},
    async ({pw}) => {
        const {user, team} = await pw.initSetup();

        // # Log in as the same user in two separate browser sessions
        const first = await openSession(pw, user, team);
        const second = await openSession(pw, user, team);

        // # Create a public channel in the first session
        const displayName = `Leave ${pw.random.id()}`;
        const name = await createPublicChannel(first, displayName);

        // # Bring the second session to the same channel
        await second.lhs.channelList.channel({name}).clickLink();
        await expect(second.channelHeader.openMenuButton.locator).toContainText(displayName);

        // # Leave the channel from the first session while both sessions are viewing it
        await (await first.channelHeader.clickOpenMenuButton()).clickLeaveChannelMenuItem();

        // * Verify the first session is redirected to Town Square and the channel is gone from its sidebar
        await expect(first.page).toHaveURL(/\/channels\/town-square$/);
        await expect(first.lhs.channelList.channel({name}).link.locator).not.toBeVisible();

        // * Verify the second session is also redirected to Town Square and the channel is removed from its sidebar
        await expect(second.page).toHaveURL(/\/channels\/town-square$/);
        await expect(second.lhs.channelList.channel({name}).link.locator).not.toBeVisible();
    },
);

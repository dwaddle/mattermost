// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import {expect, test, type App} from '@mattermost/playwright-lib';

import {getChannelSlugFromUrl} from './helpers';

/** Picks the users in the Direct Messages modal (rows by user id) and opens the group message. */
async function openGroupMessage(app: App, users: Array<Pick<UserProfile, 'id' | 'username'>>) {
    const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickOpenDirectMessageMenuItem();
    for (const member of users) {
        await modal.list.searchCombobox.locator.fill(member.username);
        await modal.list.user(member).locator.click();
        await expect(modal.list.remove(member.id).locator).toBeVisible();
    }
    await modal.list.clickSaveButton();
    await expect(modal.list.saveButton.locator).not.toBeVisible();
}

/** Closes the open group message from its sidebar item's menu and waits for the item to leave the sidebar. */
async function closeGroupMessage(app: App, channel: {name: string}) {
    const item = app.lhs.channelList.channel(channel);
    await item.locator.hover();
    await (await item.clickOpenMenuButton()).clickLeaveMenuItem();
    await expect(item.locator).toHaveCount(0);
}

/**
 * @objective Verify muting a group message suppresses normal unread notification styling but keeps mention counts.
 *
 * Written on the generated page objects: the channel menu's Notification preferences dialog (mute, save) and the
 * group message's sidebar mention badge.
 */
test('MM-T475 Group Message Channel Preferences Mute channel', async ({pw}) => {
    const {adminClient, team, user} = await pw.initSetup();
    const [sender, secondParticipant] = await adminClient.createUsers(team.id, 2, 'gm-mute');
    const gmChannel = await adminClient.createGroupChannel([user.id, sender.id, secondParticipant.id]);
    const offTopic = await adminClient.getChannelByName(team.id, 'off-topic');

    // # Open the GM and mute it through notification preferences
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, path: 'messages', channel: gmChannel});
    const preferences = await (await app.channelHeader.clickOpenMenuButton()).clickNotificationPreferencesMenuItem();
    await preferences.muteCheckbox.locator.check();
    await preferences.clickSaveButton();
    await expect(preferences.saveButton.locator).not.toBeVisible();

    // # Post a normal message from another participant while away
    // `goto` is a full page navigation, so (re-)stub notifications only once settled on the away channel
    await app.channelsPage.goto({team, channel: offTopic});
    await pw.stubNotification(page, 'granted');
    await pw.postAs(sender, {channel_id: gmChannel.id, message: 'Muted normal GM message'});

    // * Verify no notification fires for the normal message while muted. Every GM post implicitly
    // mentions all members server-side (server/channels/app/notification.go), so the mention badge
    // still shows here even for a non-@mention message — that's current, correct behavior, not a bug.
    // (the badge counts the post once the client has it, so its notification would have fired by then)
    const badge = app.lhs.channelList.channel(gmChannel).mentionBadgeText.locator;
    await expect(badge).toHaveText('1');
    expect(await page.evaluate(() => window.getNotifications())).toHaveLength(0);

    // # Post a message that mentions the user while away
    await pw.postAs(sender, {
        channel_id: gmChannel.id,
        message: `@${user.username} Muted mention GM message`,
    });

    // * Verify muting still suppresses the notification, but the mention indicator counts it
    await expect(badge).toHaveText('2');
    expect(await page.evaluate(() => window.getNotifications())).toHaveLength(0);
});

/**
 * @objective Verify a closed group message can be reopened from the Direct Messages modal.
 *
 * Written on the generated page objects: the group message's sidebar item and its menu, the Direct Messages
 * picker's rows by user id, and the channel header.
 */
test('MM-T478 Closing group message channels and re-opening via Direct Messages modal', async ({pw}) => {
    const {adminClient, userClient, team, user} = await pw.initSetup();
    const participants = await adminClient.createUsers(team.id, 2, 'gm-reopen');

    // Created by the user: the server adds whoever creates a group message to it, so an admin-created one would
    // have the admin as a fourth member, and picking the two participants in the dialog would open a different group
    const gmChannel = await userClient.createGroupChannel([user.id, participants[0].id, participants[1].id]);

    // # Open then close the group message conversation
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, path: 'messages', channel: gmChannel});
    await expect(app.lhs.channelList.channel(gmChannel).link.locator).toBeVisible();
    await closeGroupMessage(app, gmChannel);

    // # Reopen the same GM from the Direct Messages modal. Searching by a single member's username
    // only surfaces an option to start a new conversation with that one person, not the existing
    // group message, so reselect both participants to resurface the existing conversation.
    await openGroupMessage(app, participants);

    // * Verify the existing group message opens again (the same channel, not a new group with the same names)
    await expect(app.page).toHaveURL(new RegExp(`/messages/${gmChannel.name}$`));
    const title = app.channelHeader.openMenuButton.locator;
    await expect(title).toContainText(participants[0].username);
    await expect(title).toContainText(participants[1].username);
    await expect(app.lhs.channelList.channel(gmChannel).link.locator).toBeVisible();
});

/**
 * @objective Verify that a closed group message can be reopened via a saved message and via the Direct Messages modal.
 *
 * MM-T477 and MM-T479 are duplicates of MM-T476 and are covered by this test.
 *
 * Written on the generated page objects: the Direct Messages picker, the composer and posts by id, the group
 * message's sidebar item and its menu, and Saved messages with the result's Jump link.
 */
test(
    'MM-T476 MM-T477 MM-T479 closes and reopens a group message via saved messages and the DM modal',
    {tag: '@direct_messages'},
    async ({pw}) => {
        // # Create the test user plus two more users on the team
        const {user, team, adminClient, userClient, townSquare} = await pw.initSetup();
        const [member1, member2] = await adminClient.createUsers(team.id, 2, 'gm');
        const townSquare = await adminClient.getChannelByName(team.id, 'town-square');

        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Create a group message and post a message, then save that message
        await openGroupMessage(app, [member1, member2]);
        await expect(page).toHaveURL(/\/messages\/[a-z0-9]{40}$/);
        const slug = getChannelSlugFromUrl(page);
        const token = `message to save ${pw.random.id()}`;
        await app.center.postCreate.fillMessageTextbox(token);
        await app.center.postCreate.clickSendButton();
        await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
        const savedPostId = (await app.center.postList.postKeys()).at(-1)!;
        await expect(app.center.postList.post({id: savedPostId}).messageText.locator).toHaveText(token);
        await userClient.savePreferences(user.id, [
            {user_id: user.id, category: 'flagged_post', name: savedPostId, value: 'true'},
        ]);

        // # Close the group message conversation
        await closeGroupMessage(app, {name: slug});

        // # Reopen the group message by jumping to the saved message
        await app.globalHeader.clickSavedMessagesButton();
        const result = app.search.results.post({id: savedPostId});
        await expect(result.messageText.locator).toHaveText(token);
        await result.locator.hover();
        await result.menu.clickJumpLink();

        // * Verify the group message channel is reopened
        await expect.poll(() => page.url(), {timeout: pw.duration.ten_sec}).toContain(`/messages/${slug}`);

        // # Close it again and reopen it via the Direct Messages modal
        await closeGroupMessage(app, {name: slug});
        await openGroupMessage(app, [member1, member2]);

        // * Verify the group message channel is reopened again
        await expect.poll(() => page.url(), {timeout: pw.duration.ten_sec}).toContain(`/messages/${slug}`);
    },
);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {type App, expect, generated, postsOf, test} from '@mattermost/playwright-lib';

// The notify-all confirmation modal appears once a channel has more than this many members.
const NOTIFY_ALL_THRESHOLD = 5;

/** Waits for a post in the center channel whose text contains `text`, and returns it with its id. */
async function postContaining(app: App, text: string) {
    const {postList} = app.center;
    const id = await postsOf(postList).keyWith({text});
    return {id, post: postList.post({id})};
}

/** The Markdown rendered in a post (its mention highlight). */
function markdownOf(app: App, post: {locator: Locator}) {
    return new generated.Markdown(app.page, 'markdown', post.locator);
}

/** Sends a message that asks for the notify-all confirmation, and confirms it. */
async function sendConfirmingNotifyAll(app: App, message: string) {
    await app.center.postCreate.fillMessageTextbox(message);
    await app.center.postCreate.clickSendButton();

    // * Verify the notify-all confirmation modal appears (the mention was recognized despite its casing)
    await expect(app.notifyConfirmModal.confirmButton.locator).toBeVisible();

    // # Confirm sending the notification
    await app.notifyConfirmModal.clickConfirmButton();
}

/**
 * @objective Verify that channel-wide mentions with uppercase letters trigger notifications and are properly highlighted.
 *
 * @precondition
 * - Two users are members of the same team
 * - Notification permissions are granted in the browser
 */
test(
    'MM-T483 triggers notification with uppercase channel-wide mention and highlights message for all users',
    {tag: '@notifications'},
    async ({pw}) => {
        // # Initialize setup and get the required users and team
        const {team, adminUser, adminClient, user} = await pw.initSetup();
        const offTopic = await adminClient.getChannelByName(team.id, 'off-topic');

        // # Log in as the admin in one browser session and navigate to the "town-square" channel
        const {app: adminApp, page: adminPage} = await pw.testBrowser.login(adminUser);
        await adminApp.channelsPage.goto({team, channel: 'town-square'});
        await expect(adminApp.center.postCreate.messageTextbox.locator).toBeVisible();

        // # Stub the Notification in the admin's browser to capture notifications
        await pw.stubNotification(adminPage, 'granted');

        // # Log in as the regular user in a separate browser and navigate to the "off-topic" channel
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: offTopic});

        // # Post a channel-wide mention message "@ALL" in uppercase from the user's browser
        const message = `@ALL good morning, ${team.name}!`;
        await app.center.postCreate.fillMessageTextbox(message);
        await app.center.postCreate.clickSendButton();

        // * Verify notification is received in the admin's browser with correct content
        const notifications = await pw.waitForNotification(adminPage);
        expect(notifications.length).toBe(1);

        const notification = notifications[0];
        expect(notification.title).toBe(offTopic.display_name);
        expect(notification.body).toBe(`@${user.username}: ${message}`);

        // The Notifications API tag must not leak the message body; the app uses the
        // opaque post ID as the tag so notifications coalesce per conversation.
        const {id: userPostId, post: userPost} = await postContaining(app, message);
        expect(notification.tag).toBe(userPostId);
        expect(notification.tag).not.toContain(message);

        expect(notification.icon).toContain('.png');
        expect(notification.requireInteraction).toBe(false);
        expect(notification.silent).toBe(false);

        // * Verify the last post as viewed by the regular user contains the message with @ALL highlighted
        await expect(markdownOf(app, userPost).mentionHighlightText.locator).toHaveText('@ALL');

        // # Navigate admin to the "off-topic" channel
        await adminApp.channelsPage.goto({team, channel: offTopic});

        // * Verify the message is posted and highlighted correctly for the admin user
        const {post: adminPost} = await postContaining(adminApp, message);
        await expect(markdownOf(adminApp, adminPost).mentionHighlightText.locator).toHaveText('@ALL');
    },
);

/**
 * @objective Verify a channel-wide mention typed in mixed case (@channEL) is recognized as a mention,
 * prompts the notify-all confirmation, and is posted with its original casing preserved.
 */
test(
    'MM-T484 recognizes a mixed-case @channEL channel-wide mention and preserves its casing',
    {tag: '@notifications'},
    async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup();

        // # Add enough members so the channel exceeds the notify-all threshold
        for (let i = 0; i < NOTIFY_ALL_THRESHOLD; i++) {
            const extraUser = await pw.createNewUserProfile(adminClient, {prefix: 'channel-wide'});
            await adminClient.addToTeam(team.id, extraUser.id);
        }

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: 'town-square'});

        // # Type a mixed-case channel-wide mention, send it and confirm the notify-all prompt
        const message = `@channEL mixed case mention ${pw.random.id()}`;
        await sendConfirmingNotifyAll(app, message);

        // * Verify the posted message preserves the mixed-case mention
        await postContaining(app, message);
    },
);

/**
 * @objective Verify an @HERE channel-wide mention typed in uppercase is recognized as a mention,
 * prompts the notify-all confirmation, and keeps its uppercase casing after switching channels.
 */
test(
    'MM-T485 recognizes an uppercase @HERE channel-wide mention and preserves its casing',
    {tag: '@notifications'},
    async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup();
        const townSquare = await adminClient.getChannelByName(team.id, 'town-square');
        const offTopic = await adminClient.getChannelByName(team.id, 'off-topic');

        // # Add enough members so the channel exceeds the notify-all threshold
        for (let i = 0; i < NOTIFY_ALL_THRESHOLD; i++) {
            const extraUser = await pw.createNewUserProfile(adminClient, {prefix: 'channel-wide'});
            await adminClient.addToTeam(team.id, extraUser.id);
        }

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: offTopic});

        // * Verify the "Channel-wide mentions" keyword is enabled by default in notification settings
        await app.globalHeader.clickSettingsButton();
        await app.userSettingsModal.tabs.tab('notifications').select();
        const keywords = app.settings.section('keywordsAndMentions');
        await keywords.clickEditButton();
        await expect(keywords.keyword('username').locator).toBeVisible();
        await expect(keywords.keyword('channel_wide').locator).toBeChecked();
        await app.userSettingsModal.clickCloseButton();
        await expect(app.userSettingsModal.locator).not.toBeVisible();

        // # Type an uppercase channel-wide mention, send it and confirm the notify-all prompt
        const message = `@HERE channel-wide mention ${pw.random.id()}`;
        await sendConfirmingNotifyAll(app, message);

        // * Verify the posted message preserves the uppercase mention
        await postContaining(app, message);

        // # Switch to another channel and back
        await app.lhs.channelList.channel(townSquare).clickLink();
        await app.lhs.channelList.channel(offTopic).clickLink();

        // * Verify the uppercase mention is still shown after returning to the channel
        await postContaining(app, message);
    },
);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator, Page} from '@playwright/test';
import type {Channel} from '@mattermost/types/channels';
import {CollapsedThreads} from '@mattermost/types/config';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile, UserNotifyProps} from '@mattermost/types/users';

import {
    Api,
    type App,
    DefaultChannel,
    duration,
    expect,
    type PlaywrightClient4,
    type PlaywrightExtended,
    test,
    waitForApi,
} from '@mattermost/playwright-lib';

test.describe('Reply notifications', () => {
    let adminClient: PlaywrightClient4;
    let senderClient: PlaywrightClient4;
    let team: Team;
    let channel: Channel;
    let receiver: UserProfile;
    let sender: UserProfile;
    let receiverPage: Page;
    let app: App;
    let playwright: PlaywrightExtended;

    test.beforeEach(async ({pw}, testInfo) => {
        const comments: UserNotifyProps['comments'] = testInfo.title.includes('MM-T552') ? 'root' : 'any';

        // # Create a receiver, sender, and dedicated channel for the reply-notification scenario
        const setup = await pw.initSetup();
        playwright = pw;
        adminClient = setup.adminClient;
        team = setup.team;
        receiver = setup.user;

        // # Disable collapsed threads and wait for the notification pipeline to apply the config change
        await adminClient.patchConfig({ServiceSettings: {CollapsedThreads: CollapsedThreads.DISABLED}});
        [sender] = await adminClient.createUsers(team.id, 1, 'reply-notification-sender');
        ({client: senderClient} = await pw.makeClient(sender));
        channel = await adminClient.createPublicChannel(team.id, 'Reply Notifications');
        await adminClient.addToChannel(receiver.id, channel.id);
        await adminClient.addToChannel(sender.id, channel.id);

        // # Set the receiver's reply-notification preference through notify_props
        await adminClient.patchUser({
            id: receiver.id,
            notify_props: {...receiver.notify_props, comments},
        });

        // # Log in as the receiver, open the test channel, and capture desktop notifications
        const browserSession = await pw.testBrowser.login(receiver);
        receiverPage = browserSession.page;
        app = browserSession.app;
        await app.channelsPage.goto({team, channel});
        await pw.stubNotification(receiverPage, 'granted');
    });

    async function goToTownSquare() {
        const channelViewResponse = waitForApi(receiverPage, Api.ViewChannelMe);
        await app.lhs.channelList.channel({name: DefaultChannel.TownSquare}).clickLink();
        await channelViewResponse;
    }

    /** Verifies the reply shows the exact text with the reply-mention highlight. */
    async function expectReplyNotification(post: {locator: Locator; messageText: {locator: Locator}}, message: string) {
        await expect(post.messageText.locator).toHaveText(message);
        await expect(post.locator).toHaveClass(/mention-comment/);
    }

    async function verifyStartedThreadNotification(message: string) {
        // # Start a thread as the receiver
        const rootPostResponse = waitForApi(receiverPage, Api.CreatePost);
        await app.center.postCreate.fillMessageTextbox('Hi there, this is another root message');
        await app.center.postCreate.clickSendButton();
        const rootPost = await rootPostResponse;

        // # Move to Town Square and post a reply as the sender
        await goToTownSquare();
        await senderClient.createPost({
            channel_id: channel.id,
            root_id: rootPost.id,
            message,
        });

        // * Verify the reply triggers a desktop notification and unread-mention badge
        const notifications = await playwright.waitForNotification(receiverPage, 1, duration.ten_sec);
        expect(notifications.length).toBeGreaterThanOrEqual(1);
        const sidebarItem = app.lhs.channelList.channel(channel);
        await expect(sidebarItem.mentionBadgeText.locator).toBeVisible();

        // # Return to the test channel
        await sidebarItem.clickLink();

        // * Verify the exact reply text and reply-notification highlight
        await expect.poll(async () => (await app.center.postList.postKeys()).at(-1)).not.toBe(rootPost.id);
        const replyId = (await app.center.postList.postKeys()).at(-1)!;
        await expectReplyNotification(app.center.postList.post({id: replyId}), message);
    }

    /**
     * @objective Verify replies trigger notifications for the user who started the thread when reply notifications are set to threads they start.
     */
    test('MM-T552 Trigger notifications on messages in threads that I start', {tag: '@notifications'}, async () => {
        // # Start a thread and receive a reply while viewing another channel
        await verifyStartedThreadNotification('This is a reply to the root post');

        // * Verify the reply produces all expected notification indicators
    });

    /**
     * @objective Verify replies trigger notifications for the user who started the thread when reply notifications are set to threads they start or participate in.
     */
    test(
        'MM-T553 Trigger notifications on messages in reply threads that I start or participate in - start thread',
        {tag: '@notifications'},
        async () => {
            // # Start a thread and receive a reply while viewing another channel
            await verifyStartedThreadNotification('This is a reply to the root post');

            // * Verify the reply produces all expected notification indicators
        },
    );

    /**
     * @objective Verify replies trigger notifications for a user who participated in a thread started by another user.
     */
    test(
        'MM-T554 Trigger notifications on messages in reply threads that I start or participate in - participate in',
        {tag: '@notifications'},
        async ({pw}) => {
            // # Start a thread as the sender
            const rootPost = await senderClient.createPost({
                channel_id: channel.id,
                message: 'a root message by some other user',
            });

            // # Open the thread and post a reply as the receiver to participate in it
            const receiverRootPost = app.center.postList.post(rootPost);
            await receiverRootPost.locator.hover();
            await receiverRootPost.menu.clickReplyButton();
            await expect(app.rhs.postCreate.messageTextbox.locator).toBeVisible();
            const receiverReplyResponse = waitForApi(receiverPage, Api.CreatePost);
            await app.rhs.postCreate.fillMessageTextbox('this is a reply from the receiver');
            await app.rhs.postCreate.clickSendButton();
            const receiverReply = await receiverReplyResponse;

            // * Verify the receiver's reply appears in the thread
            await expect(app.rhs.thread.post(receiverReply).messageText.locator).toContainText(
                'this is a reply from the receiver',
            );

            // # Move to Town Square, clear captured notifications, and post another reply as the sender
            await goToTownSquare();
            await pw.clearCapturedNotifications(receiverPage);
            const message = 'This is a reply by sender';
            const senderReply = await senderClient.createPost({
                channel_id: channel.id,
                root_id: rootPost.id,
                message,
            });

            // * Verify the reply triggers a desktop notification and unread-mention badge
            const notifications = await pw.waitForNotification(receiverPage, 1, duration.ten_sec);
            expect(notifications.length).toBeGreaterThanOrEqual(1);
            const sidebarItem = app.lhs.channelList.channel(channel);
            await expect(sidebarItem.mentionBadgeText.locator).toBeVisible();

            // # Return to the test channel
            await sidebarItem.clickLink();

            // * Verify the exact reply text and reply-notification highlight in the thread
            await expectReplyNotification(app.rhs.thread.post(senderReply), message);
        },
    );
});

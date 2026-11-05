// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {expect, test, type App, type PlaywrightExtended} from '@mattermost/playwright-lib';

import {expectIndicator, expectScheduledPost, expectSidebarCount, pickTime, scheduleMessage} from './support';

// Written on the generated page objects: the composers and their send options' schedule menu, the date/time dialog,
// the scheduled-post indicator, the sidebar's scheduled count, the drafts and scheduled posts pages (rows by draft and
// by scheduled post, their actions, and the send-now and delete dialogs), and the post lists.

test.beforeEach(async ({pw}) => {
    // Ensure license but skip test if no license which is required for "Scheduled Drafts"
    await pw.ensureLicense();
    await pw.skipIfNoLicense();
});

/** Logs the user in on a channel (town square unless given), waiting for the app to be up. */
async function open(pw: PlaywrightExtended, user: UserProfile, team: Team, channel = 'town-square') {
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel, path: channel.startsWith('@') ? 'messages' : 'channels'});
    return app;
}

/** The text of a post list's last post. */
async function lastPostText(list: App['center']['postList'] | App['rhs']['thread']) {
    const id = (await list.postKeys()).at(-1);
    return id ? list.post({id}).locator.textContent() : '';
}

/** Sends a scheduled post now from its row, confirming the dialog. */
async function sendNow(post: Awaited<ReturnType<typeof expectScheduledPost>>) {
    await post.locator.hover();
    const modal = await post.clickSendNowButton();
    await expect(modal.confirmButton.locator).toBeVisible();
    await modal.clickConfirmButton();
    await expect(modal.confirmButton.locator).not.toBeVisible();
}

/** Checks no scheduled post is left: the page's empty state, and no counts on the tab or in the sidebar. */
async function expectNoneScheduled(app: App) {
    await expect(app.noResults.locator).toBeVisible();
    await expect(app.drafts.tabs.scheduledCountText.locator).not.toBeVisible();
    await expect(app.lhs.drafts.scheduledPostBadgeText.locator).not.toBeVisible();
}

/**
 * @objective Verify the ability to create a scheduled message from a channel.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test.fixme(
    'MM-T5643_1 creates scheduled message from channel and posts at scheduled time',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        // Set test timeout to 4 mins to wait for the scheduled message to be sent
        // which is expected within 2 mins.
        test.setTimeout(pw.duration.four_min);

        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a scheduled message with short delay
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 0, 1);

        // * Verify scheduled post indicator shows correct date and time
        await expectIndicator(app.center.postCreate.scheduledPostIndicator, scheduled);

        // * Verify scheduled post badge in left sidebar shows count of 1
        await expectSidebarCount(app, 1);

        // # Navigate to scheduled posts page via "See all" link
        await app.center.postCreate.scheduledPostIndicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Return to the channels page
        await app.page.goBack();

        // * Verify scheduled message was posted successfully
        await expect
            .poll(() => lastPostText(app.center.postList), {timeout: pw.duration.two_min})
            .toContain(draftMessage);

        // * Verify scheduled indicators are removed after posting
        await expect(app.center.postCreate.scheduledPostIndicator.locator).not.toBeVisible();
        await expect(app.lhs.drafts.scheduledPostBadgeText.locator).not.toBeVisible();
    },
);

/**
 * @objective Verify that a weekly recurring scheduled message does not pin the channel indicator above the composer.
 *
 * @precondition
 * A test server with valid license and the RecurringScheduledPosts feature flag enabled
 */
test(
    'creates weekly recurring scheduled message from channel without showing the channel indicator',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        await pw.ensureFeatureFlag('RecurringScheduledPosts', true);

        const draftMessage = `Weekly Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a weekly recurring scheduled message for tomorrow
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 1, 0, true);

        // * Verify scheduled post badge appears with count of 1
        await expectSidebarCount(app, 1);

        // * Verify the channel indicator stays hidden since every scheduled post is recurring
        await expect(app.center.postCreate.scheduledPostIndicator.locator).not.toBeVisible();

        // # Navigate to scheduled posts page
        await app.scheduledPostsPage.goto({team});

        // * Verify scheduled post appears with recurring weekly details
        const scheduledPost = await expectScheduledPost(app, {
            message: draftMessage,
            ...scheduled,
            count: 1,
            repeatWeekly: true,
        });

        // * Verify one-time send now control is not available for recurring scheduled posts
        await scheduledPost.locator.hover();
        await expect(scheduledPost.rescheduleButton.locator).toBeVisible();
        await expect(scheduledPost.sendNowButton.locator).toHaveCount(0);
    },
);

/**
 * @objective Verify the ability to create a scheduled message in a thread.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5643_6 creates scheduled message in thread and posts in thread conversation',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        const draftMessage = `Scheduled Threaded Message ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a root message in the channel
        await app.center.postCreate.fillMessageTextbox('Root Message');
        await app.center.postCreate.clickSendButton();
        await expect.poll(() => lastPostText(app.center.postList)).toContain('Root Message');

        // # Start a thread by replying to the message
        const root = app.center.postList.post({id: (await app.center.postList.postKeys()).at(-1)!});
        await root.locator.hover();
        await root.menu.clickReplyButton();
        const {postCreate, thread} = app.rhs;
        await expect(postCreate.messageTextbox.locator).toBeVisible();
        await postCreate.fillMessageTextbox('Replying to a thread');
        await postCreate.clickSendButton();
        await expect.poll(async () => (await thread.postKeys()).length).toBe(2);

        // # Create a scheduled message within the thread
        const scheduled = await scheduleMessage(app, postCreate, draftMessage, 1);

        // * Verify scheduled post indicator shows correct date and time
        await expectIndicator(postCreate.scheduledPostIndicator, scheduled);

        // # Navigate to scheduled posts page using indicator link
        await postCreate.scheduledPostIndicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        const scheduledPost = await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Send the scheduled message immediately
        await sendNow(scheduledPost);

        // * Verify message is posted in the thread
        await expect(postCreate.messageTextbox.locator).toBeVisible();
        await expect.poll(() => lastPostText(thread)).toContain(draftMessage);

        // * Verify all scheduled message indicators are removed
        await expect(postCreate.scheduledPostIndicator.locator).not.toBeVisible();
        await expect(app.lhs.drafts.scheduledPostBadgeText.locator).not.toBeVisible();

        // * And the scheduled posts page is empty
        await app.scheduledPostsPage.goto({team});
        await expectNoneScheduled(app);
    },
);

/**
 * @objective Verify the ability to reschedule a scheduled message.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5644_2 reschedules message to a future date from scheduled posts page',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a scheduled message for tomorrow
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 1);

        // * Verify scheduled message indicator shows correct date and time
        await expectIndicator(app.center.postCreate.scheduledPostIndicator, scheduled);

        // * Verify scheduled post badge appears with count of 1
        await expectSidebarCount(app, 1);

        // # Navigate to scheduled posts page via indicator link
        await app.center.postCreate.scheduledPostIndicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        const scheduledPost = await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Reschedule the message to a different date (2 days from now)
        await scheduledPost.locator.hover();
        const rescheduled = await pickTime(await scheduledPost.clickRescheduleButton(), 2);

        // # Return to channel page
        await app.channelsPage.goto({team, channel: 'town-square'});

        // * Verify indicator shows the updated scheduled time
        await expectIndicator(app.center.postCreate.scheduledPostIndicator, rescheduled);
    },
);

/**
 * @objective Verify rescheduling a weekly recurring scheduled message keeps its weekly recurrence.
 *
 * @precondition
 * A test server with valid license and the RecurringScheduledPosts feature flag enabled
 */
test(
    'reschedules weekly recurring scheduled message from scheduled posts page and keeps weekly recurrence',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        await pw.ensureFeatureFlag('RecurringScheduledPosts', true);

        const draftMessage = `Weekly Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a weekly recurring scheduled message for tomorrow
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 1, 0, true);

        // # Navigate to scheduled posts page
        await app.scheduledPostsPage.goto({team});

        // * Verify scheduled post appears with recurring weekly details
        let scheduledPost = await expectScheduledPost(app, {
            message: draftMessage,
            ...scheduled,
            count: 1,
            repeatWeekly: true,
        });

        // # Open the reschedule modal for the recurring scheduled message
        await scheduledPost.locator.hover();
        const modal = await scheduledPost.clickRescheduleButton();

        // * Verify the weekly recurrence option remains selected in the reschedule modal
        await expect(modal.repeatWeeklyCheckbox.locator).toBeChecked();

        // # Reschedule the recurring message to a different future date
        const rescheduled = await pickTime(modal, 2);

        // * Verify the rescheduled post still appears as a weekly recurring message
        scheduledPost = await expectScheduledPost(app, {
            message: draftMessage,
            ...rescheduled,
            count: 1,
            repeatWeekly: true,
        });
        await scheduledPost.locator.hover();
        await expect(scheduledPost.rescheduleButton.locator).toBeVisible();
        await expect(scheduledPost.sendNowButton.locator).toHaveCount(0);

        // # Return to channel page
        await app.channelsPage.goto({team, channel: 'town-square'});

        // * Verify the channel indicator stays hidden since every scheduled post is recurring
        await expectSidebarCount(app, 1);
        await expect(app.center.postCreate.scheduledPostIndicator.locator).not.toBeVisible();
    },
);

/**
 * @objective Verify the ability to delete a scheduled message.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5645 deletes scheduled message from scheduled posts page and removes all indicators',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a scheduled message for tomorrow
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 1);

        // * Verify scheduled message indicator shows correct date and time
        await expectIndicator(app.center.postCreate.scheduledPostIndicator, scheduled);

        // # Navigate to scheduled posts page via indicator link
        await app.center.postCreate.scheduledPostIndicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        const scheduledPost = await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Delete the scheduled message, confirming in the modal
        await scheduledPost.locator.hover();
        const modal = await scheduledPost.clickDeleteButton();
        await expect(modal.confirmButton.locator).toBeVisible();
        await modal.clickConfirmButton();

        // * Verify the scheduled message is removed and no longer appears
        await expect(scheduledPost.locator).toHaveCount(0);
        await expectNoneScheduled(app);
    },
);

/**
 * @objective Verify the ability to send a scheduled message immediately.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5643_9 sends scheduled message immediately from scheduled posts page',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team, townSquareUrl} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a scheduled message for tomorrow
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 1);

        // * Verify scheduled message indicator shows correct date and time
        await expectIndicator(app.center.postCreate.scheduledPostIndicator, scheduled);

        // # Navigate to scheduled posts page via indicator link
        await app.center.postCreate.scheduledPostIndicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        const scheduledPost = await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Send the scheduled message immediately instead of waiting
        await sendNow(scheduledPost);

        // * Verify page redirects to the channel
        await expect(app.page).toHavePath(townSquareUrl);

        // * Verify message was posted in the channel
        await expect.poll(() => lastPostText(app.center.postList)).toContain(draftMessage);

        // * Verify scheduled indicators are removed
        await expect(app.center.postCreate.scheduledPostIndicator.locator).not.toBeVisible();
        await expect(app.lhs.drafts.scheduledPostBadgeText.locator).not.toBeVisible();
    },
);

/**
 * @objective Verify the ability to create a scheduled message from a direct message (DM).
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5643_3 creates scheduled message from DM channel and posts at scheduled time',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test setup with main user and create a second user
        const {user, team, adminClient} = await pw.initSetup();
        const otherUser = await adminClient.createUser(await pw.random.user(), '', '');

        // # Login as first user and navigate to DM channel with second user
        const app = await open(pw, user, team, `@${otherUser.username}`);

        // # Create a scheduled message for tomorrow in the DM
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 1);

        // * Verify the indicator: outside the other user's working hours it only counts scheduled messages, linking
        // * them; otherwise it shows the date and time
        const indicator = app.center.postCreate.scheduledPostIndicator;
        await expect(indicator.seeAllLink.locator).toBeVisible();
        if (pw.isOutsideRemoteUserHour(otherUser.timezone)) {
            await expect(indicator.locator).toContainText('You have one scheduled message.');
        } else {
            await expectIndicator(indicator, scheduled);
        }

        // # Open the scheduled posts page from the indicator
        await indicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        const scheduledPost = await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Send the scheduled message immediately
        await sendNow(scheduledPost);

        // * Verify page redirects to the DM channel
        await expect(app.page).toHavePath(`/${team.name}/messages/@${otherUser.username}`);

        // * Verify the message was posted, and the indicators are gone
        await expect.poll(() => lastPostText(app.center.postList)).toContain(draftMessage);
        await expect(indicator.locator).not.toBeVisible();
        await expect(app.lhs.drafts.scheduledPostBadgeText.locator).not.toBeVisible();
    },
);

/**
 * @objective Verify the ability to convert a draft to a scheduled message.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5648 converts draft message to scheduled message from drafts page',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Write a message in the composer without sending, leaving it as a draft
        await app.center.postCreate.fillMessageTextbox(draftMessage);

        // # Navigate to drafts page
        await app.draftsPage.goto({team});

        // * Verify the draft is there, counted on the tab
        const {list, tabs} = app.drafts;
        await expect(tabs.draftsCountText.locator).toHaveText('1');
        await expect(list.draftItems).toHaveCount(1);
        const draft = list.draft((await list.draftKeys())[0]);
        await expect(draft.message.locator).toContainText(draftMessage);

        // # Schedule the draft from its row
        await draft.locator.hover();
        const scheduled = await pickTime(await draft.clickRescheduleButton(), 2);

        // # Navigate to scheduled posts page
        await app.scheduledPostsPage.goto({team});

        // * Verify the draft was converted to a scheduled post
        await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});
    },
);

/**
 * @objective Verify the ability to edit a scheduled message.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5644_1 edits scheduled message content while preserving scheduled time',
    {tag: '@scheduled_messages'},
    async ({pw}) => {
        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team, townSquareUrl} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a scheduled message for 2 days from now
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 2);

        // * Verify scheduled message indicator and sidebar badge
        await expectIndicator(app.center.postCreate.scheduledPostIndicator, scheduled);
        await expectSidebarCount(app, 1);

        // # Navigate to scheduled posts page via indicator link
        await app.center.postCreate.scheduledPostIndicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        const scheduledPost = await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Edit the scheduled message content and save
        await scheduledPost.locator.hover();
        await scheduledPost.clickEditButton();
        const updatedText = 'updated text';
        await scheduledPost.fillEditorTextbox(updatedText);
        await scheduledPost.editor.clickSaveButton();

        // * Verify the content changed and the scheduled time didn't
        await expect(scheduledPost.message.locator).toContainText(updatedText);
        await expect(scheduledPost.header.timeText.locator).toContainText(scheduled.selectedTime);

        // # Send the scheduled message immediately
        await sendNow(scheduledPost);

        // * Verify page redirects to the channel, the indicators are gone and the updated message was posted
        await expect(app.page).toHavePath(townSquareUrl);
        await expect(app.center.postCreate.scheduledPostIndicator.locator).not.toBeVisible();
        await expect(app.lhs.drafts.scheduledPostBadgeText.locator).not.toBeVisible();
        await expect.poll(() => lastPostText(app.center.postList)).toContain(updatedText);
    },
);

/**
 * @objective Verify the ability to copy a scheduled message's text.
 *
 * @precondition
 * A test server with valid license to support scheduled message features
 */
test(
    'MM-T5650 copies scheduled message text to clipboard for reuse',
    {tag: '@scheduled_messages'},
    async ({pw, browserName}) => {
        test.skip(browserName === 'firefox', 'Test not supported in Firefox');

        const draftMessage = `Scheduled Draft ${pw.random.id()}`;

        // # Initialize test user, login and navigate to a channel
        const {user, team} = await pw.initSetup();
        const app = await open(pw, user, team);

        // # Create a scheduled message for tomorrow
        const scheduled = await scheduleMessage(app, app.center.postCreate, draftMessage, 1);

        // * Verify scheduled post badge appears with count of 1
        await expectSidebarCount(app, 1);

        // # Navigate to scheduled posts page via indicator link
        await app.center.postCreate.scheduledPostIndicator.clickSeeAllLink();

        // * Verify scheduled post appears with correct information
        const scheduledPost = await expectScheduledPost(app, {message: draftMessage, ...scheduled, count: 1});

        // # Copy the scheduled message text
        await scheduledPost.locator.hover();
        await scheduledPost.clickCopyTextButton();

        // # Return to the channel and paste into the message box
        await app.page.goBack();
        const textbox = app.center.postCreate.messageTextbox.locator;
        await textbox.focus();
        await app.page.keyboard.down('ControlOrMeta');
        await app.page.keyboard.press('V');
        await app.page.keyboard.up('ControlOrMeta');

        // * Verify the pasted content matches the scheduled message
        await expect(textbox).toHaveText(draftMessage);
    },
);

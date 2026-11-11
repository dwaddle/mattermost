// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getAsset} from '@/asset';
import {expect, test, type App} from '@mattermost/playwright-lib';

/**
 * Opens the channel switcher with Ctrl/Cmd+K, searches, and opens the result keyed by one of `keys`. The shortcut is
 * pressed in the message box, which also waits for the app to be up (a generated `goto` returns on page load).
 */
async function switchTo(app: App, search: string, ...keys: string[]) {
    await app.center.postCreate.messageTextbox.press('ControlOrMeta+K');
    await app.quickSwitchModal.searchTextbox.fill(search);
    const {suggestions} = app.quickSwitchModal;
    const result = keys.map((key) => suggestions.item(key).locator).reduce((a, b) => a.or(b));
    await result.click();
}

/**
 * @objective Verify the Ctrl/Cmd+K quick switcher can find and open a direct message, a group message,
 * and a public channel.
 */
test(
    'MM-T1247 finds and opens a direct message, group message, and channel with Ctrl/Cmd+K',
    {tag: '@keyboard_shortcuts'},
    async ({pw}) => {
        const {adminClient, team, user, townSquare} = await pw.initSetup();
        const [member1, member2] = await adminClient.createUsers(team.id, 2, 'switch');

        // # Create a direct message, a group message, and a public channel for the user
        const dm = await adminClient.createDirectChannel([user.id, member1.id]);
        await pw.postAs(member1, {channel_id: dm.id, message: 'dm hello'});
        const gm = await adminClient.createGroupChannel([user.id, member1.id, member2.id]);
        await pw.postAs(member2, {channel_id: gm.id, message: 'gm hello'});
        const publicChannel = await adminClient.createPublicChannel(team.id, `Switcher ${pw.random.id()}`);
        await adminClient.addToChannel(user.id, publicChannel.id);

        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});
        const title = app.channelHeader.openMenuButton.locator;

        // # Open the quick switcher and open the direct message with member1 (a direct message's result is keyed by
        // its channel id once the app has loaded the channel, and by the other user's id before that)
        await switchTo(app, member1.username, dm.id, member1.id);

        // * Verify the direct message with member1 is opened
        await expect(page).toHaveURL(new RegExp(`/messages/@${member1.username}$`));
        await expect(title).toContainText(member1.username);

        // # Open the quick switcher and open the group message
        await switchTo(app, member2.username, gm.id);

        // * Verify the group message (containing both members) is opened
        await expect(page).toHaveURL(new RegExp(`/messages/${gm.name}$`));
        await expect(title).toContainText(member1.username);
        await expect(title).toContainText(member2.username);

        // # Open the quick switcher and open the public channel
        await switchTo(app, publicChannel.display_name, publicChannel.id);

        // * Verify the public channel is opened
        await expect(title).toContainText(publicChannel.display_name);
    },
);

/**
 * @objective Verify that pressing Shift+Up in the textbox in center channel opens the thread for the last post in RHS
 * and correctly focuses the reply textbox, even when there are large messages with attachments from other users.
 */
test(
    'MM-T1275 Keyboard shortcuts Shift+Up on center textbox opens the last post in the RHS and correctly focuses the reply textbox',
    {tag: '@keyboard_shortcuts'},
    async ({pw}, testInfo) => {
        const ROOT_MESSAGE = 'The root message for testing Shift+Up keyboard shortcut';
        const NUMBER_OF_REPLIES = 10;
        const ATTACHMENT_FILES = ['mattermost.png', 'sample_text_file.txt', 'archive.zip'];

        test.skip(testInfo.project.name === 'ipad', 'Skipping test on iPad');

        // # Initialize setup with admin and user, and have the admin post the root message
        const {adminUser, adminClient, user, team, townSquare} = await pw.initSetup();
        const root = await adminClient.createPost({channel_id: townSquare.id, message: ROOT_MESSAGE});

        // # Log in as admin, open the thread and post a series of long replies
        const {app: adminApp, page: adminPage} = await pw.testBrowser.login(adminUser);
        await adminApp.channelsPage.goto({team, channel: townSquare});
        const rootPost = adminApp.center.postList.post(root);
        await rootPost.locator.hover();
        await rootPost.menu.clickReplyButton();
        const rhsComposer = adminApp.rhs.postCreate;
        await expect(rhsComposer.messageTextbox.locator).toBeVisible();

        for (let i = 1; i <= NUMBER_OF_REPLIES; i++) {
            await rhsComposer.fillMessageTextbox(`Random replies number ${i}`.repeat(40));
            await rhsComposer.clickSendButton();
            await expect(rhsComposer.messageTextbox.locator).toHaveValue('');
        }

        // # Then post replies with attachments
        for (const file of ATTACHMENT_FILES) {
            const fileChooser = adminPage.waitForEvent('filechooser');
            await rhsComposer.clickAttachButton();
            await (await fileChooser).setFiles(getAsset(file));
            await expect(rhsComposer.filePreviews.fileItems).toHaveCount(1);
            await rhsComposer.fillMessageTextbox(`Random replies number with attachment: ${file}`);
            await rhsComposer.clickSendButton();
            await expect(rhsComposer.filePreviews.fileItems).toHaveCount(0);
        }
        await expect
            .poll(async () => (await adminApp.rhs.thread.postKeys()).length)
            .toBe(1 + NUMBER_OF_REPLIES + ATTACHMENT_FILES.length);

        // # Admin closes the RHS
        await adminApp.rhs.thread.header.clickCloseButton();

        // # Log in as regular user and bring focus to the post textbox in center channel
        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});
        const centerTextbox = app.center.postCreate.messageTextbox.locator;
        await centerTextbox.focus();

        // * Verify the post textbox in center channel is focused
        await expect(centerTextbox).toBeFocused();

        // # Press Shift+Up to open the latest thread in the channel in the RHS
        await page.keyboard.press('Shift+ArrowUp');

        // * Verify the correct thread (admin's root message) is shown in RHS
        await expect(app.rhs.thread.post(root).messageText.locator).toHaveText(ROOT_MESSAGE);

        // * Verify RHS reply textbox is focused
        const rhsTextbox = app.rhs.postCreate.messageTextbox.locator;
        await expect(rhsTextbox).toBeFocused();

        // # Type a message to verify the textbox can receive input immediately
        await page.keyboard.type('Reply typed after Shift+Up');

        // * Verify the message was typed into the RHS textbox
        await expect(rhsTextbox).toHaveValue('Reply typed after Shift+Up');

        // # Clear the input and close RHS
        await rhsTextbox.clear();
        await app.rhs.thread.header.clickCloseButton();
    },
);

/**
 * @objective Verify Ctrl/Cmd+. opens and closes the right-hand sidebar.
 */
test(
    'MM-T4692 opens and closes the right sidebar with the keyboard shortcut',
    {tag: '@keyboard_shortcuts'},
    async ({pw}) => {
        const {user, userClient, team, townSquare} = await pw.initSetup();
        const message = 'this post is from today';
        const created = await userClient.createPost({channel_id: townSquare.id, message});

        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Open the post's reply thread in the right sidebar
        const post = app.center.postList.post(created);
        await post.locator.hover();
        await post.menu.clickReplyButton();
        const rhsRoot = app.rhs.thread.post(created).messageText.locator;
        await expect(rhsRoot).toHaveText(message);

        // # Press the toggle shortcut to close the right sidebar
        await page.keyboard.press('ControlOrMeta+.');

        // * Verify the right sidebar is closed
        await expect(rhsRoot).not.toBeVisible();

        // # Press the toggle shortcut again to reopen the right sidebar
        await page.keyboard.press('ControlOrMeta+.');

        // * Verify the right sidebar is shown again with the reply thread
        await expect(rhsRoot).toHaveText(message);
    },
);

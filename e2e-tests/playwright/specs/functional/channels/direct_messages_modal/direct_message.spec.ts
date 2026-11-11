// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {Api, expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a user can open a self direct message, post a message, and does not receive a desktop notification.
 *
 * Written on the generated page objects: the Direct Messages picker's rows by user id, the channel header and the composer.
 */
test('MM-T457 Self direct message', {tag: '@direct_messages'}, async ({pw}) => {
    const {team, user, userClient} = await pw.initSetup();
    const townSquare = await userClient.getChannelByName(team.id, 'town-square');

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    await pw.stubNotification(page, 'granted');

    // # Open the Direct Messages picker and choose yourself
    const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickOpenDirectMessageMenuItem();
    await modal.list.searchCombobox.locator.fill(user.username);
    await modal.list.user(user).locator.click();

    // * Verify the self direct message opens
    await expect(app.channelHeader.openMenuButton.locator).toContainText(`${user.username} (you)`);

    // # Post a message
    await app.center.postCreate.fillMessageTextbox('todo list for today: 1,2,3');
    await app.center.postCreate.sendButton.commit({wait: Api.CreatePost});
    await expect(app.center.postCreate.messageTextbox.locator).toHaveValue('');

    // * Verify no desktop notification is shown for your own message
    expect(await page.evaluate(() => window.getNotifications())).toHaveLength(0);
});

/**
 * @objective Verify a direct message channel header supports multiline text and displays the saved text in its popover.
 *
 * Written on the generated page objects: the header's add button returns the edit dialog, and the header text and its
 * popover.
 */
test('MM-T458 Edit direct message channel header', {tag: '@direct_messages'}, async ({pw}) => {
    const {adminClient, team, user} = await pw.initSetup();
    const [otherUser] = await adminClient.createUsers(team.id, 1, 'dm-header');
    const channel = await adminClient.createDirectChannel([user.id, otherUser.id]);
    const {client: otherUserClient} = await pw.makeClient(otherUser);
    await otherUserClient.createPost({channel_id: channel.id, message: 'Hello'});

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, path: 'messages', channel: `@${otherUser.username}`});

    // # Add a multiline header, saving with Enter
    const expectedHeader = 'This is a line\n\nThis is another line';
    // (the add button shows only while the pointer is over the channel header)
    await app.channelHeader.openMenuButton.locator.hover();
    const editor = await app.channelHeader.clickAddHeaderButton();
    await editor.headerTextbox.locator.fill(expectedHeader);
    await editor.headerTextbox.locator.press('Enter');
    await expect(editor.headerTextbox.locator).not.toBeVisible();

    // * Verify the header shows the text and its popover is closed
    const description = app.channelHeader.description.locator;
    await expect(description).toContainText('This is a line');
    await page.mouse.move(0, 0);
    const popover = app.channelHeader.descriptionPopoverTooltip.locator;
    await expect(popover).not.toBeVisible();

    // # Hover the header text
    await app.channelHeader.description.hover();

    // * Verify the popover shows the full multiline header
    await expect(popover).toBeVisible();
    await expect.poll(async () => popover.evaluate((el: HTMLElement) => el.innerText)).toBe(expectedHeader);
});

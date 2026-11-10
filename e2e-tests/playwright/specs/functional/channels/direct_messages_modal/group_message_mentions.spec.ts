// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {getChannelSlugFromUrl} from './helpers';

/**
 * @objective Verify a mention posted in a group message creates an unread mention for the mentioned participant.
 *
 * Written on the generated page objects: the group message's sidebar link and mention badge, keyed by channel name.
 */
test('MM-T469 Create a group message and post a mention for another user', async ({pw}) => {
    const {adminClient, team, user, offTopic} = await pw.initSetup();
    const [sender, secondParticipant] = await adminClient.createUsers(team.id, 2, 'gm-mention');
    const gmChannel = await adminClient.createGroupChannel([user.id, sender.id, secondParticipant.id]);
    const offTopic = await adminClient.getChannelByName(team.id, 'off-topic');

    // # View another channel, then have a participant mention the test user in the GM
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: offTopic});
    await pw.stubNotification(page, 'granted');
    await pw.postAs(sender, {
        channel_id: gmChannel.id,
        message: `@${user.username} Hello from GM`,
    });

    // * Verify a desktop notification fires for the mention
    const notifications = await pw.waitForNotification(page, 1);
    expect(notifications.length).toBeGreaterThanOrEqual(1);

    // * Verify the group message shows one unread mention (badge and the link's accessible name)
    const item = app.lhs.channelList.channel(gmChannel);
    await expect(item.mentionBadgeText.locator).toHaveText('1');
    await expect(item.link.locator).toHaveAccessibleName(/1 mention$/);
});

/**
 * @objective Verify that a group message can be created with a mention, closed, and then recreated with the same members.
 *
 * MM-T480 covers the same behavior as MM-T466 and is covered by this test.
 *
 * Written on the generated page objects: the Direct Messages picker's rows by user id, the posts by id, and the
 * group message's sidebar item and its menu, keyed by channel name.
 */
test(
    'MM-T466 MM-T480 creates a group message with a mention, closes it, and recreates it',
    {tag: '@direct_messages'},
    async ({pw}) => {
        // # Create the test user plus two more users on the team
        const {user, team, adminClient, townSquare} = await pw.initSetup();
        const [member1, member2] = await adminClient.createUsers(team.id, 2, 'gm');
        const townSquare = await adminClient.getChannelByName(team.id, 'town-square');

        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        const createGroupMessage = async () => {
            const modal = await (
                await app.lhs.header.clickOpenBrowseOrAddMenuButton()
            ).clickOpenDirectMessageMenuItem();
            for (const member of [member1, member2]) {
                await modal.list.searchCombobox.locator.fill(member.username);
                await modal.list.user(member).locator.click();
                await expect(modal.list.remove(member.id).locator).toBeVisible();
            }
            await modal.list.clickSaveButton();
            await expect(modal.list.saveButton.locator).not.toBeVisible();
        };

        // # Create a group message with the two members
        await createGroupMessage();
        await expect(page).toHaveURL(/\/messages\/[a-z0-9]{40}$/);
        const slug = getChannelSlugFromUrl(page);

        // # Post a message that mentions one of the members
        const token = `gm mention ${pw.random.id()}`;
        await app.center.postCreate.fillMessageTextbox(`@${member1.username} ${token}`);
        await app.center.postCreate.clickSendButton();
        await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
        const lastId = (await app.center.postList.postKeys()).at(-1)!;
        await expect(app.center.postList.post({id: lastId}).messageText.locator).toContainText(token);

        // # Close the group message conversation
        const item = app.lhs.channelList.channel({name: slug});
        await item.locator.hover();
        await (await item.clickOpenMenuButton()).clickLeaveMenuItem();
        await expect(item.locator).toHaveCount(0);

        // # Recreate the group message with the same members
        await createGroupMessage();

        // * Verify the same group message channel is reopened
        await expect(page).toHaveURL(new RegExp(`/messages/${slug}$`));
        await expect(item.locator).toBeVisible();
    },
);

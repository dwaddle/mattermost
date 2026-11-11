// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {UserProfile} from '@mattermost/types/users';

import {expect, formatMessage, Msg, test, type App} from '@mattermost/playwright-lib';

import {getChannelSlugFromUrl} from './helpers';

/**
 * @objective Verify the group message intro, sidebar label, and member count render for participants.
 */
test('MM-T465 Create a group message and show participant details', async ({pw}) => {
    const {adminClient, team, user, townSquare} = await pw.initSetup();
    const participants = await adminClient.createUsers(team.id, 2, 'gm-intro');
    // # Create a group message from the Direct Messages modal
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    await createGroupMessage(app, participants);
    const slug = getChannelSlugFromUrl(page);

    // * Verify the group message intro, participant avatars, sidebar label, and member count. The
    // sidebar label sorts the other participants' usernames with numeric-aware locale comparison
    // (digit runs compare by value, not by character code), so match that here rather than a plain
    // string sort.
    const sortedParticipants = [...participants].sort((a, b) =>
        a.username.localeCompare(b.username, undefined, {numeric: true}),
    );
    const intro = app.center.postList.channelIntro;
    await expect(intro.locator).toContainText(formatMessage(Msg.intro_messages.group_message).trim());
    await expect(intro.member.locator).toHaveCount(2);
    const title = app.channelHeader.openMenuButton.locator;
    await expect(title).toContainText(participants[0].username);
    await expect(title).toContainText(participants[1].username);
    const item = app.lhs.channelList.channel({name: slug});
    await expect(item.link.locator).toContainText(
        `${sortedParticipants[0].username}, ${sortedParticipants[1].username}`,
    );
    await expect(item.memberCountText.locator).toHaveText('2');

    // # Post a message so the group message persists in the sidebar
    await app.center.postCreate.fillMessageTextbox('Hi group');
    await app.center.postCreate.clickSendButton();

    // * Verify the message appears in the group message
    await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
    const lastId = (await app.center.postList.postKeys()).at(-1)!;
    await expect(app.center.postList.post({id: lastId}).messageText.locator).toHaveText('Hi group');
});

/**
 * @objective Verify that a group message lists its members and that adding another member creates a new group message.
 */
test(
    'MM-T467 adds a user to a group message to create a new group message',
    {tag: '@direct_messages'},
    async ({pw}) => {
        // # Create the test user plus three more users on the team
        const {user, team, adminClient, townSquare} = await pw.initSetup();
        const [member1, member2, member3] = await adminClient.createUsers(team.id, 3, 'gm');
        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        // # Create a group message with two members
        await createGroupMessage(app, [member1, member2]);
        const firstSlug = getChannelSlugFromUrl(page);

        // * Verify the group message lists both members in the header
        const title = app.channelHeader.openMenuButton.locator;
        await expect(title).toContainText(member1.username);
        await expect(title).toContainText(member2.username);

        // # Create a group message that adds a third member
        await createGroupMessage(app, [member1, member2, member3]);

        // * Verify a new, different group message channel is created that includes the added member
        await expect(title).toContainText(member3.username);
        const secondSlug = getChannelSlugFromUrl(page);
        expect(secondSlug).not.toBe(firstSlug);
    },
);

/** Picks the users in the Direct Messages modal (rows by user id) and opens the group message. */
async function createGroupMessage(app: App, users: Array<Pick<UserProfile, 'id' | 'username'>>) {
    const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickOpenDirectMessageMenuItem();
    for (const member of users) {
        await modal.list.searchCombobox.locator.fill(member.username);
        await modal.list.user(member).locator.click();
        await expect(modal.list.remove(member.id).locator).toBeVisible();
    }
    await modal.list.clickSaveButton();
    await expect(modal.list.saveButton.locator).not.toBeVisible();
    await expect(app.page).toHaveURL(/\/messages\/[a-z0-9]{40}$/);
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify adding a member to an existing group message starts a new conversation with every selected member and no message history.
 */
test('MM-T468 Group Messaging: Add member to existing GM', {tag: '@direct_messages'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const members = await adminClient.createUsers(team.id, 3, 'gm-member');
    const [newMember] = await adminClient.createUsers(team.id, 1, 'gm-new-member');
    const groupChannel = await userClient.createGroupChannel([user.id, ...members.map((member) => member.id)]);

    // # Give the existing group message some history
    type Draft = Parameters<typeof userClient.createPost>[0];
    const post = (message: string) => userClient.createPost({channel_id: groupChannel.id, message} as Draft);
    const history = [await post('some'), await post('historical'), await post('messages')];

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, path: 'messages', channel: groupChannel});
    await expect(app.center.postList.post(history[2]).locator).toBeVisible();

    // # Open the members panel and choose Add
    await (await app.channelHeader.clickOpenMenuButton()).clickMembersMenuItem();
    await app.rhs.channelMembers.clickAddButton();
    const picker = app.directMessagesModal.list;

    // * The dialog warns that this starts a new conversation, and every other member is already selected
    await expect(picker.noteText.locator).toContainText('This will start a new conversation');
    expect((await picker.removeKeys()).sort()).toEqual(members.map((member) => member.id).sort());

    // # Select another member and start the new group message
    await picker.searchCombobox.locator.fill(newMember.username);
    // the rows have no role yet (the a11y review will make them options), so their driver has no click()
    await picker.user(newMember).locator.click();
    await picker.clickSaveButton();

    // * The new conversation has the new member in its title, starts with the intro, and has none of the old posts
    await expect(app.channelHeader.openMenuButton.locator).toContainText(newMember.username);
    await expect(app.center.postList.channelIntro.locator).toContainText(
        'This is the start of your group message history with',
    );
    for (const post of history) {
        await expect(app.center.postList.post(post).locator).toHaveCount(0);
    }

    // # Open the new group message's members panel
    await (await app.channelHeader.clickOpenMenuButton()).clickMembersMenuItem();

    // * The new member and every original member are in the conversation
    await expect
        .poll(async () => (await app.rhs.channelMembers.memberKeys()).sort())
        .toEqual([user, ...members, newMember].map((member) => member.id).sort());
});

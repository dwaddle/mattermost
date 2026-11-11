// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, Api} from '@mattermost/playwright-lib';

/**
 * @objective Verify a custom user group can be archived, viewed under the archived filter, and restored.
 */
test('MM-T5584 views and unarchives a custom group', {tag: '@channels'}, async ({pw}) => {
    const {user, team, userClient, townSquare} = await pw.initSetup();

    // # Create a custom group owned by the user
    const groupName = `group${pw.random.id()}`.toLowerCase();
    const group = await userClient.createGroupWithUserIds({
        name: groupName,
        display_name: `Testing Group ${pw.random.id()}`,
        source: 'custom',
        allow_reference: true,
        user_ids: [user.id],
    });

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Open the User Groups modal from the product menu
    const productMenu = await app.globalHeader.clickProductMenuButton();
    let groups = await productMenu.clickUserGroupsMenuItem();
    await expect(groups.locator).toBeVisible();

    // # Find the group (a long-lived server lists many) and archive it
    await groups.fillSearchTextbox(group.display_name);
    let groupModal = await groups.group(group).clickButton();
    const actions = await groupModal.clickMenuButton();
    groups = await actions.clickArchiveMenuItem();

    // # Filter the list to archived groups and open the archived group
    const filter = await groups.clickFilterButton();
    await filter.clickArchivedMenuItem();
    await groups.fillSearchTextbox(group.display_name);
    groupModal = await groups.group(group).clickButton();

    // # Restore the group
    await groupModal.restoreButton.commit();

    // * The group is restored: member management is available again, and the server agrees
    await expect(groupModal.addPeopleButton.locator).toBeVisible();
    await expect.poll(async () => (await userClient.getGroup(group.id)).delete_at).toBe(0);
});

/**
 * @objective Verify a custom user group can be invited to a channel with the /invite slash command, adding
 * the group's members to the channel.
 */
test('MM-T5598 invites a custom group to a channel', {tag: '@channels'}, async ({pw}) => {
    const {user, team, userClient, adminClient, townSquare} = await pw.initSetup();

    // # Create a second team member and a custom group containing both users
    const [member] = await adminClient.createUsers(team.id, 1, 'member');
    const groupName = `group${pw.random.id()}`.toLowerCase();
    await userClient.createGroupWithUserIds({
        name: groupName,
        display_name: `Group ${pw.random.id()}`,
        source: 'custom',
        allow_reference: true,
        user_ids: [user.id, member.id],
    });

    const {channelsPage, app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Create a new channel
    const channelName = `Group Channel ${pw.random.id()}`;
    await channelsPage.newChannel(channelName, 'O');
    await channelsPage.centerView.header.toHaveTitle(channelName);

    // # Invite the custom group to the channel with the slash command
    await channelsPage.centerView.postCreate.writeMessage(`/invite @${groupName} `);
    await channelsPage.centerView.postCreate.sendMessage();

    // * Verify the group's member was added to the channel. The system message and the ephemeral
    // * "already in the channel" reply for the inviter arrive in either order, so don't rely on the last post.
    const addedPost = await channelsPage.centerView.getPostByText('added to the channel');
    await expect(addedPost.container).toContainText(member.username);
});

/**
 * @objective Verify a custom group searched by its mention in the "Add people" dialog lists its members
 * and adds all of them to the channel, even after the User Groups list has been opened.
 */
test('MM-70052 adds every member of a custom group searched by its mention', {tag: '@channels'}, async ({pw}) => {
    const {user, team, userClient, adminClient, townSquare} = await pw.initSetup();

    // # Create a custom group made up of team members other than the logged in user
    const members = await adminClient.createUsers(team.id, 3, 'member');
    const groupName = `group${pw.random.id()}`.toLowerCase();
    const group = await userClient.createGroupWithUserIds({
        name: groupName,
        display_name: `Group ${pw.random.id()}`,
        source: 'custom',
        allow_reference: true,
        user_ids: members.map((member) => member.id),
    });

    const {app, page, channelsPage} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});

    // # Create a channel that none of the group's members belong to
    const channelName = `Group Channel ${pw.random.id()}`;
    await channelsPage.newChannel(channelName, 'O');
    await channelsPage.centerView.header.toHaveTitle(channelName);

    // # Browse the User Groups list, which refreshes the locally cached groups
    await channelsPage.globalHeader.openUserGroups();
    await channelsPage.userGroupsModal.toBeVisible();
    await expect(channelsPage.userGroupsModal.getGroup(group.display_name)).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(channelsPage.userGroupsModal.container).not.toBeVisible();

    // # Open the Add people dialog for the channel
    const channelMenu = await channelsPage.openChannelMenu();
    await channelMenu.members.click();
    await channelsPage.sidebarRight.toBeVisible();
    await channelsPage.sidebarRight.addMembersButton.click();
    const addPeopleToChannelModal = channelsPage.getAddPeopleToChannelModal();
    await addPeopleToChannelModal.toBeVisible();

    // # Search for the group by its mention
    await addPeopleToChannelModal.search(`@${groupName}`);

    // * Verify the group is offered with its current member count
    const addGroupMembers = addPeopleToChannelModal.container.getByText(`Add ${members.length} people`);
    await expect(addGroupMembers).toBeVisible();

    // # Hover the shortcut. Its tooltip renders in a portal outside the dialog, where the open modal
    // # keeps it out of the accessibility tree, and tooltips carry no testids yet; while it shows, it is the
    // # only place the members' usernames appear.
    await addGroupMembers.hover();

    // * Verify the tooltip names every member of the group
    for (const member of members) {
        await expect(page.getByText(member.username)).toBeVisible();
    }

    // # Select the whole group and add it to the channel
    await addGroupMembers.click();
    await app.channelInviteModal.users.saveButton.commit({wait: Api.AddChannelMember});

    // * Verify every member of the group joined the channel
    await channelsPage.centerView.waitUntilLastPostContains('added to the channel');
    await expect(channelsPage.sidebarRight.container).toContainText(`${members.length + 1} members`);
    for (const member of members) {
        await expect(channelsPage.sidebarRight.container).toContainText(member.username);
    }
});

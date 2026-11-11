// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';

import {expect, test, type App, DefaultChannel} from '@mattermost/playwright-lib';

/** The channel's last post, once the server has one. */
async function lastPost(client: Client4, channelId: string) {
    const posts = await client.getPosts(channelId);
    return posts.posts[posts.order[0]];
}

/** Sends a draft row from the Drafts page through its confirmation dialog. */
async function sendDraft(app: App, key: string) {
    const row = app.drafts.list.draft(key);
    await row.locator.hover();
    await expect(row.sendButton.locator).toBeVisible();
    const confirm = await row.clickSendButton();
    await expect(confirm.confirmButton.locator).toBeVisible();
    await confirm.confirmButton.click();
}

test.describe('sending a draft from the Drafts panel', () => {
    /**
     * @objective Verify a channel draft sent from the global Drafts panel is deleted
     * server-side, so switching teams away and back does not restore it.
     *
     * @precondition
     * The user belongs to two teams, so a team switch refetches drafts from the server.
     */
    test('channel draft does not come back after switching teams', {tag: '@messaging'}, async ({pw}) => {
        const draftMessage = `panel-send-${pw.random.id()}`;

        const {user, team: team1, adminClient, userClient} = await pw.initSetup();
        const team2 = await pw.createNewTeam(adminClient, {
            name: 'team',
            displayName: 'Team',
            type: 'O',
            unique: true,
        });
        await adminClient.addToTeam(team2.id, user.id);
        const [townSquare, offTopic] = await Promise.all([
            userClient.getChannelByName(team1.id, DefaultChannel.TownSquare),
            userClient.getChannelByName(team1.id, DefaultChannel.OffTopic),
        ]);

        const {app} = await pw.testBrowser.login(user);
        const composer = app.center.postCreate;
        const title = app.channelHeader.openMenuButton.locator;
        const channels = app.lhs.channelList;

        // # Type a draft in Town Square without sending it
        await app.channelsPage.goto({team: team1, channel: townSquare});
        await composer.fillMessageTextbox(draftMessage);

        // # Switch channels so the draft is synced to the server
        await channels.channel(offTopic).clickLink();
        await expect(title).toContainText(offTopic.display_name);

        // * The draft is registered in the LHS
        await expect(app.lhs.draftsLink.locator).toBeVisible();
        await expect(app.lhs.drafts.draftBadgeText.locator).toHaveText('1');

        // # Send the draft from the Drafts panel
        await app.lhs.clickDraftsLink();
        await expect(app.drafts.tabs.draftsCountText.locator).toBeVisible();
        await expect.poll(async () => (await app.drafts.list.draftKeys()).length).toBe(1);
        await sendDraft(app, townSquare.id);

        // * The draft was posted to Town Square and left the Drafts panel
        await expect(title).toContainText(townSquare.display_name);
        await expect.poll(async () => (await lastPost(userClient, townSquare.id))?.message).toBe(draftMessage);
        const sent = await lastPost(userClient, townSquare.id);
        await expect(app.center.postList.post(sent).messageText.locator).toContainText(draftMessage);
        await expect(app.lhs.draftsLink.locator).not.toBeVisible();

        // * No draft is left on the server for a team switch or a reload to restore
        // (the endpoint answers null, not [], once the user has no drafts)
        await expect.poll(async () => (await userClient.getUserDrafts(team1.id))?.length ?? 0).toBe(0);

        // # Switch to the other team and back, which refetches drafts from the server
        await app.teamSidebar.team(team2.id).locator.click();
        await expect(app.lhs.draftsLink.locator).not.toBeVisible();
        await app.teamSidebar.team(team1.id).locator.click();
        await expect(composer.messageTextbox.locator).toBeVisible();

        // * The sent draft did not reappear
        await expect(app.lhs.draftsLink.locator).not.toBeVisible();
        await expect(channels.channel(townSquare).draftText.locator).not.toBeAttached();

        // * The Drafts page itself is empty, and the message is still posted
        await app.draftsPage.goto({team: team1});
        await expect(app.noResults.locator).toBeVisible();
        await expect(app.drafts.list.draftItems).toHaveCount(0);

        await app.channelsPage.goto({team: team1, channel: townSquare});
        await expect(app.center.postList.post(sent).messageText.locator).toContainText(draftMessage);
    });

    /**
     * @objective Verify a thread draft sent from the global Drafts panel is deleted
     * server-side under its root id, not just cleared from local storage.
     */
    test('thread draft is deleted server-side under its root id', {tag: '@messaging'}, async ({pw}) => {
        const rootMessage = `thread-root-${pw.random.id()}`;
        const replyDraft = `thread-reply-draft-${pw.random.id()}`;

        const {user, team, userClient, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(user);

        await app.channelsPage.goto({team, channel: townSquare});

        // # Start a thread and leave a reply draft in it
        await app.center.postCreate.fillMessageTextbox(rootMessage);
        await app.center.postCreate.clickSendButton();
        await expect.poll(async () => (await lastPost(userClient, townSquare.id))?.message).toBe(rootMessage);
        const root = await lastPost(userClient, townSquare.id);
        const rootPost = app.center.postList.post(root);
        await rootPost.locator.hover();
        await rootPost.menu.clickReplyButton();
        await app.rhs.postCreate.fillMessageTextbox(replyDraft);

        // # Close the thread so the reply draft is synced to the server
        await app.rhs.thread.header.clickCloseButton();
        await expect(app.lhs.draftsLink.locator).toBeVisible();

        // # Send the thread draft from the Drafts panel
        await app.lhs.clickDraftsLink();
        await expect(app.drafts.tabs.draftsCountText.locator).toBeVisible();
        await expect.poll(async () => (await app.drafts.list.draftKeys()).length).toBe(1);
        await sendDraft(app, root.id);

        // * The reply was posted into the thread, which opens in the RHS, and the draft is
        // gone from the Drafts page that sending it left open
        await expect.poll(async () => (await lastPost(userClient, townSquare.id))?.message).toBe(replyDraft);
        const reply = await lastPost(userClient, townSquare.id);
        expect(reply.root_id).toBe(root.id);
        await expect(app.rhs.thread.post(reply).messageText.locator).toContainText(replyDraft);
        await expect(app.noResults.locator).toBeVisible();
        await expect(app.drafts.list.draftItems).toHaveCount(0);
        await expect(app.lhs.drafts.draftBadgeText.locator).not.toBeAttached();

        // * No draft is left on the server under the thread's root id. Only this can catch
        // the bug: the panel and the badge above read local storage, which createPost clears
        // optimistically whether or not the server copy was deleted.
        await expect.poll(async () => (await userClient.getUserDrafts(team.id))?.length ?? 0).toBe(0);
    });
});

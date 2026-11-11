// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, type App} from '@mattermost/playwright-lib';

/** Sends the composer's text with the Send button (a trailing space has already dismissed any autocomplete). */
async function send(app: App, text: string) {
    await app.center.postCreate.fillMessageTextbox(text);
    await app.center.postCreate.clickSendButton();
}

test.describe('draft channel switch', () => {
    /**
     * @objective Verify Ctrl/Cmd+K restores the destination draft and routes
     * messages to the selected channel.
     */
    test('quick switcher keeps drafts and messages scoped to their channels', {tag: '@messaging'}, async ({pw}) => {
        const {team, user, townSquare, offTopic} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: offTopic});
        const input = app.center.postCreate.messageTextbox.locator;
        const title = app.channelHeader.openMenuButton.locator;

        const originDraft = `quick-switch-origin-${pw.random.id()}`;
        const destinationMessage = `quick-switch-destination-${pw.random.id()}`;

        // # Leave a draft in Off-Topic
        await app.center.postCreate.fillMessageTextbox(originDraft);

        // # Switch to Town Square using Ctrl/Cmd+K
        await input.press('ControlOrMeta+K');
        await app.quickSwitchModal.searchTextbox.fill('town');
        await app.quickSwitchModal.suggestions.item(townSquare.id).locator.click();
        await expect(title).toContainText(townSquare.display_name);

        // * Town Square did not inherit the Off-Topic draft
        await expect(input).toHaveValue('');

        // # Send a destination-owned message
        await send(app, destinationMessage);
        await expect.poll(async () => (await app.center.postList.postKeys()).length).toBeGreaterThan(0);
        const lastId = (await app.center.postList.postKeys()).at(-1)!;
        await expect(app.center.postList.post({id: lastId}).messageText.locator).toHaveText(destinationMessage);

        // # Return to Off-Topic using Ctrl/Cmd+K
        await input.press('ControlOrMeta+K');
        await app.quickSwitchModal.searchTextbox.fill('off');
        await app.quickSwitchModal.suggestions.item(offTopic.id).locator.click();
        await expect(title).toContainText(offTopic.display_name);

        // * The origin draft was restored and the destination message was not misrouted
        await expect(input).toHaveValue(originDraft);
        await expect(app.center.postList.locator).not.toContainText(destinationMessage);
    });

    /**
     * @objective Verify sending /msg to an existing DM clears the origin
     * channel draft instead of leaving it behind for later restoration.
     *
     * @precondition
     * The DM channel already exists so the redirect uses the fast path with no
     * createDirectChannel round trip.
     */
    test(
        'sending /msg to an existing DM clears the origin draft instead of restoring it',
        {tag: '@slash_commands'},
        async ({pw}) => {
            const {adminClient, userClient, team, user, offTopic} = await pw.initSetup();
            const [target] = await adminClient.createUsers(team.id, 1, 'draft-msg');
            await userClient.createDirectChannel([user.id, target.id]);
            const {app, page} = await pw.testBrowser.login(user);
            await app.channelsPage.goto({team, channel: offTopic});
            const input = app.center.postCreate.messageTextbox.locator;
            const title = app.channelHeader.openMenuButton.locator;

            // Trailing space dismisses the @mention autocomplete.
            await send(app, `/msg @${target.username} `);
            await expect(title).toContainText(target.username);
            await expect(page).toHaveURL(new RegExp(`/${team.name}/messages/@${target.username}`));

            // * Destination composer is empty — it did not adopt the /msg text
            await expect(input).toHaveValue('');

            // # Return to Off-Topic
            await app.lhs.channelList.channel(offTopic).clickLink();
            await expect(title).toContainText(offTopic.display_name);

            // * Origin draft was cleared by the submit, not left behind as /msg
            await expect(input).toHaveValue('');
            await expect(app.lhs.channelList.channel(offTopic).draftText.locator).toHaveCount(0);
        },
    );

    /**
     * @objective Verify a message typed after a settled /msg redirect to an
     * existing DM posts to the DM, not the origin channel.
     *
     * @precondition
     * The DM channel already exists so the redirect uses the fast path with no
     * createDirectChannel round trip.
     */
    test(
        'posts a later message to the DM rather than the origin channel after /msg',
        {tag: '@slash_commands'},
        async ({pw}) => {
            const {adminClient, userClient, team, user, offTopic} = await pw.initSetup();
            const [target] = await adminClient.createUsers(team.id, 1, 'stale-dm');
            const dmChannel = await userClient.createDirectChannel([user.id, target.id]);
            await userClient.createPost({
                channel_id: dmChannel.id,
                message: 'seeding the existing DM',
            } as Parameters<typeof userClient.createPost>[0]);
            const {app, page} = await pw.testBrowser.login(user);
            await app.channelsPage.goto({team, channel: offTopic});
            const title = app.channelHeader.openMenuButton.locator;

            // Trailing space dismisses the @mention autocomplete.
            await send(app, `/msg @${target.username} `);
            await expect(title).toContainText(target.username);
            await expect(page).toHaveURL(new RegExp(`/${team.name}/messages/@${target.username}`));

            const message = `stale-draft-${pw.random.id()}`;
            await send(app, message);

            // * Follow-up message appears in the DM
            await expect
                .poll(async () => {
                    const lastId = (await app.center.postList.postKeys()).at(-1);
                    return lastId ? app.center.postList.post({id: lastId}).messageText.locator.textContent() : '';
                })
                .toBe(message);

            // # Return to Off-Topic
            await app.lhs.channelList.channel(offTopic).clickLink();
            await expect(title).toContainText(offTopic.display_name);

            // * Follow-up message did not post to the origin channel
            await expect(app.center.postList.locator).not.toContainText(message);
        },
    );
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that releasing a mouse drag that started inside a modal but ends outside it does not
 * close the modal, while a genuine click outside the modal does close it.
 *
 * Written on the generated page objects.
 */
test('MM-T841 keeps a modal open when a drag is released outside it', {tag: '@channel_settings'}, async ({pw}) => {
    const {user, team} = await pw.initSetup();
    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: 'off-topic'});

    // # Open the Channel Settings modal
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await expect(settings.locator).toBeVisible();

    // # Press the mouse down inside the modal, drag to outside the modal, then release
    const box = await settings.locator.boundingBox();
    if (!box) {
        throw new Error('Channel Settings modal has no bounding box');
    }
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(5, 5);
    await page.mouse.up();

    // * The modal stays open because the press started inside it
    await expect(settings.locator).toBeVisible();

    // # Click outside the modal (both press and release on the backdrop)
    await page.mouse.click(5, 5);

    // * The modal closes
    await expect(settings.locator).not.toBeVisible();
});

/**
 * @objective Verify that cancelling the create-channel modal does not create or join a channel, and that
 * leaving a channel removes it from the sidebar.
 *
 * Written on the generated page objects: sidebar rows are keyed by channel name.
 */
test(
    'MM-T861 cancelling the create channel modal does not join a channel',
    {tag: '@channel_settings'},
    async ({pw}) => {
        const {user, team, userClient} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: 'town-square'});
        const myChannelNames = async () => (await userClient.getMyChannels(team.id)).map((c) => c.display_name);

        // # Create a new public channel via the modal
        const createdName = `Random ${pw.random.id()}`;
        let dialog = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
        await dialog.fillNameTextbox(createdName);
        await dialog.clickConfirmButton();

        // * The new channel opens
        await expect(app.channelHeader.openMenuButton.locator).toContainText(createdName);
        const created = (await userClient.getMyChannels(team.id)).find((c) => c.display_name === createdName)!;
        await expect(app.lhs.channelList.channel(created).locator).toBeVisible();

        // # Leave the channel from the channel header menu
        await (await app.channelHeader.clickOpenMenuButton()).clickLeaveChannelMenuItem();

        // * The user lands in Town Square, and the channel is gone from the sidebar and the user's channels
        await expect(app.channelHeader.openMenuButton.locator).toContainText('Town Square');
        await expect(app.lhs.channelList.channel(created).locator).toHaveCount(0);
        await expect.poll(myChannelNames).not.toContain(createdName);

        // # Open the create-channel modal, enter a name, and cancel without creating
        const cancelledName = `AB ${pw.random.id()}`;
        dialog = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
        await dialog.fillNameTextbox(cancelledName);
        await dialog.clickCancelButton();

        // * The modal closes, and no channel was created or joined
        await expect(dialog.locator).not.toBeVisible();
        expect(await myChannelNames()).not.toContain(cancelledName);
        await expect(app.channelHeader.openMenuButton.locator).toContainText('Town Square');
    },
);

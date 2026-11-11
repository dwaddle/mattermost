// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';

import {expect, getFileFromAsset, openChannel, test} from '@mattermost/playwright-lib';

import {closeRootModal, DEMO, expectRootModal, uploadFromYourComputer} from './support';

/** Posts sample-file.demo (the extension the plugin's file menu entry and preview apply to) in the channel. */
async function postDemoFile(client: Client4, channelId: string): Promise<{postId: string; fileId: string}> {
    const formData = new FormData();
    formData.set('files', getFileFromAsset('sample-file.demo'), 'sample-file.demo');
    formData.set('channel_id', channelId);
    const result = await client.uploadFile(formData);
    const fileId = result.file_infos[0].id;
    const post = await client.createPost({channel_id: channelId, message: '', file_ids: [fileId]});
    return {postId: post.id, fileId};
}

test('should show "Upload using Demo Plugin" entry in attachment menu and open Root Modal', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: townSquare});

    // # Open the attachment menu (the plugin's upload method turns the button into a menu)
    const composer = app.center.postCreate;
    await composer.clickAttachButton();

    // * Both upload entries show
    await expect(composer.attachMenu.yourComputerLink.locator).toHaveText('Your computer');
    await expect(composer.attachMenu.plugin(DEMO).locator).toHaveText('Upload using Demo Plugin');

    // # Choose the plugin's entry: it opens the Root Modal
    await composer.attachMenu.plugin(DEMO).click();
    await expectRootModal(app);
    await closeRootModal(app);
});

test('should show Demo Plugin entry in file attachment dropdown for .demo files and open Root Modal', async ({pw}) => {
    // # Set up the demo plugin and post a .demo file in a new channel
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const channel = await adminClient.createChannel(
        pw.random.channel({teamId: team.id, name: 'demo-file-test', displayName: 'Demo File Test'}),
    );
    await adminClient.addToChannel(user.id, channel.id);
    const {postId, fileId} = await postDemoFile(userClient, channel.id);
    const app = await openChannel(pw, user, {team, channel});

    // # Open the file's "..." menu
    const card = app.center.postList.post({id: postId}).attachments.fileCard({id: fileId});
    await card.locator.hover();
    const menu = await card.clickMoreActionsButton();

    // * It offers the public link and the plugin's entry
    await expect(menu.publicLinkButton.locator).toBeVisible();
    await expect(menu.plugin(DEMO).locator).toHaveText('Demo Plugin');

    // # Choose the plugin's entry: it opens the Root Modal
    await menu.plugin(DEMO).click();
    await expectRootModal(app);
    await closeRootModal(app);
});

test('should render custom preview for .demo files', async ({pw}) => {
    // # Set up the demo plugin and post a .demo file in a new channel
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const channel = await adminClient.createChannel(
        pw.random.channel({teamId: team.id, name: 'demo-preview-test', displayName: 'Demo Preview Test'}),
    );
    await adminClient.addToChannel(user.id, channel.id);
    const {postId, fileId} = await postDemoFile(userClient, channel.id);
    const app = await openChannel(pw, user, {team, channel});

    // # Open the file's preview from its thumbnail
    await app.center.postList.post({id: postId}).attachments.fileCard({id: fileId}).thumbnailLink.click();

    // * The plugin's preview renders the file's name and its own Close button
    const preview = app.plugins.comMattermostDemoPlugin.filePreview;
    await expect(preview.nameText.locator).toHaveText('sample-file.demo');
    await expect(preview.closeButton.locator).toBeVisible();

    // * The modal's own header still names the channel and offers the download
    const header = app.filePreviewModal.header;
    await expect(header.channelText.locator).toHaveText(`Shared in ~${channel.display_name}`);
    await expect(header.downloadLink.locator).toBeVisible();

    // # Close it with the plugin's button
    await preview.clickCloseButton();

    // * The preview is gone
    await expect(preview.nameText.locator).not.toBeVisible();
    await expect(header.channelText.locator).not.toBeVisible();
});

test('should upload a file via "Your computer" from the demo plugin attachment submenu', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: townSquare});
    const composer = app.center.postCreate;

    // # Upload a file through the attachment menu's "Your computer"
    await uploadFromYourComputer(app, 'sample_text_file.txt');

    // * The composer shows the file
    await expect(composer.filePreviews.fileItems).toHaveCount(1);
    await expect(composer.filePreviews.fileItems).toContainText('sample_text_file.txt');

    // # Send it with a message
    await composer.fillMessageTextbox('file upload test');
    await composer.clickSendButton();

    // * The posted message carries the file
    const {postList} = app.center;
    const lastPost = async () => postList.post({id: (await postList.postKeys()).at(-1)!});
    await expect.poll(async () => (await lastPost()).getMessageText()).toBe('file upload test');
    const post = await lastPost();
    await expect(post.attachments.fileCardItems).toContainText('sample_text_file.txt');
});

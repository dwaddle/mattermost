// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';

import {expect, getFileFromAsset, openChannel, test} from '@mattermost/playwright-lib';

import {sendDemoSlashCommand} from '../../helpers';

import {postContaining, sendCommand} from './support';

/**
 * Uploads a batch of files to the channel via API and posts them as a single message.
 * Using the API avoids the demo plugin's custom file upload menu which intercepts
 * the attachment button in the UI.
 */
async function uploadAndPostFiles(client: Client4, channelId: string, filenames: string[]): Promise<void> {
    const fileIds: string[] = [];

    for (const filename of filenames) {
        const file = getFileFromAsset(filename);
        const formData = new FormData();
        formData.set('files', file, filename);
        formData.set('channel_id', channelId);
        const result = await client.uploadFile(formData);
        fileIds.push(result.file_infos[0].id);
    }

    await client.createPost({
        channel_id: channelId,
        message: '',
        file_ids: fileIds,
    });
}

test('should list uploaded files with running total via /list_files command', async ({pw}) => {
    // # Setup
    const {adminClient, user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();

    // # Create a dedicated channel for file isolation
    const channel = pw.random.channel({
        teamId: team.id,
        name: 'list-files-test',
        displayName: 'List Files Test',
    });
    const createdChannel = await adminClient.createChannel(channel);
    await adminClient.addToChannel(user.id, createdChannel.id);

    // # Log in and open the channel
    const app = await openChannel(pw, user, {team, channel: 'list-files-test'});

    // * /list_files with no files: the bot replies with none
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/list_files'));
    await postContaining(app, 'Last 0 Files uploaded to this channel');

    // # Upload a first batch of 2 files via the API (the demo plugin's own attachment menu intercepts the UI's)
    await uploadAndPostFiles(adminClient, createdChannel.id, ['sample_text_file.txt', 'mattermost-icon_128x128.png']);

    // * /list_files counts 2 and names both
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/list_files'));
    const {post: response2} = await postContaining(app, 'Last 2 Files uploaded to this channel');
    await expect(response2.body.locator).toContainText('mattermost-icon_128x128.png');
    await expect(response2.body.locator).toContainText('sample_text_file.txt');

    // # Upload a second batch of 2 more files
    await uploadAndPostFiles(adminClient, createdChannel.id, ['mattermost.png', 'archive.zip']);

    // * /list_files counts 4 and names them all
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/list_files'));
    const {post: response4} = await postContaining(app, 'Last 4 Files uploaded to this channel');
    for (const name of ['mattermost.png', 'archive.zip', 'mattermost-icon_128x128.png', 'sample_text_file.txt']) {
        await expect(response4.body.locator).toContainText(name);
    }
});

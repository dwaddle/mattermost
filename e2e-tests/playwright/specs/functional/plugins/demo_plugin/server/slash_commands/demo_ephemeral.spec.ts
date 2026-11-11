// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannel, test} from '@mattermost/playwright-lib';

import {sendDemoSlashCommand} from '../../helpers';

import {actionNamed, postContaining, sendCommand} from './support';

test('should send ephemeral post with Update and Delete actions via /ephemeral command', async ({pw}) => {
    // # Setup
    const {user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();

    // # Log in and open Town Square (away from the plugin's own ephemeral messages)
    const app = await openChannel(pw, user, {team, channel: townSquare});

    // # Send /ephemeral
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/ephemeral'));
    const {post} = await postContaining(app, 'test ephemeral actions');

    // * The ephemeral post shows with its Update and Delete actions
    await expect(post.locator).toContainText('(Only visible to you)');
    await expect(post.body.locator).toContainText('test ephemeral actions');
    await expect(actionNamed(post, 'Update')).toBeVisible();
    await expect(actionNamed(post, 'Delete')).toBeVisible();

    // # Update: the text and the button's label change
    await actionNamed(post, 'Update').click();
    const {post: updated} = await postContaining(app, 'updated ephemeral action');
    await expect(actionNamed(updated, 'Update 1')).toBeVisible();
    await expect(actionNamed(updated, 'Delete')).toBeVisible();

    // # Delete: the content and the buttons go
    await actionNamed(updated, 'Delete').click();
    const {post: deleted} = await postContaining(app, '(message deleted)');
    await expect(actionNamed(deleted, 'Update 1')).toHaveCount(0);
    await expect(actionNamed(deleted, 'Delete')).toHaveCount(0);

    // # Send /ephemeral_override
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/ephemeral_override'));

    // * The override ephemeral post shows
    const {post: override} = await postContaining(app, 'This is a demo of overriding an ephemeral post.');
    await expect(override.locator).toContainText('(Only visible to you)');
});

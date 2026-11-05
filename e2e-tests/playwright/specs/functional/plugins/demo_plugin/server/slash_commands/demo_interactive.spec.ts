// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {openChannel} from '../../../../channels/burn_on_read/support';
import {sendDemoSlashCommand} from '../../helpers';

import {actionNamed, postContaining, sendCommand} from './support';

test('should post interactive button and respond with click attribution via /interactive command', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {adminClient, user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, team, 'town-square');

    // # Send /interactive
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/interactive'));
    const {id, post} = await postContaining(app, 'Test interactive button');

    // # Click its Interactive Button
    const button = actionNamed(post, 'Interactive Button');
    await expect(button).toBeVisible();
    await button.click();

    // # The plugin replies in a thread: open it
    await expect(post.threadFooter.replyButton.locator).toContainText(/\d+ repl(y|ies)/);
    await post.threadFooter.clickReplyButton();

    // * The reply credits the user who clicked, with the action's payload
    let replyId = '';
    await expect
        .poll(async () => {
            replyId = (await adminClient.getPostThread(id)).order.find((p) => p !== id) ?? '';
            return replyId;
        })
        .not.toBe('');
    const reply = app.rhs.thread.post({id: replyId}).body.locator;
    await expect(reply).toContainText(`${user.username} clicked an interactive button.`);
    await expect(reply).toContainText(new RegExp(`"user_name"\\s*:\\s*"${user.username}"`));
    await expect(reply).toContainText('"type": "button"');
});

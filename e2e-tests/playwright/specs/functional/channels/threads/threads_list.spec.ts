// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify that users can navigate through threads list using keyboard arrow keys
 */
test('Should be able to change threads with arrow keys', {tag: ['@smoke']}, async ({pw}, testInfo) => {
    test.skip(testInfo.project.name === 'ipad');

    const {team, user, userClient} = await pw.initSetup();
    const channel = await userClient.getChannelByName(team.id, 'town-square');

    // # Start three threads, oldest first, and leave a draft reply in the middle one
    const startThread = async (message: string) => {
        const root = await userClient.createPost({channel_id: channel.id, message} as any);
        const reply = await userClient.createPost({
            channel_id: channel.id,
            root_id: root.id,
            message: `${message} reply`,
        } as any);
        return {root, reply};
    };
    const aaa = await startThread('aaa');
    const bbb = await startThread('bbb');
    const ccc = await startThread('ccc');
    await userClient.upsertDraft(
        {user_id: user.id, channel_id: channel.id, root_id: bbb.root.id, message: 'bbb second reply'} as any,
        '',
    );

    // # Open the threads list
    const {app, page} = await pw.testBrowser.login(user);
    await app.threadsPage.goto({team});

    // * The draft is there, the threads are listed newest first, and none is open
    await expect(app.lhs.draftsLink.locator).toBeVisible();
    await expect(app.threads.list.threadList).toHaveKeys([ccc.root.id, bbb.root.id, aaa.root.id]);
    await expect(page).toHaveURL(generated.ThreadsPage.path({team}));

    const toBeOpen = async (thread: typeof aaa) => {
        await expect(page).toHaveURL(generated.ThreadsPage.path({team, threadIdentifier: thread.root.id}));
        await expect(app.rhs.thread.post(thread.reply).locator).toBeVisible();
    };

    // # Press the down arrow: the newest thread opens
    await page.keyboard.press('ArrowDown');
    await toBeOpen(ccc);

    // # Press the down arrow again: the next one opens
    await page.keyboard.press('ArrowDown');
    await toBeOpen(bbb);

    // # Focus the list and press the down arrow: the oldest thread opens
    await app.threads.list.locator.focus();
    await page.keyboard.press('ArrowDown');
    await toBeOpen(aaa);

    // # Press the up arrow twice: back up the list
    await page.keyboard.press('ArrowUp');
    await toBeOpen(bbb);
    await page.keyboard.press('ArrowUp');
    await toBeOpen(ccc);
});

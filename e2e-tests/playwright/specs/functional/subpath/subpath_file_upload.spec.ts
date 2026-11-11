// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {getAsset} from '@/asset';
import {test, expect, requireSubpathServer} from '@mattermost/playwright-lib';

test.describe('Subpath - file upload', {tag: '@subpath'}, () => {
    test.beforeAll(() => {
        requireSubpathServer();
    });

    /**
     * @objective Verify a file attachment uploads and previews correctly under the subpath.
     */
    test('uploads and previews a file attachment under the subpath', async ({pw}) => {
        const {user, team, userClient, townSquare} = await pw.initSetup();
        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});
        const {postCreate, postList} = app.center;

        // # Post a message with an image attachment
        const message = `Subpath file upload ${pw.random.id()}`;
        const chooser = app.page.waitForEvent('filechooser');
        await postCreate.clickAttachButton();
        await (await chooser).setFiles(getAsset('small-image.png'));
        await expect(postCreate.filePreviews.fileItems).toHaveCount(1);
        await postCreate.fillMessageTextbox(message);
        await postCreate.clickSendButton();

        // * Verify the attachment thumbnail loads
        await expect
            .poll(async () => {
                const posts = await userClient.getPosts(townSquare.id);
                return posts.posts[posts.order[0]]?.message;
            })
            .toBe(message);
        const posts = await userClient.getPosts(townSquare.id);
        const sent = posts.posts[posts.order[0]];
        const thumbnail = postList.post(sent).attachments.image({id: sent.file_ids![0]}).pictureImg.locator;
        await expect(thumbnail).toBeVisible();
        await expect(thumbnail).toHaveAccessibleName(/file thumbnail/i);
    });
});

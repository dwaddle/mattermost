// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify an emoji-only message renders as a jumbo (large) emoji, and that leading/trailing
 * whitespace around the emoji does not stop it from rendering jumbo.
 *
 * Written on the generated page objects: each post by id, and the emoji inside it through `Markdown`
 * constructed on that post.
 */
test(
    'MM-T2179 renders emoji-only messages as jumbo even when surrounded by whitespace',
    {tag: '@messaging'},
    async ({pw}) => {
        const {user, team, userClient} = await pw.initSetup();
        const channel = await userClient.getChannelByName(team.id, 'off-topic');

        // # Post the emoji inline with text, then on its own surrounded by whitespace
        const inline = await userClient.createPost({channel_id: channel.id, message: 'jumbo test :taco:'});
        const alone = await userClient.createPost({channel_id: channel.id, message: ' :taco: '});

        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel});
        const tacoIn = (post: typeof inline) =>
            new generated.Markdown(page, 'markdown', app.center.postList.post(post).locator).emoji('taco').locator;
        const height = async (post: typeof inline) => {
            await expect(tacoIn(post)).toBeVisible();
            return (await tacoIn(post).boundingBox())!.height;
        };

        // * The whitespace-surrounded emoji-only message renders larger (jumbo) than the inline emoji
        expect(await height(alone)).toBeGreaterThan(await height(inline));
    },
);

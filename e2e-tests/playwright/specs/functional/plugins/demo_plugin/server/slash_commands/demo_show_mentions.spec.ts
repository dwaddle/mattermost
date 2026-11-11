// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannel, test, DefaultChannel} from '@mattermost/playwright-lib';

import {markdownOf, postContaining, sendCommand} from './support';

test('should parse user and channel mentions from /show_mentions command text', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: townSquare});

    // # Send /show_mentions
    await sendCommand(app, '/show_mentions @sysadmin ~town-square');
    const {post: reply} = await postContaining(app, 'contains the following different mentions');

    // * The reply lists the user mention
    const body = reply.body.locator;
    await expect(body).toContainText('Mentions to users in the team');
    await expect(body).toContainText('User name');
    await expect(body).toContainText('@sysadmin');

    // * And the channel mention, linking to the channel
    await expect(body).toContainText('Mentions to public channels');
    await expect(body).toContainText('Channel name');
    const channelLink = markdownOf(app, reply).channelMention(DefaultChannel.TownSquare).locator;
    await expect(channelLink).toHaveText('~Town Square');
    await expect(channelLink).toHaveAttribute('href', /\/channels\/town-square$/);
});

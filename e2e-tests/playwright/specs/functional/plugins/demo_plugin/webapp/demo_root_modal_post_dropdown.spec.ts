// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {duration, test, type App} from '@mattermost/playwright-lib';

import {openChannel} from '../../../channels/burn_on_read/support';

import {closeRootModal, DEMO, expectRootModal} from './support';

/** Hovers the post and opens its actions menu (the apps icon, not "..."): plugins add their post actions there. */
async function openActionsMenu(app: App, postId: string) {
    const post = app.center.postList.post({id: postId});
    await post.locator.hover();
    await post.menu.clickActionsButton();
    return post.menu.actionsMenu;
}

test('should open Root Modal from post actions menu and all submenu items', async ({pw}) => {
    // # Set up the demo plugin, post a message and open Town Square
    const {adminClient, user, userClient, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const townSquare = await adminClient.getChannelByName(team.id, 'town-square');
    const post = await userClient.createPost({
        channel_id: townSquare.id,
        message: 'Test post for Root Modal validation',
    });
    const app = await openChannel(pw, user, team, 'town-square');
    const demo = app.plugins.comMattermostDemoPlugin;

    // # Click the plugin's top-level action
    let menu = await openActionsMenu(app, post.id);
    await menu.plugin(DEMO).locator.click({timeout: duration.ten_sec});

    // * The Root Modal opens, with no "Element clicked" line for a top-level action
    await expectRootModal(app);
    await closeRootModal(app);

    // # Each submenu item: hover "Submenu Example", then click the item
    for (const [item, label] of [
        [demo.postSubmenu.firstText, 'First Item'],
        [demo.postSubmenu.secondText, 'Second Item'],
        [demo.postSubmenu.thirdText, 'Third Item'],
    ] as const) {
        menu = await openActionsMenu(app, post.id);
        await menu.pluginSubmenu(DEMO).locator.hover();
        await item.locator.click({timeout: duration.ten_sec});

        // * The Root Modal names the item
        await expectRootModal(app, label);
        await closeRootModal(app);
    }
});

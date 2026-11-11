// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, settle, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a user can set a custom status with an expiry from the account menu, and clear it again.
 */
test('sets a custom status that clears after an hour, then clears it', {tag: '@custom_status'}, async ({pw}) => {
    const {team, user, userClient, townSquare: channel} = await pw.initSetup();
    const text = `In a meeting ${pw.random.id()}`;
    const customStatus = async () => {
        const me = await userClient.getMe();
        return me.props?.customStatus ? JSON.parse(me.props.customStatus) : null;
    };

    // # Log in and open the account menu's "Set a custom status"
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    const accountMenu = await app.globalHeader.clickOpenAccountMenuButton();
    const modal = await accountMenu.clickSetCustomStatusMenuItem();

    // # Type a status and choose to clear it after one hour
    await modal.fillTextTextbox(text);
    await modal.expiry.clickOpenButton();
    await modal.expiry.menu.oneHourButton.click();

    // # Set it
    await settle(modal.confirmButton, (b) => b.click());

    // * The server has the status, with the one-hour duration
    await expect.poll(customStatus).toMatchObject({text, duration: 'one_hour'});

    // # Open it again from the account menu and clear it
    const menu = await app.globalHeader.clickOpenAccountMenuButton();
    const edit = await menu.clickCustomStatusMenuItem();
    await expect(edit.textTextbox.locator).toHaveValue(text);
    await settle(edit.cancelButton, (b) => b.click());

    // * The server no longer has a custom status for the user
    await expect.poll(async () => (await customStatus())?.text ?? '').toBe('');
});

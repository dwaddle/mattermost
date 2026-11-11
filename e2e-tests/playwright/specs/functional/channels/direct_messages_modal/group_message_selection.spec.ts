// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify users can be added and removed while creating a group message.
 */
test('MM-T460 Add and remove users while creating new Group Message', {tag: '@direct_messages'}, async ({pw}) => {
    const {adminClient, team, user} = await pw.initSetup();
    const participants = await adminClient.createUsers(team.id, 3, 'gm-edit');

    // # Open the Direct Messages modal from the LHS "+" menu
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: 'town-square'});
    const addMenu = await app.lhs.header.clickOpenBrowseOrAddMenuButton();
    const modal = await addMenu.clickOpenDirectMessageMenuItem();
    const picker = modal.list;

    const select = async (participant: (typeof participants)[number]) => {
        await picker.searchCombobox.locator.fill(participant.username);
        // the rows have no role yet (the a11y review will make them options), so their driver has no click()
        await picker.user(participant).locator.click();
        await expect(picker.remove(participant.id).locator).toBeVisible();
    };

    // # Select two users
    await select(participants[0]);
    await select(participants[1]);

    // * Two users are selected, and the counter reflects it (a group message allows 7 people besides the current user)
    await expect(picker.removeItems).toHaveCount(2);
    await expect(picker.helpText.locator).toContainText('You can add 5 more people');

    // # Remove one user with its remove button
    await picker.remove(participants[1].id).click();

    // * The counter reflects the removal
    await expect(picker.remove(participants[1].id).locator).toHaveCount(0);
    await expect(picker.helpText.locator).toContainText('You can add 6 more people');

    // # Add a different user
    await select(participants[2]);

    // * The selection and the counter update again
    await expect(picker.removeItems).toHaveCount(2);
    await expect(picker.helpText.locator).toContainText('You can add 5 more people');

    // # Remove the last selected user with Backspace in the empty search box
    await picker.searchCombobox.locator.press('Backspace');

    // * The last user is removed, and the counter reflects it
    await expect(picker.remove(participants[2].id).locator).toHaveCount(0);
    await expect(picker.removeItems).toHaveCount(1);
    await expect(picker.helpText.locator).toContainText('You can add 6 more people');
});

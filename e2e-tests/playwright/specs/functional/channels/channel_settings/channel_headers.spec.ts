// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, openChannelSettings, postWith, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify a multi-line channel header is truncated in the header bar, that hovering it opens a
 * popover with the full header, that a markdown link in the header points to the correct URL, and that the
 * popover closes.
 */
test(
    'MM-T879 opens and closes the channel header popover with a working link',
    {tag: '@channel_settings'},
    async ({pw}) => {
        const {adminClient, team, user} = await pw.initSetup();
        const channel = await adminClient.createPublicChannel(team.id, `Header ${pw.random.id()}`);
        await adminClient.addToChannel(user.id, channel.id);

        const {app, page} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel});

        // # Set a multi-line channel header that contains a markdown link, via Channel Settings
        const header = ['Header text line one', '', '- Two', '- [Google](https://google.com/)', '- Four'].join('\n');
        const settings = await openChannelSettings(app, 'info');
        await settings.info.fillHeaderTextbox(header);
        await settings.savePanel.clickSaveButton();
        await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
        await settings.clickCloseButton();

        // * Verify the header bar shows the first line of the header
        const description = app.channelHeader.description.locator;
        await expect(description).toContainText('Header text line one');

        // # Hover the header text to open the popover
        await app.channelHeader.description.hover();

        // * Verify the popover opens with the full header and a link to the correct URL
        const popover = app.channelHeader.descriptionPopoverTooltip.locator;
        await expect(popover).toBeVisible();
        await expect(popover).toContainText('Four');
        const markdown = new generated.Markdown(page, 'markdown', popover);
        await expect(markdown.linkLink.locator).toHaveText('Google');
        await expect(markdown.linkLink.locator).toHaveAttribute('href', 'https://google.com/');

        // # Move the pointer away from the header to dismiss the popover
        await page.mouse.move(400, 500);

        // * Verify the popover closes
        await expect(popover).not.toBeVisible();
    },
);

/**
 * @objective Verify a channel header can be added from the "Set header" link in a new channel's intro,
 * that cancelling the modal makes no change, and that the saved header appears in the channel info.
 */
test('MM-T880 adds a channel header from the intro Set header link', {tag: '@channel_settings'}, async ({pw}) => {
    const {user, team, userClient, adminClient} = await pw.initSetup();

    // # Make sure the channel intro offers its action buttons instead of only the invite button
    await pw.ensureChannelIntroActions(adminClient);

    // # Create a new public channel so its intro (with the "Set header" link) is shown
    const channel = await userClient.createChannel(
        pw.random.channel({teamId: team.id, name: 'channel-header', displayName: 'channel header'}),
    );
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});
    await expect(app.channelHeader.openMenuButton.locator).toContainText(channel.display_name);

    // # Open the Edit Header modal from the intro and cancel without entering text
    const intro = app.center.postList.channelIntro;
    const cancelled = await intro.clickSetHeaderButton();
    await cancelled.clickCancelButton();
    await expect(cancelled.headerTextbox.locator).not.toBeVisible();

    // # Reopen the Edit Header modal and save a header
    const header = 'this is the channel header';
    const editor = await intro.clickSetHeaderButton();
    await editor.headerTextbox.fill(header);
    await editor.saveButton.commit();
    await expect(editor.headerTextbox.locator).not.toBeVisible();

    // * Verify the header-change system message is posted
    await postWith(app.center.postList, {text: `updated the channel header to: ${header}`});

    // # Open the channel info panel
    await app.channelHeader.clickInfoButton();

    // * Verify the saved header appears in the channel info panel
    await expect(app.rhs.channelInfo.about.header.locator).toContainText(header);
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, testConfig} from '@mattermost/playwright-lib';

import {createLinkBookmark, createLinkBookmarks} from './support';

/**
 * @objective Verify the bookmarks bar remains visible and usable with an announcement banner present.
 */
test('MM-T5609 displays the bookmarks bar correctly with an announcement banner', {tag: '@channels'}, async ({pw}) => {
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Banner ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const bookmark = await createLinkBookmark(
        userClient,
        channel.id,
        'Mattermost Community',
        'https://community.mattermost.com',
    );
    const bannerText = `Announcement ${pw.random.id()}`;

    // # Enable an announcement banner above a channel with a bookmark
    await adminClient.patchConfig({
        AnnouncementSettings: {
            EnableBanner: true,
            BannerText: bannerText,
        },
    } as any);

    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // * Both the announcement and the bookmark display correctly
    await expect(app.announcementBar.admin.messageText.locator).toHaveText(bannerText);
    await expect(app.channelBookmarks.bookmark(bookmark).openLink.locator).toHaveText('Mattermost Community');
});

/**
 * @objective Verify external bookmarks open in a new tab and internal bookmarks navigate within Mattermost.
 */
test('MM-T5611 opens external and internal bookmark links', {tag: '@channels'}, async ({pw}) => {
    // # Create external and internal link bookmarks
    const {adminClient, team, user, userClient} = await pw.initSetup();
    const channel = await adminClient.createPublicChannel(team.id, `Open ${pw.random.id()}`);
    await adminClient.addToChannel(user.id, channel.id);
    const external = await createLinkBookmark(userClient, channel.id, 'External site', 'https://example.com');
    const internal = await createLinkBookmark(
        userClient,
        channel.id,
        'Town Square',
        `${testConfig.baseURL}/${team.name}/channels/town-square`,
    );

    const {app, page} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel});

    // # Open the external bookmark
    const popupPromise = page.waitForEvent('popup');
    await app.channelBookmarks.bookmark(external).openLink.click();
    const popup = await popupPromise;

    // * It opens in a new tab
    await expect.poll(() => popup.url()).toContain('example.com');
    await popup.close();

    // # Open the internal bookmark
    await app.channelBookmarks.bookmark(internal).openLink.click();

    // * It navigates to Town Square in Mattermost
    await expect.poll(() => page.url()).toContain(`/${team.name}/channels/town-square`);
});

/**
 * @objective Verify bookmarks beyond the visible bar remain accessible through the overflow menu.
 */
test(
    'MM-T5612 provides overflow access when the bookmarks bar reaches its visible limit',
    {tag: '@channels'},
    async ({pw}) => {
        // # Create enough bookmarks to overflow the visible bar
        const {adminClient, team, user, userClient} = await pw.initSetup();
        const channel = await adminClient.createPublicChannel(team.id, `Overflow ${pw.random.id()}`);
        await adminClient.addToChannel(user.id, channel.id);
        const bookmarks = await createLinkBookmarks(userClient, channel.id, 12);
        const last = bookmarks[bookmarks.length - 1];

        const {app} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel});

        // * The last bookmark isn't in the bar, and the overflow menu exposes it
        await expect(app.channelBookmarks.bookmark(bookmarks[0]).locator).toBeVisible();
        await expect(app.channelBookmarks.bookmark(last).locator).toHaveCount(0);
        const overflow = await app.channelBookmarks.clickOpenMenuButton();
        await expect(overflow.bookmark(last).locator).toContainText('Bookmark 12');
    },
);

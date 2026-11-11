// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {
    type App,
    expect,
    generated,
    openChannelSettings,
    type PlaywrightExtended,
    postWith,
    test,
    duration,
    Msg,
} from '@mattermost/playwright-lib';

const EMOJI_SIZE = 16;

/** `77DD88` -> `rgb(119, 221, 136)`, as the browser reports a background color. */
function hexToRgb(hex: string) {
    const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16));
    return `rgb(${r}, ${g}, ${b})`;
}

/**
 * Logs in as an admin on an Enterprise Advanced server with the legacy banner editor, and opens a new public channel.
 * Skips the test when the license isn't Enterprise Advanced.
 */
async function openNewChannel(pw: PlaywrightExtended) {
    // This suite exercises the legacy AdvancedTextbox banner editor, which only
    // renders when ChannelAttributes is off.
    await pw.ensureFeatureFlag('ChannelAttributes', false);

    const {adminUser, adminClient, team} = await pw.initSetup();

    const license = await adminClient.getClientLicenseOld();
    test.skip(license.SkuShortName !== 'advanced', 'Skipping test - server does not have Enterprise Advanced license');

    const channel = await adminClient.createChannel(
        pw.random.channel({teamId: team.id, name: 'banner', displayName: 'Banner', unique: true}),
    );
    await adminClient.addToChannel(adminUser.id, channel.id);

    const {app, channelsPage} = await pw.testBrowser.login(adminUser);
    await channelsPage.goto(team.name, channel.name);
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible({timeout: duration.one_min});
    return app;
}

/** Saves the open tab, and closes Channel Settings. */
async function saveAndClose(settings: generated.ChannelSettingsModal) {
    await settings.savePanel.clickSaveButton();
    await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
    await settings.clickCloseButton();
    await expect(settings.tabs.configurationTab.locator).not.toBeVisible();
}

/** Turns the banner on with `text` and/or a background color, saves, and closes Channel Settings. */
async function configureBanner(app: App, banner: {text?: string; color?: string}) {
    const settings = await openChannelSettings(app, 'configuration');
    const {configuration} = settings;
    await configuration.bannerSwitch.turnOn();
    if (banner.text !== undefined) {
        await configuration.fillBannerTextTextbox(banner.text);
    }
    if (banner.color !== undefined) {
        const value = configuration.bannerColor.valueTextbox.locator;
        await value.fill(banner.color);
        expect((await value.inputValue()).replace('#', '')).toBe(banner.color);
    }
    await saveAndClose(settings);
}

/** Checks a banner shows `text` on a `color` background. */
async function expectBanner(banner: generated.ChannelBanner, text: string, color: string) {
    await expect(banner.locator).toBeVisible();
    await expect(banner.locator).toHaveText(text);
    await expect(banner.locator).toHaveCSS('background-color', hexToRgb(color));
}

/**
 * Checks that `element` lies fully within the banner's content area (its bounds minus its padding).
 *
 * Uses getBoundingClientRect() coordinates, which are NOT clipped by parent overflow — so if an element protrudes
 * into or beyond the padding zone it will be visually clipped by `overflow: hidden` on the text container, and this
 * catches that. A small epsilon on each boundary avoids flaky failures from sub-pixel rounding.
 */
async function expectContainedInBanner(banner: generated.ChannelBanner, element: Locator) {
    const EPSILON = 0.5;

    const bannerBox = await banner.locator.boundingBox();
    const elementBox = await element.boundingBox();
    expect(bannerBox).not.toBeNull();
    expect(elementBox).not.toBeNull();
    const outer = bannerBox!;
    const el = elementBox!;

    const {paddingTop, paddingBottom, paddingLeft, paddingRight} = await banner.locator.evaluate((node) => {
        const styles = window.getComputedStyle(node);
        return {
            paddingTop: parseFloat(styles.paddingTop),
            paddingBottom: parseFloat(styles.paddingBottom),
            paddingLeft: parseFloat(styles.paddingLeft),
            paddingRight: parseFloat(styles.paddingRight),
        };
    });

    expect(el.y).toBeGreaterThanOrEqual(outer.y + paddingTop - EPSILON);
    expect(el.y + el.height).toBeLessThanOrEqual(outer.y + outer.height - paddingBottom + EPSILON);
    expect(el.x).toBeGreaterThanOrEqual(outer.x + paddingLeft - EPSILON);
    expect(el.x + el.width).toBeLessThanOrEqual(outer.x + outer.width - paddingRight + EPSILON);
}

/** Sends a message from the center composer and opens its thread. */
async function replyToNewPost(app: App, message: string) {
    const {postList} = app.center;

    // Focus and type character-by-character to avoid React clearing a programmatic fill()
    const input = app.center.postCreate.messageTextbox.locator;
    await input.click();
    await input.pressSequentially(message);
    await app.center.postCreate.clickSendButton();

    const post = await postWith(postList, {text: message});
    await post.locator.hover();
    await post.menu.clickReplyButton();
    await expect(app.rhs.postCreate.messageTextbox.locator).toBeVisible();
}

/** The banner's markdown. */
function markdownIn(app: App) {
    return new generated.Markdown(app.page, 'markdown', app.center.channelBanner.locator);
}

test('Should show channel banner when configured', async ({pw}) => {
    const app = await openNewChannel(pw);
    const banner = app.center.channelBanner;

    await configureBanner(app, {text: 'Example channel banner text', color: '77DD88'});
    await expectBanner(banner, 'Example channel banner text', '77DD88');

    // Now we'll disable the channel banner
    let settings = await openChannelSettings(app, 'configuration');
    await settings.configuration.bannerSwitch.turnOff();
    await saveAndClose(settings);
    await expect(banner.locator).not.toBeVisible();

    // re-enabling channel banner should already have
    // the previously configured text and color
    settings = await openChannelSettings(app, 'configuration');
    await settings.configuration.bannerSwitch.turnOn();
    await saveAndClose(settings);
    await expectBanner(banner, 'Example channel banner text', '77DD88');
});

test('Should show channel banner in thread view', async ({pw}) => {
    const app = await openNewChannel(pw);

    // Configure the channel banner
    await configureBanner(app, {text: 'Thread banner text', color: 'AA33BB'});

    // Post a message and open the thread
    await replyToNewPost(app, 'Message to create a thread');

    await expectBanner(app.rhs.thread.channelBanner, 'Thread banner text', 'AA33BB');
});

test('Should not show channel banner in thread view when disabled', async ({pw}) => {
    const app = await openNewChannel(pw);

    await replyToNewPost(app, 'Message without banner');

    await expect(app.rhs.thread.channelBanner.locator).not.toBeVisible();
});

test('Should render image emoticons without clipping', async ({pw}) => {
    const app = await openNewChannel(pw);

    // :dog: is in Mattermost's emoji map → renders as .emoticon (background-image).
    // Unicode emojis that are also in the map (e.g. 🐶) follow the same path.
    await configureBanner(app, {color: '77DD88', text: 'Hello :dog:'});

    const emoji = markdownIn(app).emoji('dog').locator;
    await expect(emoji).toBeVisible();
    await expect(emoji).toHaveCSS('width', `${EMOJI_SIZE}px`);
    await expect(emoji).toHaveCSS('height', `${EMOJI_SIZE}px`);
    await expectContainedInBanner(app.center.channelBanner, emoji);
});

test('Should render unsupported unicode emoji without clipping', async ({pw}) => {
    const app = await openNewChannel(pw);

    // 🫠 (U+1FAE0, Unicode 14.0) is above Mattermost's emoji map ceiling (1FAD6)
    // so it falls through to the .emoticon--unicode span path.
    await configureBanner(app, {color: '77DD88', text: 'Hello 🫠'});

    const emoji = markdownIn(app).unicodeEmojiText.locator.first();
    await expect(emoji).toBeVisible();
    await expect(emoji).toHaveCSS('font-size', `${EMOJI_SIZE}px`);
    await expectContainedInBanner(app.center.channelBanner, emoji);
});

test('Should render text with descenders without clipping', async ({pw}) => {
    const app = await openNewChannel(pw);

    // Characters with descenders (parts that extend below the baseline).
    // Previously clipped because line-height equalled font-size (13px), leaving
    // no room below the baseline for g, j, p, q, y etc.
    await configureBanner(app, {color: '77DD88', text: 'YyGgQqJj'});

    const text = app.center.channelBanner.textText.locator;
    await expect(text).toBeVisible();
    await expectContainedInBanner(app.center.channelBanner, text);
});

test('Should render markdown', async ({pw}) => {
    const app = await openNewChannel(pw);

    await configureBanner(app, {text: '**bold** *italic* ~~strikethrough~~', color: '77DD88'});

    const banner = app.center.channelBanner.locator;
    await expect(banner.getByRole('strong')).toHaveText('bold');
    await expect(banner.getByRole('emphasis')).toHaveMessage(Msg.accessibility.button.italic);
    await expect(banner.getByRole('deletion')).toHaveText('strikethrough');
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {expect, generated, test, type App} from '@mattermost/playwright-lib';

/**
 * The picker shows GIPHY's description as a GIF's alt text, while the posted image is alt-texted with the GIF's
 * title, so a GIF is matched by its GIPHY media id: the path segment before the file name in both image URLs
 * (`/media/<id>/200.gif`, `/media/v1.<token>/<id>/giphy.webp`).
 */
function giphyId(src: string | null) {
    return src ? new URL(src).pathname.split('/').at(-2) : undefined;
}

/** Searches the open picker's GIF tab for `term`, picks the first result, and returns its GIPHY media id. */
async function pickGif(app: App, term: string) {
    // * Verify emoji/gif picker popup appears
    await expect(app.emojiGifPicker.gifs.locator).toBeVisible();

    // # Switch to GIF tab in the picker
    await app.emojiGifPicker.gifs.locator.click();
    await expect(app.gifPicker.items.locator).toBeVisible();

    // # Search for GIFs using the term
    await app.gifPicker.fillSearchTextbox(term);

    // # Select the first GIF from search results
    const first = app.gifPicker.items.locator.getByRole('img').first();
    await expect(first).toBeVisible();
    const id = giphyId(await first.getAttribute('src'));
    expect(id).toBeTruthy();
    await first.click();
    return id;
}

/** The image in the post a list shows after its first `before` posts, once that post shows. */
async function newPostImage(list: App['center']['postList'] | App['rhs']['thread'], before: number): Promise<Locator> {
    await expect.poll(async () => (await list.postKeys()).length).toBeGreaterThan(before);
    const id = (await list.postKeys()).at(-1)!;
    return new generated.Markdown(list.page, 'markdown', list.post({id}).locator).imageImg.locator;
}

/**
 * @objective Verify that users can search for GIFs, select them, and post them correctly when using the center textbox.
 */
test(
    'MM-T5445 searches for GIF from center textbox and posts selected GIF correctly',
    {tag: '@gif_picker'},
    async ({pw}) => {
        // # Initialize a test user
        const {user, team} = await pw.initSetup();

        // # Log in as a user in new browser context
        const {app} = await pw.testBrowser.login(user);

        // # Navigate to default channel page
        await app.teamPage.goto({team});
        await expect(app.center.composer.locator).toBeVisible();

        // # Open emoji/gif picker from center textbox, and pick a GIF for "hello"
        const composer = app.center.postCreate;
        await composer.clickEmojiButton();
        const picked = await pickGif(app, 'hello');

        // # Send the selected GIF as a message
        const before = (await app.center.postList.postKeys()).length;
        await composer.clickSendButton();

        // * Verify the posted message contains the selected GIF
        const image = await newPostImage(app.center.postList, before);
        await expect(image).toHaveAttribute('src', new RegExp(`/${picked}/`));
    },
);

/**
 * @objective Verify that users can search for GIFs, select them, and post them correctly when using the right-hand sidebar.
 */
test(
    'MM-T5446 searches for GIF from RHS textbox and posts selected GIF correctly in thread',
    {tag: '@gif_picker'},
    async ({pw}) => {
        // # Initialize a test user
        const {user, team} = await pw.initSetup();

        // # Log in as a user in new browser context
        const {app} = await pw.testBrowser.login(user);

        // # Navigate to default channel page
        await app.teamPage.goto({team});
        await expect(app.center.composer.locator).toBeVisible();

        // # Post a message to create a thread
        const center = app.center.postCreate;
        await center.fillMessageTextbox('Message to open RHS');
        await center.clickSendButton();

        // # Open the message in right-hand sidebar to start a thread
        const {postList} = app.center;
        await expect.poll(async () => (await postList.postKeys()).length).toBeGreaterThan(0);
        const post = postList.post({id: (await postList.postKeys()).at(-1)!});
        await post.locator.hover();
        await post.menu.clickReplyButton();

        // * Verify right sidebar opens and is visible
        const reply = app.rhs.postCreate;
        await expect(reply.messageTextbox.locator).toBeVisible();

        // # Post an initial reply in the thread
        await reply.fillMessageTextbox('Replying to a thread');
        await reply.clickSendButton();

        // # Open emoji/gif picker from the RHS textbox, and pick a GIF for "hello"
        await reply.clickEmojiButton();
        const picked = await pickGif(app, 'hello');

        // # Send the selected GIF as a message in the thread
        const before = (await app.rhs.thread.postKeys()).length;
        await reply.clickSendButton();

        // * Verify the posted message in the thread contains the selected GIF
        const image = await newPostImage(app.rhs.thread, before);
        await expect(image).toHaveAttribute('src', new RegExp(`/${picked}/`));
    },
);

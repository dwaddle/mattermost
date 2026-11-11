// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {getAsset} from '@/asset';
import {expect, test, type App, type generated, type PlaywrightExtended} from '@mattermost/playwright-lib';

const ORIGINAL_MESSAGE = 'Lorem ipsum dolor sit amet, consectetur adipiscing elit';

type Composer = generated.PostCreate;
type Post = ReturnType<App['center']['postList']['post']>;

/** Attaches files through a composer's attach button and waits for their previews. */
async function attach(app: App, composer: Composer, files: string[]) {
    const before = (await composer.filePreviews.fileKeys()).length;
    const chooser = app.page.waitForEvent('filechooser');
    await composer.clickAttachButton();
    await (await chooser).setFiles(files.map((file) => getAsset(file)));
    await expect(composer.filePreviews.fileItems).toHaveCount(before + files.length);
}

/** Opens the user's town square. */
async function open(pw: PlaywrightExtended) {
    const {user, team, townSquare} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(user);
    await app.channelsPage.goto({team, channel: townSquare});
    return app;
}

/** Posts a message (with files) from the center composer and returns the new post. */
async function postMessage(app: App, message: string, files: string[] = []): Promise<{id: string; post: Post}> {
    const {postCreate, postList} = app.center;
    const before = (await postList.postKeys()).at(-1);
    if (files.length) {
        await attach(app, postCreate, files);
    }
    await postCreate.fillMessageTextbox(message);
    await postCreate.clickSendButton();
    await expect.poll(async () => (await postList.postKeys()).at(-1)).not.toBe(before);
    const id = (await postList.postKeys()).at(-1)!;
    const post = postList.post({id});
    await expect(post.messageText.locator).toContainText(message);
    return {id, post};
}

/** Opens a post's dot menu. */
async function openDotMenu(app: App, post: {locator: Locator; menu: Post['menu']}) {
    await post.locator.hover();
    const menu = await post.menu.clickDotMenuButton();

    // park the cursor so it doesn't open a submenu (e.g. "Remind") under it, which hides the menu from roles
    await app.page.mouse.move(0, 0);
    return menu;
}

/** Opens the inline editor on a post from its dot menu. */
async function openEditor(app: App, post: {locator: Locator; menu: Post['menu']}) {
    await (await openDotMenu(app, post)).clickEditMenuItem();
    const editor = app.postEdit.editor;
    await expect(editor.messageTextbox.locator).toBeVisible();
    return editor;
}

/** Removes a file from the editor by its name. */
async function removeFile(editor: Composer, name: string) {
    for (const key of await editor.filePreviews.fileKeys()) {
        const file = editor.filePreviews.file({id: key});
        if ((await file.details.locator.textContent())?.includes(name)) {
            await file.clickRemoveButton();
            await expect(file.locator).toHaveCount(0);
            return;
        }
    }
    throw new Error(`No file named ${name} in the editor`);
}

/** Saves the editor and waits for it to close. */
async function save(editor: Composer) {
    await editor.clickSaveButton();
    await expect(editor.messageTextbox.locator).not.toBeVisible();
}

/**
 * @objective Verify that users can edit a post and modify its content
 */
test('MM-T5654_1 should be able to add attachments while editing a post', {tag: ['@smoke']}, async ({pw}) => {
    // # Initialize user, login and post a message
    const app = await open(pw);
    const {post} = await postMessage(app, ORIGINAL_MESSAGE);

    // # Edit the message and save
    const editor = await openEditor(app, post);
    await editor.fillMessageTextbox('Edited message');
    await save(editor);

    // * Verify the post was updated with the edited message
    await expect(post.messageText.locator).toContainText('Edited message');
});

test('MM-T5654_2 should be able to add attachments while editing a threaded post', async ({pw}) => {
    const app = await open(pw);
    const {post} = await postMessage(app, ORIGINAL_MESSAGE);

    // # Reply to the post in the RHS
    await (await openDotMenu(app, post)).clickReplyMenuItem();
    const {postCreate, thread} = app.rhs;
    await expect(postCreate.messageTextbox.locator).toBeVisible();
    await postCreate.fillMessageTextbox('Replying to the post');
    await postCreate.clickSendButton();
    await expect.poll(async () => (await thread.postKeys()).length).toBe(2);
    const reply = thread.post({id: (await thread.postKeys()).at(-1)!});
    await expect(reply.messageText.locator).toContainText('Replying to the post');

    // # Edit the reply
    let editor = await openEditor(app, reply);
    await editor.fillMessageTextbox('Edited reply message');
    await save(editor);
    await expect(reply.messageText.locator).toContainText('Edited reply message');

    // # Edit the reply again and add files to it
    editor = await openEditor(app, reply);
    await editor.fillMessageTextbox('Edited reply message with files');
    await attach(app, editor, ['sample_text_file.txt', 'mattermost.png']);
    await save(editor);
    await expect(reply.locator).toContainText('Edited reply message with files');
    await expect(reply.locator).toContainText('sample_text_file.txt');
    await expect(reply.locator).toContainText('mattermost.png');

    // # Remove the files
    editor = await openEditor(app, reply);
    await removeFile(editor, 'sample_text_file.txt');
    await removeFile(editor, 'mattermost.png');
    await save(editor);

    await expect(reply.locator).toContainText('Edited reply message with files');
    await expect(reply.locator).not.toContainText('sample_text_file.txt');
    await expect(reply.locator).not.toContainText('mattermost.png');
});

test('MM-T5654_3 should be able to edit post message originally containing files', async ({pw}) => {
    const app = await open(pw);
    const {post} = await postMessage(app, ORIGINAL_MESSAGE, ['sample_text_file.txt']);

    const editor = await openEditor(app, post);
    await editor.fillMessageTextbox('Edited message');
    await save(editor);

    await expect(post.messageText.locator).toContainText('Edited message');
    await expect(post.locator).toContainText('sample_text_file.txt');
});

test('MM-T5654_4 should be able to add files when editing a post', async ({pw}) => {
    const app = await open(pw);
    const {post} = await postMessage(app, ORIGINAL_MESSAGE);

    let editor = await openEditor(app, post);
    await editor.fillMessageTextbox('Edited message');
    await attach(app, editor, ['sample_text_file.txt']);
    await save(editor);

    await expect(post.messageText.locator).toContainText('Edited message');
    await expect(post.locator).toContainText('sample_text_file.txt');

    // # Add multiple files
    editor = await openEditor(app, post);
    await attach(app, editor, ['mattermost.png', 'archive.zip']);
    await save(editor);

    await expect(post.messageText.locator).toContainText('Edited message');
    await expect(post.locator).toContainText('sample_text_file.txt');
    await expect(post.locator).toContainText('mattermost.png');
    await expect(post.locator).toContainText('archive.zip');
});

test('MM-5654_5 should be able to remove attachments while editing a post', async ({pw}) => {
    const app = await open(pw);
    const {post} = await postMessage(app, ORIGINAL_MESSAGE, ['sample_text_file.txt', 'mattermost.png', 'archive.zip']);
    await expect(post.locator).toContainText('sample_text_file.txt');
    await expect(post.locator).toContainText('mattermost.png');
    await expect(post.locator).toContainText('archive.zip');

    const editor = await openEditor(app, post);
    await removeFile(editor, 'sample_text_file.txt');
    await save(editor);

    await expect(post.messageText.locator).toContainText(ORIGINAL_MESSAGE);
    await expect(post.locator).toContainText('mattermost.png');
    await expect(post.locator).toContainText('archive.zip');
    await expect(post.locator).not.toContainText('sample_text_file.txt');
});

test('MM-T5655_1 removing message content and files should delete the post', async ({pw}) => {
    const app = await open(pw);
    const {post} = await postMessage(app, ORIGINAL_MESSAGE, ['sample_text_file.txt']);
    await expect(post.locator).toContainText('sample_text_file.txt');

    // # Remove the file and the message, then save
    const editor = await openEditor(app, post);
    await removeFile(editor, 'sample_text_file.txt');
    await editor.messageTextbox.locator.clear();
    await editor.clickSaveButton();

    // # Confirm the deletion it asks for
    await expect(app.deletePostModal.locator).toBeVisible();
    await app.deletePostModal.clickDeleteButton();
    await expect(app.deletePostModal.locator).not.toBeVisible();

    // * The post is gone
    await expect(post.locator).toHaveCount(0);
    await expect(app.center.postList.locator).not.toContainText(ORIGINAL_MESSAGE);
});

test('MM-T5655_2 should be able to remove all files when editing a post', async ({pw}) => {
    const app = await open(pw);
    const {post} = await postMessage(app, ORIGINAL_MESSAGE, ['sample_text_file.txt', 'mattermost.png', 'archive.zip']);
    await expect(post.locator).toContainText('archive.zip');

    const editor = await openEditor(app, post);
    await removeFile(editor, 'sample_text_file.txt');
    await removeFile(editor, 'mattermost.png');
    await removeFile(editor, 'archive.zip');
    await save(editor);

    await expect(post.messageText.locator).toContainText(ORIGINAL_MESSAGE);
    await expect(post.locator).not.toContainText('archive.zip');
    await expect(post.locator).not.toContainText('mattermost.png');
    await expect(post.locator).not.toContainText('sample_text_file.txt');
});

test('MM-T5656_1 should be able to restore previously edited post version that contains attachments', async ({pw}) => {
    const newMessage = 'New Message';
    const app = await open(pw);
    const {id: postId, post} = await postMessage(app, ORIGINAL_MESSAGE, ['sample_text_file.txt']);
    await expect(post.locator).toContainText('sample_text_file.txt');

    // # Edit: remove the file and change the message
    const editor = await openEditor(app, post);
    await removeFile(editor, 'sample_text_file.txt');
    await editor.fillMessageTextbox(newMessage);
    await save(editor);

    await expect(post.messageText.locator).toContainText(newMessage);
    await expect(post.locator).not.toContainText('sample_text_file.txt');

    // # Open the edit history from the post's Edited indicator
    await post.clickEditedButton();
    const history = app.rhs.editHistory;

    // * The current version (keyed by the post's id) shows the new message
    const current = history.version({id: postId});
    await expect(current.current.locator).toBeVisible();
    await expect(current.messageText.locator).toContainText(newMessage);

    // # Restore the previous version (the other one in the history), and confirm
    await expect.poll(async () => (await history.versionKeys()).length).toBe(2);
    const previousId = (await history.versionKeys()).find((key) => key !== postId)!;
    const previous = history.version({id: previousId});
    await previous.locator.hover();
    await previous.clickRestoreButton();
    await expect(app.restorePostModal.locator).toBeVisible();
    await app.restorePostModal.clickConfirmButton();
    await expect(app.restorePostModal.locator).not.toBeVisible();

    // * The restored post has its file again
    await expect(post.locator).toContainText('sample_text_file.txt');
});

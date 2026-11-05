// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {expect, setWysiwygUserPreference, type App, type PlaywrightExtended} from '@mattermost/playwright-lib';

/**
 * The rich-text (WYSIWYG) composer on the generated page objects. It is the same composer as the Markdown one
 * (`<host>.post_create`): its message box is the editable area, with the formatting bar's buttons keyed by format and
 * the same suggestion list. What the editor renders inside the box (bold, headings, mentions) is its document, read
 * as HTML.
 */

export type Composer = App['center']['postCreate'];

/** Turns on the user's rich-text preference, logs them in and opens the team's off-topic channel. */
export async function openRichComposer(
    pw: PlaywrightExtended,
    setup: {user: UserProfile; userClient: Parameters<typeof setWysiwygUserPreference>[0]; team: Team},
) {
    await setWysiwygUserPreference(setup.userClient, setup.user.id, true);
    const {app} = await pw.testBrowser.login(setup.user);
    await app.channelsPage.goto({team: setup.team, channel: 'off-topic'});
    await expectRich(app.center.postCreate);
    return app;
}

/** The composer's message box is the rich-text editor (an editable area, not a textarea). */
export async function expectRich(composer: Composer) {
    await expect(composer.messageTextbox.locator).toHaveAttribute('contenteditable', 'true');
    await expect(composer.messageTextbox.locator).toHaveAttribute('role', 'textbox');
}

/** Types like a user: the editor needs a transaction per keystroke, so not fill(). */
export async function typeRich(composer: Composer, text: string) {
    await composer.messageTextbox.locator.click();
    await composer.messageTextbox.type(text);
}

/** Selects everything in the editor and deletes it. */
export async function clearRich(composer: Composer) {
    await composer.messageTextbox.locator.click();
    await composer.messageTextbox.press('ControlOrMeta+a');
    await composer.messageTextbox.press('Delete');
}

/** Pastes `text` into the editor as a clipboard paste event. */
export async function pasteRich(composer: Composer, text: string) {
    await composer.messageTextbox.locator.click();
    await composer.messageTextbox.locator.evaluate((el, data) => {
        const transfer = new DataTransfer();
        transfer.setData('text/plain', data);
        el.dispatchEvent(new ClipboardEvent('paste', {clipboardData: transfer, bubbles: true, cancelable: true}));
    }, text);
}

/** Waits until the editor's document matches `pattern` (or, with `not`, stops matching it). */
export async function expectDocument(composer: Composer, pattern: RegExp, not = false) {
    const html = () => composer.messageTextbox.locator.innerHTML();
    if (not) {
        await expect.poll(html).not.toMatch(pattern);
    } else {
        await expect.poll(html).toMatch(pattern);
    }
}

/** Sends with the Send button, once the draft is ready, and waits for the editor to empty. */
export async function sendRich(composer: Composer) {
    await expect(composer.sendButton.locator).toBeEnabled();
    await composer.clickSendButton();
    await expect(composer.messageTextbox.locator).toHaveText('');
}

/** The text of a post list's last post, once there is one. */
export async function lastPostText(list: App['center']['postList'] | App['rhs']['thread']) {
    const id = (await list.postKeys()).at(-1);
    return id ? ((await list.post({id}).locator.textContent()) ?? '') : '';
}

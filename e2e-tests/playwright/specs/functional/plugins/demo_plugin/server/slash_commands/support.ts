// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, type App, duration} from '@mattermost/playwright-lib';

/**
 * The demo plugin's slash commands on the generated page objects. The plugin answers in posts the webapp renders, so
 * its replies are ordinary posts: found by their text (ephemeral replies have no server-side id to look up), with
 * their action buttons, markdown and "(Only visible to you)" label as parts.
 */

export type CenterPost = ReturnType<App['center']['postList']['post']>;

/** Sends a message (a slash command) from the center composer. */
export async function sendCommand(app: App, command: string) {
    const composer = app.center.postCreate;
    await composer.fillMessageTextbox(command);
    await composer.clickSendButton();
}

/** The most recent post whose text contains `text`, once it shows, and its id. */
export async function postContaining(
    app: App,
    text: string,
    timeout = 15_000,
): Promise<{id: string; post: CenterPost}> {
    const {postList} = app.center;
    let found = '';
    await expect
        .poll(
            async () => {
                const keys = await postList.postKeys();
                for (const id of [...keys].reverse()) {
                    if ((await postList.post({id}).locator.textContent())?.includes(text)) {
                        found = id;
                        return found;
                    }
                }
                return '';
            },
            {timeout, message: `no post containing "${text}"`},
        )
        .not.toBe('');
    return {id: found, post: postList.post({id: found})};
}

/** A post's action button by its label (ephemeral posts' action ids can't be read from the server). */
export function actionNamed(post: CenterPost, label: string) {
    return post.actionItems.filter({hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)});
}

/** The markdown rendered inside a post. */
export function markdownOf(app: App, post: CenterPost) {
    return new generated.Markdown(app.page, 'markdown', post.locator);
}

/**
 * An open dialog's field by its label (the plugin names its fields; the test knows them by what they say). A select
 * field's label is its own part; the others come from the settings widgets.
 */
export async function fieldLabelled(app: App, label: string) {
    const form = app.appsForm;
    let name = '';
    await expect
        .poll(
            async () => {
                for (const key of await form.fieldKeys()) {
                    const field = form.field({name: key});
                    const text = await field.labelText.locator.or(field.selectLabelText.locator).textContent();
                    if (text?.trim() === label) {
                        name = key;
                        return name;
                    }
                }
                return '';
            },
            {message: `no field labelled "${label}"`},
        )
        .not.toBe('');
    return form.field({name});
}

/** The labels of an open dialog's fields, in order. */
export async function fieldLabels(app: App): Promise<string[]> {
    const form = app.appsForm;
    const labels: string[] = [];
    for (const key of await form.fieldKeys()) {
        const field = form.field({name: key});
        // a field can go between listing and reading it (the dialog re-renders on a refresh): skip it, don't wait
        const label = await field.labelText.locator
            .or(field.selectLabelText.locator)
            .textContent({timeout: duration.one_sec})
            .catch(() => null);
        if (label) {
            labels.push(label.trim());
        }
    }
    return labels;
}

/** An open dialog's first field whose text contains `text` (a checkbox's own text, a radio's choices). */
export async function fieldContaining(app: App, text: string) {
    const form = app.appsForm;
    let name = '';
    await expect
        .poll(
            async () => {
                for (const key of await form.fieldKeys()) {
                    if ((await form.field({name: key}).locator.textContent())?.includes(text)) {
                        name = key;
                        return name;
                    }
                }
                return '';
            },
            {message: `no field containing "${text}"`},
        )
        .not.toBe('');
    return form.field({name});
}

/** Opens a dialog with a slash command, resending until it opens (the plugin can still be starting). */
export async function openDialog(app: App, command: string, timeout = 60_000) {
    const form = app.appsForm;
    await expect(async () => {
        await sendCommand(app, command);
        await expect(form.titleText.locator).toBeVisible({timeout: duration.half_min});
    }).toPass({timeout});
    return form;
}

/**
 * An open dialog's first radio field offering `choice`: a field with radio options whose text includes it (a select
 * can show the same text once chosen, and a radio's testid sits on its <input>, which has no text).
 */
export async function radioFieldWith(app: App, choice: string) {
    const form = app.appsForm;
    let name = '';
    await expect
        .poll(
            async () => {
                for (const key of await form.fieldKeys()) {
                    const field = form.field({name: key});
                    if ((await field.optionItems.count()) && (await field.locator.textContent())?.includes(choice)) {
                        name = key;
                        return name;
                    }
                }
                return '';
            },
            {message: `no radio field offering "${choice}"`},
        )
        .not.toBe('');
    return form.field({name});
}

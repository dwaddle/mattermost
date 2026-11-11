// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import {
    expect,
    openChannel as openChannelFlow,
    type App,
    type generated,
    type PlaywrightExtended,
} from '@mattermost/playwright-lib';

/**
 * Channel attributes on the generated page objects. Labels (the channel header's, a thread's) are chips keyed by field
 * id; the editable block (Channel Info in the RHS, and the same editor in Channel Settings' Info tab) has rows keyed by
 * field id, whose values are chips keyed by value or a text value, edited inline through a text box or a menu. The
 * helpers specs elsewhere share are in the lib's flows; they're re-exported here for this folder's specs.
 */

export {
    labelChip,
    openAttributeControl,
    openChannelInfo,
    openNewChannelModal,
    pickListOption,
} from '@mattermost/playwright-lib';

type Field = {id: string};
export type Labels = generated.Attributes | generated.ThreadsPaneAttributes;
export type Editable = generated.ChannelInfoAttributes;

/** Logs the user in and opens the channel (a direct message by `@username`), waiting for the app to be up. */
export async function openChannel(pw: PlaywrightExtended, user: UserProfile, team: Team, channel: {name: string}) {
    return openChannelFlow(pw, user, {team, channel, path: channel.name.startsWith('@') ? 'messages' : 'channels'});
}

/** Opens a thread in global Threads (from the list, as a user would) and returns the view. */
export async function openGlobalThread(app: App, team: Team, root: {id: string}) {
    await app.threadsPage.goto({team});
    const {threads} = app;
    await threads.list.thread(root.id).clickLink();
    await expect(threads.pane.followButton.locator).toBeVisible();
    return {threads};
}

/** Opens Channel Settings on its Info tab. */
export async function openChannelSettingsInfo(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.infoTab.select();
    await expect(settings.info.nameTextbox.locator).toBeVisible();
    return settings;
}

/** Opens a label row's overflow popover and returns it. */
export async function openOverflow(labels: Labels): Promise<Locator> {
    await labels.clickOverflowButton();
    const popover = labels.overflowPopover.locator;
    await expect(popover).toBeVisible();
    return popover;
}

/** A field's row in the editable block. */
export function row(attributes: Editable, field: Field) {
    return attributes.attribute(field);
}

/** A row's first value: its first chip (select fields; chips are keyed by value) or its text value. */
export function chip(attributes: Editable, field: Field): Locator {
    const r = row(attributes, field);
    return r.chipItems.first().or(r.valueText.locator);
}

/** A row's open editor: the text box (text fields) or the menu's first option (select fields). */
export function editor(attributes: Editable, field: Field): Locator {
    const r = row(attributes, field);
    return r.editorTextbox.locator.or(r.editMenu.optionItems.first());
}

export async function startEditing(attributes: Editable, field: Field) {
    await row(attributes, field).clickEditButton();
    await expect(editor(attributes, field)).toBeVisible();
}

/**
 * Only Escape is guaranteed to close the editor: a commit closes it on a successful write and deliberately keeps it
 * open on a failed one, so callers assert the outcome they expect.
 */
export async function setText(
    app: App,
    attributes: Editable,
    field: Field,
    text: string,
    commit: 'enter' | 'blur' | 'escape' = 'enter',
) {
    await startEditing(attributes, field);
    const input = editor(attributes, field);
    await input.fill(text);

    if (commit === 'enter') {
        await input.press('Enter');
    } else if (commit === 'escape') {
        await input.press('Escape');
        await expect(input).not.toBeVisible();
    } else {
        await app.page.mouse.click(0, 0);
    }
}

/** Picks an option by name from an open attribute menu. */
export async function pickOption(app: App, option: string) {
    await app.page.getByRole('menuitem', {name: option, exact: true}).click();
}

/** Opens a select field's menu and picks the option (the editor of a select is its first option, so not clicked). */
export async function select(app: App, attributes: Editable, field: Field, option: string) {
    await startEditing(attributes, field);
    await pickOption(app, option);
}

/** Removes a selected option with its chip's remove control (which doesn't open the menu). */
export async function deselect(attributes: Editable, field: Field, option: string) {
    await row(attributes, field)
        .locator.getByRole('button', {name: `Remove ${option}`, exact: true})
        .click();
}

/**
 * Adds an unset attribute from the block's Add menu. A text attribute opens its input as soon as it is added; a
 * select one lands as a closed "Not set" row, so its menu is opened here.
 */
export async function add(app: App, attributes: Editable, field: Field, option?: string) {
    await attributes.clickAddButton();
    await attributes.addMenu.attribute(field).locator.click();
    const r = row(attributes, field);
    await expect(editor(attributes, field).or(r.unsetText.locator)).toBeVisible();
    if (!(await editor(attributes, field).isVisible())) {
        await r.clickEditButton();
    }
    await expect(editor(attributes, field)).toBeVisible();

    if (option !== undefined) {
        await pickOption(app, option);
    }
}

type Configuration = generated.ChannelSettingsModalConfiguration;

/** Opens Channel Settings on its Configuration tab. */
export async function openChannelSettingsConfiguration(app: App) {
    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.tab('configuration').select();
    await expect(settings.configuration.bannerSwitch.locator).toBeVisible();
    return settings;
}

/** The attribute names of the banner text's tokens, in order (tokens are keyed by position; `data-token` names them). */
export async function bannerTokenNames(config: Configuration): Promise<string[]> {
    const names: string[] = [];
    for (const key of await config.bannerText.tokenKeys()) {
        names.push((await config.bannerText.token(Number(key)).locator.getAttribute('data-token')) ?? '');
    }
    return names;
}

/** The banner text's token for an attribute, by its name. */
export async function bannerToken(config: Configuration, name: string) {
    await expect.poll(() => bannerTokenNames(config)).toContain(name);
    return config.bannerText.token((await bannerTokenNames(config)).indexOf(name));
}

/** Inserts an attribute's token from the banner text's Insert menu. */
export async function insertBannerToken(config: Configuration, field: {id: string; name: string}) {
    await config.bannerText.clickInsertButton();
    await config.bannerText.insertMenu.attribute(field).clickMenuItem();
    await expect.poll(() => bannerTokenNames(config)).toContain(field.name);
}

/** Removes an attribute's token from the banner text. */
export async function removeBannerToken(config: Configuration, name: string) {
    await (await bannerToken(config, name)).clickRemoveButton();
    await expect.poll(() => bannerTokenNames(config)).not.toContain(name);
}

/** Types at the end of the banner text editor. */
export async function typeBannerText(app: App, config: Configuration, text: string) {
    await config.bannerTextTextbox.locator.click();
    await app.page.keyboard.press('End');
    await app.page.keyboard.type(text);
}

/**
 * Empties the banner text editor. Keyboard deletes and execCommand('delete') both honour contenteditable=false on the
 * token chips and refuse to remove them; removing the DOM nodes and dispatching an input event syncs the component.
 */
export async function clearBannerText(config: Configuration) {
    const editor = config.bannerTextTextbox.locator;
    await editor.click();
    await editor.evaluate((el: HTMLElement) => {
        while (el.firstChild) {
            el.removeChild(el.firstChild);
        }
        el.dispatchEvent(new InputEvent('input', {bubbles: true, cancelable: false}));
    });
    await expect(editor).toHaveText('');
}

/** Sets the banner colour (a hex value, with or without `#`). */
export async function setBannerColor(config: Configuration, color: string) {
    const value = config.bannerColor.valueTextbox.locator;
    await value.fill(color.replace('#', ''));
    await expect(value).toHaveValue(new RegExp(`^#?${color.replace('#', '')}$`, 'i'));
}

/** `#RRGGBB` as the browser reports a computed colour. */
function rgb(hex: string) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
}

/** Checks a channel banner's text and background colour. */
export async function expectBanner(banner: generated.ChannelBanner, text: string, color: string) {
    await expect(banner.textText.locator).toHaveText(text);
    expect(await banner.locator.evaluate((el) => getComputedStyle(el).backgroundColor)).toBe(rgb(color));
}

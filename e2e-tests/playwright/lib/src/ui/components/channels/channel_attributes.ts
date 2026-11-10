// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

type Field = {id: string};

/**
 * The attribute chips in one place (`channel_header.attributes`, `rhs.thread.header.attributes`,
 * `threads.pane.attributes`). Chips are keyed by position, since their values are typed by admins.
 */
export class ChannelAttributeLabels {
    readonly container: Locator;
    readonly scope: string;

    constructor(container: Locator, scope: string) {
        this.container = container;
        this.scope = scope;
    }

    get chips() {
        return this.container.getByTestId(new RegExp(`^${this.scope.replace(/\./g, '\\.')}\\.chip:\\d+$`));
    }

    chip(value: string) {
        return this.chips.filter({hasText: value});
    }

    get overflowButton() {
        return this.container.getByTestId(`${this.scope}.overflow--button`);
    }

    /** Portalled to the body. */
    get popover() {
        return this.container.page().getByTestId(`${this.scope}.overflow_popover`);
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async toBeHidden() {
        await expect(this.container).toHaveCount(0);
    }

    get visibleRow(): Locator {
        return this.container.locator('.ChannelAttributeLabels__visible');
    }

    async openOverflow() {
        await this.overflowButton.click();
        await expect(this.popover).toBeVisible();
        return this.popover;
    }
}

/**
 * The Channel Attributes block in the Channel Info panel and the channel settings Info tab, including its
 * inline editors. Rows are keyed by field id (names are typed by admins); a row's parts are under
 * `<scope>.attribute`, and values by position.
 */
export class ChannelInfoAttributes {
    readonly container: Locator;
    readonly scope: string;

    constructor(container: Locator, scope: string) {
        this.container = container;
        this.scope = scope;
    }

    row(field: Field) {
        return this.container.getByTestId(`${this.scope}.attribute:${field.id}`);
    }

    /**
     * The displayed value. An editable text value renders as plain text inside its
     * edit button; every other value, and a read-only text one, renders as a chip.
     */
    chip(field: Field) {
        return this.row(field)
            .getByTestId(`${this.scope}.attribute.chip:0`)
            .or(this.row(field).getByTestId(`${this.scope}.attribute.value--text`));
    }

    editButton(field: Field) {
        return this.row(field).getByTestId(`${this.scope}.attribute.edit--button`);
    }

    /**
     * Page-wide: a select's options render in a menu portalled to the body, outside the row, and only one
     * editor is open at a time. The text input, or a select's first option.
     */
    editor(field: Field) {
        const page = this.container.page();
        return this.row(field)
            .getByTestId(`${this.scope}.attribute.editor--textbox`)
            .or(page.getByTestId(`${this.scope}.attribute.edit_menu.option:0--menuitem`));
    }

    error(field: Field) {
        return this.row(field).getByTestId(`${this.scope}.attribute.error--alert`);
    }

    lock(field: Field) {
        return this.row(field).getByTestId(`${this.scope}.attribute.locked`);
    }

    unset(field: Field) {
        return this.row(field).getByTestId(`${this.scope}.attribute.unset--text`);
    }

    get addButton() {
        return this.container.getByTestId(`${this.scope}.add--button`);
    }

    addMenuItem(field: Field) {
        return this.container.page().getByTestId(`${this.scope}.add_menu.attribute:${field.id}--menuitem`);
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async startEditing(field: Field) {
        await this.editButton(field).click();
        await expect(this.editor(field)).toBeVisible();
    }

    /**
     * Only Escape is guaranteed to close the editor: a commit closes it on a
     * successful write and deliberately keeps it open on a failed one, so callers
     * assert the outcome they expect.
     */
    async setText(field: Field, text: string, commit: 'enter' | 'blur' | 'escape' = 'enter') {
        await this.startEditing(field);

        const input = this.editor(field);
        await input.fill(text);

        if (commit === 'enter') {
            await input.press('Enter');
        } else if (commit === 'escape') {
            await input.press('Escape');
            await expect(input).not.toBeVisible();
        } else {
            await this.container
                .page()
                .locator('body')
                .click({position: {x: 0, y: 0}});
        }
    }

    /**
     * editor(field) on a select field is the first menu option, not a combobox, so
     * clicking it would pick that option. Options are picked by name instead.
     */
    async select(field: Field, option: string) {
        await this.startEditing(field);
        await this.pickOption(option);
    }

    async pickOption(option: string) {
        await this.container.page().getByRole('menuitem', {name: option, exact: true}).click();
    }

    /**
     * The trigger's own chip carries the remove control -- no need to reopen
     * the menu first, and removing does not open it either.
     */
    async deselect(field: Field, option: string) {
        await this.row(field)
            .getByRole('button', {name: `Remove ${option}`, exact: true})
            .click();
    }

    /**
     * A text attribute opens its input as soon as it is added; a select one lands as
     * a closed "Not set" row, so its menu is opened here.
     */
    async add(field: Field, option?: string) {
        await this.addButton.click();
        await this.addMenuItem(field).click();
        await expect(this.editor(field).or(this.unset(field))).toBeVisible();
        if (!(await this.editor(field).isVisible())) {
            await this.editButton(field).click();
        }
        await expect(this.editor(field)).toBeVisible();

        if (option !== undefined) {
            await this.pickOption(option);
        }
    }
}

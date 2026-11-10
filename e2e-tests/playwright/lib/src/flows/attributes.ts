// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import type {App, Attributes, ChannelInfoAttributes, NewChannelModal, ThreadsPaneAttributes} from '@/ui/generated';

/**
 * Channel attributes on the generated page objects, for the specs that set them up from elsewhere (the System
 * Console's attribute and classification pages). Labels (the channel header's, a thread's) are chips keyed by field
 * id; the editable block (Channel Info in the RHS, and the same editor in Channel Settings' Info tab) has rows keyed by
 * field id, whose values are chips keyed by value or a text value.
 */

type Field = {id: string};
export type AttributeLabels = Attributes | ThreadsPaneAttributes;
export type EditableAttributes = ChannelInfoAttributes;

/** Opens Channel Info in the RHS (the header button toggles, so only when it isn't already showing). */
export async function openChannelInfo(app: App) {
    const header = app.rhs.channelInfo.header.locator;
    if (!(await header.isVisible())) {
        await app.channelHeader.clickInfoButton();
    }
    await header.waitFor();
    return app.rhs.channelInfo.about.attributes;
}

/** A field's row in the editable block. */
export function attributeRow(attributes: EditableAttributes, field: Field) {
    return attributes.attribute(field);
}

/** A row's first value: its first chip (select fields; chips are keyed by value) or its text value. */
export function attributeValue(attributes: EditableAttributes, field: Field): Locator {
    const row = attributeRow(attributes, field);
    return row.chipItems.first().or(row.valueText.locator);
}

/** A label chip showing the value. */
export function labelChip(labels: AttributeLabels, value: string): Locator {
    return labels.chipItems.filter({hasText: value});
}

/** Picks an option by name from an open select list (react-select's menu: options by role and name). */
export async function pickListOption(app: App, option: string) {
    await app.page.getByRole('option', {name: option, exact: true}).click();
}

/** Opens an attribute's control in the new-channel dialog: a select's is the dropdown itself, a graph picker's its button. */
export async function openAttributeControl(modal: NewChannelModal, field: Field) {
    const attribute = modal.attributes.attribute(field);
    await attribute.valueButton.locator.or(attribute.value.locator).click();
}

/** Opens the new-channel dialog from the sidebar's "+" menu, once its name field shows. */
export async function openNewChannelModal(app: App) {
    const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
    await modal.nameTextbox.locator.waitFor();
    return modal;
}

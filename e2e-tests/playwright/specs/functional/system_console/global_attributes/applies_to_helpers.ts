// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Client4} from '@mattermost/client';
import type {PropertyField} from '@mattermost/types/properties';

import {expect, type AdminLocation, type AdminPolicy, type App} from '@mattermost/playwright-lib';

import {GLOBAL_ATTRIBUTES_ADMIN_PATH, addChannelResource, openNewAttribute} from './global_attributes_helpers';

const PROPERTY_GROUP = 'access_control';

export type ChannelAttributeConfig = {
    displayName: string;

    // The type menu's option ids
    type?: 'select' | 'multiselect' | 'text';
    options?: string[];
    required?: boolean;

    // Left alone the row keeps its default, 'any' (can be changed at any time).
    changePolicy?: AdminPolicy;
    displayLocations?: AdminLocation[];
};

/**
 * Mirrors slugifyForCEL in webapp utils/properties.ts, which is what the console
 * derives the unique name from as the display name is typed.
 */
export function derivedAttributeName(displayName: string): string {
    let slug = displayName
        .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
        .replace(/([A-Z]+)([A-Z][a-z])/g, '$1_$2')
        .toLowerCase()
        .replace(/[^a-z0-9_]/g, '_');
    if (/^[0-9]/.test(slug)) {
        slug = '_' + slug;
    }
    return slug.replace(/_+/g, '_').replace(/_+$/, '') || '_copy';
}

/**
 * Creates an attribute and its Channels resource entirely through the System
 * Console UI, and returns the name the console derived for it.
 */
export async function configureChannelAttribute(
    app: App,
    {displayName, type, options = [], required = false, changePolicy, displayLocations = []}: ChannelAttributeConfig,
): Promise<string> {
    const form = await openNewAttribute(app);
    await form.fillDisplayNameTextbox(displayName);
    if (type && type !== 'text') {
        await (await form.clickTypeButton()).option(type).click();
    }
    for (const option of options) {
        await form.values.fillAddTextbox(option);
        await form.values.addTextbox.press('Enter');
    }

    const settings = await addChannelResource(form);
    await settings.setRequiredSwitch(required);
    if (changePolicy) {
        await (await settings.clickChangePolicyButton()).policy(changePolicy).click();
    }
    for (const location of displayLocations) {
        await settings.location(location).check();
    }

    // Saving a new attribute returns to the list
    await app.admin.saveButton.click();
    await expect(app.page).toHaveURL(new RegExp(`${GLOBAL_ATTRIBUTES_ADMIN_PATH}$`));
    return derivedAttributeName(displayName);
}

export async function findChannelField(adminClient: Client4, name: string): Promise<PropertyField | undefined> {
    const fields = await adminClient.getPropertyFields(PROPERTY_GROUP, 'channel', {targetType: 'system', perPage: 200});
    return fields.find((field) => field.name === name && field.delete_at === 0);
}

/** The channel field a console-configured attribute created (its id keys the attribute's testids). */
export async function channelFieldNamed(adminClient: Client4, name: string): Promise<PropertyField> {
    const field = await findChannelField(adminClient, name);
    if (!field) {
        throw new Error(`No channel field named "${name}"`);
    }
    return field;
}

export async function deleteChannelFieldIfExists(adminClient: Client4, name: string) {
    try {
        const field = await findChannelField(adminClient, name);
        if (field) {
            await adminClient.deletePropertyField(PROPERTY_GROUP, 'channel', field.id);
        }
    } catch {
        // May not exist, or the property routes may be unavailable; ignore.
    }
}

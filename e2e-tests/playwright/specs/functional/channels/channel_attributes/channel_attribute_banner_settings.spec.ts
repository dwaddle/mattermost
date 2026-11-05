// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {PropertyField} from '@mattermost/types/properties';

import {expect, Msg, test} from '@mattermost/playwright-lib';

import {
    deleteClassificationFieldsIfExist,
    setupClassificationWithChannelField,
} from '../channel_classification/helpers';

import {
    DISPLAY_BANNER_TOP,
    attributeName,
    createAttribute,
    createChannelForAttributes,
    deleteAttributes,
    optionId,
    purgeAttributes,
    setChannelValue,
} from './helpers';
import {
    bannerToken,
    bannerTokenNames,
    clearBannerText,
    expectBanner,
    insertBannerToken,
    openChannel,
    openChannelSettingsConfiguration,
    removeBannerToken,
    setBannerColor,
    typeBannerText,
} from './surface';

// Written on the generated page objects (through ./surface): Channel Settings' Configuration tab (banner toggle, the
// banner text editor and its attribute tokens by name, the colour input), the save panel, and the channel banner.

const BANNER_COLOR = '#1e325c';
const CUSTOM_COLOR = '#3a7d44';

// The channel-linked classification field is always named this.
const CLASSIFICATION = 'classification';

test.describe('Channel attribute banner settings', {tag: ['@channel_attributes']}, () => {
    test.describe.configure({mode: 'serial'});

    /**
     * @objective Verify the colour picker is locked to the classification colour only while
     * classification is in the banner text, and is the channel's to set once it is removed.
     */
    test('locks the colour to classification only while its token is in the banner', async ({pw}) => {
        await pw.ensureFeatureFlag('ChannelAttributes', true);
        await pw.skipIfNoLicense();

        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();

        try {
            const {channelFieldId, levels} = await setupClassificationWithChannelField(adminClient);
            const level = levels[0];
            await purgeAttributes(adminClient);
            await adminClient.patchPropertyField('access_control', 'channel', channelFieldId, {
                attrs: {actions: [DISPLAY_BANNER_TOP]},
            } as never);

            const channel = await createChannelForAttributes(adminClient, team, `class-colour-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await adminClient.patchPropertyValues('access_control', 'channel', channel.id, [
                {field_id: channelFieldId, value: level.id},
            ] as never);

            const app = await openChannel(pw, adminUser, team, channel);

            let settings = await openChannelSettingsConfiguration(app);
            let configuration = settings.configuration;
            let colorInput = configuration.bannerColor.valueTextbox.locator;

            // * Classification is in the banner, so its colour is authoritative
            await expect((await bannerToken(configuration, CLASSIFICATION)).locator).toBeVisible();
            await expect(colorInput).toBeDisabled();
            await expect(colorInput).toHaveValue(level.color.toUpperCase());

            // # Take classification out of the banner
            await removeBannerToken(configuration, CLASSIFICATION);

            // * Nothing would display, so there is nothing to colour yet
            await expect(colorInput).toBeDisabled();

            // # Author a banner of its own
            await typeBannerText(app, configuration, 'Handle with care');

            // * The colour is the channel's again
            await expect(colorInput).toBeEnabled();
            await setBannerColor(configuration, CUSTOM_COLOR.replace('#', ''));
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * Members see the channel's colour, not the classification's
            await expectBanner(app.center.channelBanner, 'Handle with care', CUSTOM_COLOR);

            // # Put classification back
            settings = await openChannelSettingsConfiguration(app);
            configuration = settings.configuration;
            colorInput = configuration.bannerColor.valueTextbox.locator;
            await expect(colorInput).toBeEnabled();
            await insertBannerToken(configuration, {id: channelFieldId, name: CLASSIFICATION});

            // * The picker locks to the classification colour again
            await expect(colorInput).toBeDisabled();
            await expect(colorInput).toHaveValue(level.color.toUpperCase());
        } finally {
            await deleteClassificationFieldsIfExist(adminClient);
        }
    });

    /**
     * @objective Verify a banner the channel emptied on purpose is not refilled with the
     * designated attributes when it is switched back on.
     */
    test('keeps a deliberately emptied banner empty when it is switched back on', async ({pw}) => {
        await pw.ensureFeatureFlag('ChannelAttributes', true);
        await pw.skipIfNoLicense();

        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('emptied', suffix), {
                options: ['SECRET'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {SECRET: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-emptied-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'SECRET'));

            const app = await openChannel(pw, adminUser, team, channel);

            // # Remove every attribute from the banner and switch it off
            let settings = await openChannelSettingsConfiguration(app);
            let configuration = settings.configuration;
            await expect((await bannerToken(configuration, marking.name)).locator).toBeVisible();
            await clearBannerText(configuration);
            await configuration.setBannerSwitch(false);
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * The emptied text is what was stored
            const stored = await adminClient.getChannel(channel.id);
            expect(stored.banner_info?.text).toBe('');
            expect(stored.banner_info?.enabled).toBe(false);

            // # Switch the banner back on
            settings = await openChannelSettingsConfiguration(app);
            configuration = settings.configuration;
            await configuration.setBannerSwitch(true);

            // * The designated attribute is not seeded back in. Anchored on the
            // * attributes menu: once it is offered the fields have loaded, which is
            // * when seeding would have happened.
            await expect(configuration.bannerText.insertButton.locator).toBeVisible();
            await expect(configuration.bannerTextTextbox.locator).toHaveText('');
            expect(await bannerTokenNames(configuration)).not.toContain(marking.name);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify the unsaved-changes panel comes back for an edit made after a save.
     */
    test('offers to save an edit made after a previous save', async ({pw}) => {
        await pw.ensureFeatureFlag('ChannelAttributes', true);
        await pw.skipIfNoLicense();

        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('resave', suffix), {
                options: ['SECRET'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {SECRET: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-resave-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'SECRET'));

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;
            const unsaved = settings.savePanel.messageText;

            // # Save a first edit, and let the saved notice close. Typed into a cleared
            // # editor: End does not reliably land the caret after a trailing chip.
            await clearBannerText(configuration);
            await typeBannerText(app, configuration, 'first');
            await expect(unsaved).toHaveMessage(Msg.saveChangesPanel.message);
            await settings.savePanel.clickSaveButton();
            await expect(unsaved).not.toHaveMessage(Msg.saveChangesPanel.message);

            // # Edit the text again, then the colour
            await typeBannerText(app, configuration, ' · second');

            // * The tab reports the new edit
            await expect(unsaved).toHaveMessage(Msg.saveChangesPanel.message);
            await settings.savePanel.clickSaveButton();
            await expect(unsaved).not.toHaveMessage(Msg.saveChangesPanel.message);

            await setBannerColor(configuration, CUSTOM_COLOR.replace('#', ''));
            await expect(unsaved).toHaveMessage(Msg.saveChangesPanel.message);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify switching off an attribute-driven banner hides it from the channel,
     * and switching it back on restores it.
     */
    test('hides an attribute-driven banner once it is switched off', async ({pw}) => {
        await pw.ensureFeatureFlag('ChannelAttributes', true);
        await pw.skipIfNoLicense();

        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('switched', suffix), {
                options: ['SECRET'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {SECRET: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-switched-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'SECRET'));

            const app = await openChannel(pw, adminUser, team, channel);

            // * The attribute drives the banner before anyone touches the settings
            await expectBanner(app.center.channelBanner, 'SECRET', BANNER_COLOR);

            // # Switch the banner off
            let settings = await openChannelSettingsConfiguration(app);
            let configuration = settings.configuration;
            await expect(configuration.bannerSwitch.locator).toBeChecked();
            await configuration.setBannerSwitch(false);
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * No banner, and off is what was stored
            await expect(app.center.channelBanner.locator).not.toBeVisible();
            expect((await adminClient.getChannel(channel.id)).banner_info?.enabled).toBe(false);

            // # Switch it back on
            settings = await openChannelSettingsConfiguration(app);
            configuration = settings.configuration;
            await expect(configuration.bannerSwitch.locator).not.toBeChecked();
            await configuration.setBannerSwitch(true);
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * The banner is back. Saving it stores the colour the picker showed, so
            // * only the text is the attribute's.
            await expect(app.center.channelBanner.textText.locator).toHaveText('SECRET');
            expect((await adminClient.getChannel(channel.id)).banner_info?.enabled).toBe(true);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });
});

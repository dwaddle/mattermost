// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {PropertyField} from '@mattermost/types/properties';

import {expect, Msg, test} from '@mattermost/playwright-lib';

import {
    DISPLAY_BANNER_TOP,
    DISPLAY_LABEL_INFO,
    assertNoForeignRequiredAttributes,
    attributeName,
    attributeToken,
    createAttribute,
    createChannelForAttributes,
    deleteAttributes,
    optionId,
    purgeAttributes,
    setChannelValue,
} from './helpers';
import {
    bannerToken,
    clearBannerText,
    expectBanner,
    insertBannerToken,
    openChannel,
    openChannelSettingsConfiguration,
    setBannerColor,
    typeBannerText,
} from './surface';

const BANNER_COLOR = '#1e325c';

test.describe('Channel attribute banner composition', {tag: ['@channel_attributes']}, () => {
    test.describe.configure({mode: 'serial'});

    /**
     * @objective Verify an attribute token can be inserted from Channel Settings and previews its resolved value.
     */
    test('inserts an attribute token from the Attributes menu and previews the resolved text', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();

        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('preview', suffix), {
                options: ['RESTRICTED'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {RESTRICTED: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-preview-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'RESTRICTED'));

            const app = await openChannel(pw, adminUser, team, channel);

            // The composer seeds itself with the banner already on screen, so clear it
            // to author from a known template.
            // # Insert the attribute
            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;
            await configuration.setBannerSwitch(true);
            await clearBannerText(configuration);
            await insertBannerToken(configuration, marking);

            // * The token reads as the attribute's label, not its machine name, and
            // * the preview resolves it to this channel's value
            await expect((await bannerToken(configuration, marking.name)).locator).toBeVisible();
            await expect(configuration.bannerTextTextbox.locator).not.toContainText(attributeToken(marking.name));
            await expect(configuration.bannerPreview.locator).toContainText('RESTRICTED');
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify every banner-designated attribute shares one banner, and that
     * Channel Settings seeds them as removable defaults rather than locked chips.
     */
    test('composes one banner from every designated attribute and offers to remove them', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('multi_marking', suffix), {
                options: ['SECRET'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {SECRET: BANNER_COLOR},
                sortOrder: 1,
            });
            const programme = await createAttribute(adminClient, attributeName('multi_programme', suffix), {
                type: 'text',
                actions: [DISPLAY_BANNER_TOP],
                sortOrder: 2,
            });
            created.push(marking, programme);

            const channel = await createChannelForAttributes(adminClient, team, `banner-multi-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'SECRET'));
            await setChannelValue(adminClient, channel.id, programme, 'AURORA');

            const app = await openChannel(pw, adminUser, team, channel);

            // * Both designated attributes share the one banner, in sort order
            await expect(app.center.channelBanner.textText.locator).toHaveText('SECRET · AURORA');

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;

            // * The composer opens showing what the banner is made of
            await expect((await bannerToken(configuration, marking.name)).locator).toBeVisible();
            await expect((await bannerToken(configuration, programme.name)).locator).toBeVisible();

            // * Designation is a default: either chip can be taken out of the banner
            await expect((await bannerToken(configuration, marking.name)).removeButton.locator).toBeVisible();
            await expect((await bannerToken(configuration, programme.name)).removeButton.locator).toBeVisible();

            // * Seeding those chips is not an edit, so the tab opens clean
            await expect(settings.savePanel.saveButton.locator).toHaveCount(0);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify the banner section reads as enabled when an attribute drives the
     * banner, even though banner_info stays disabled for that channel.
     */
    test('shows the banner section as on when an attribute drives the banner', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('driven', suffix), {
                options: ['SECRET'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {SECRET: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-driven-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'SECRET'));

            const app = await openChannel(pw, adminUser, team, channel);

            // * The channel shows a banner, so its settings must not claim it is off
            await expect(app.center.channelBanner.textText.locator).toContainText('SECRET');

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;

            await expect(configuration.bannerSwitch.locator).toBeChecked();
            await expect(configuration.bannerTextTextbox.locator).toBeVisible();

            // * Opening the tab changes nothing, so it must not offer to save
            await expect(settings.savePanel.saveButton.locator).toHaveCount(0);

            // * The preview still shows what members see, from the value alone
            await expect(configuration.bannerPreview.locator).toContainText('SECRET');

            // * banner_info itself stays disabled: the value is what renders the banner
            const stored = await adminClient.getChannel(channel.id);
            expect(stored.banner_info?.enabled ?? false).toBe(false);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify a banner authored as custom text plus a token renders both in the channel.
     */
    test('saves a banner mixing custom text with a token', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('mixed', suffix), {
                options: ['NOFORN'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {NOFORN: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-mixed-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'NOFORN'));

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;
            await configuration.setBannerSwitch(true);

            await clearBannerText(configuration);
            await typeBannerText(app, configuration, 'Handling: ');
            await insertBannerToken(configuration, marking);
            await setBannerColor(configuration, BANNER_COLOR.replace('#', ''));
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * The channel banner shows the literal and the resolved token together
            await expectBanner(app.center.channelBanner, 'Handling: NOFORN', BANNER_COLOR);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify a separator between two tokens is dropped when one of them has no value.
     */
    test('tidies the separator when one of two tokens is unset', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('tidy_set', suffix), {
                options: ['SECRET'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {SECRET: BANNER_COLOR},
                sortOrder: 0,
            });

            // Deliberately left without a value on this channel.
            const program = await createAttribute(adminClient, attributeName('tidy_unset', suffix), {
                options: ['AURORA'],
                actions: [DISPLAY_LABEL_INFO],
                sortOrder: 1,
            });
            created.push(marking, program);

            const channel = await createChannelForAttributes(adminClient, team, `banner-tidy-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'SECRET'));

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;
            await configuration.setBannerSwitch(true);
            await clearBannerText(configuration);
            await insertBannerToken(configuration, marking);
            await typeBannerText(app, configuration, ' · ');
            await insertBannerToken(configuration, program);

            // * The stranded separator is collapsed, not rendered next to nothing
            await expect(configuration.bannerPreview.locator).toContainText('SECRET');
            await expect(configuration.bannerPreview.locator).not.toContainText('·');

            await setBannerColor(configuration, BANNER_COLOR.replace('#', ''));
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            await expectBanner(app.center.channelBanner, 'SECRET', BANNER_COLOR);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify a template whose tokens are all unset says so rather than previewing a blank line.
     */
    test('says so when every token in the template is unset', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('empty_preview', suffix), {
                options: ['UNUSED'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {UNUSED: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-empty-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;
            await configuration.setBannerSwitch(true);

            // The designated attribute is seeded already; start from a known template.
            await clearBannerText(configuration);
            await insertBannerToken(configuration, marking);

            // * The preview says the banner will not show instead of rendering nothing
            const emptyNotice = configuration.bannerPreview.emptyNotice.locator;
            await expect(emptyNotice).toContainMessage(Msg.channel_attributes.banner.empty_notice.title);
            await expect(configuration.bannerPreview.locator).toHaveCount(0);

            // # Close without saving: the first close warns about the unsaved edit, the second closes
            await settings.clickCloseButton();
            await expect(settings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.message);
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * And no banner is rendered from a template that resolves to nothing
            await expect(app.center.channelBanner.locator).not.toBeVisible();
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify a banner keeps resolving after the attribute's display name changes,
     * because tokens key off the machine name.
     */
    test('keeps resolving after the attribute display name changes', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('renamed', suffix), {
                options: ['ORCON'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {ORCON: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `banner-rename-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'ORCON'));

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;
            await configuration.setBannerSwitch(true);
            await clearBannerText(configuration);
            await insertBannerToken(configuration, marking);
            await setBannerColor(configuration, BANNER_COLOR.replace('#', ''));
            await settings.savePanel.clickSaveButton();
            await settings.clickCloseButton();
            await expect(settings.locator).not.toBeVisible();

            // * Exactly what was authored is persisted, tokens unresolved
            const saved = await adminClient.getChannel(channel.id);
            expect(saved.banner_info?.text).toBe(attributeToken(marking.name));

            await expectBanner(app.center.channelBanner, 'ORCON', BANNER_COLOR);

            // # Rename the attribute as an administrator would
            await adminClient.patchPropertyField('access_control', 'channel', marking.id, {
                attrs: {...marking.attrs, display_name: `Renamed ${suffix}`},
            } as never);

            // * The authored token still resolves, because it keys off the machine name
            await app.page.reload();
            await expect(app.center.postCreate.messageTextbox.locator).toBeVisible();
            await expectBanner(app.center.channelBanner, 'ORCON', BANNER_COLOR);
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify classification is composed as one attribute among many once channel
     * attributes are on, rather than through its own dedicated controls.
     */
    test('treats classification as one attribute among many', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const classification = await createAttribute(adminClient, attributeName('classification', suffix), {
                options: ['SECRET'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {SECRET: BANNER_COLOR},
            });
            created.push(classification);

            const channel = await createChannelForAttributes(adminClient, team, `banner-class-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, classification, optionId(classification, 'SECRET'));

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;

            // * The dedicated classification controls are gone (the tab has loaded: its banner toggle shows)
            await expect(configuration.bannerSwitch.locator).toBeVisible();
            await expect(configuration.classificationSwitch.locator).toHaveCount(0);
            await expect(configuration.classificationLevel.locator).toHaveCount(0);

            // * The same marking is offered as an ordinary banner token instead
            await configuration.setBannerSwitch(true);
            await configuration.bannerText.insertButton.click();
            await expect(configuration.bannerText.insertMenu.attribute(classification).menuItem.locator).toBeVisible();
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify that a non-classification banner attribute leaves the color picker
     * editable and the banner toggle unlocked.
     */
    test('color picker is editable and toggle is unlocked when a non-classification attribute drives the banner', async ({
        pw,
    }) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();
        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const marking = await createAttribute(adminClient, attributeName('colour_editable', suffix), {
                options: ['ORCON'],
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {ORCON: BANNER_COLOR},
            });
            created.push(marking);

            const channel = await createChannelForAttributes(adminClient, team, `colour-editable-${suffix}`);
            await adminClient.addToChannel(adminUser.id, channel.id);
            await setChannelValue(adminClient, channel.id, marking, optionId(marking, 'ORCON'));

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;

            // * Color picker is editable — no classification in the banner
            await expect(configuration.bannerColor.valueTextbox.locator).toBeEnabled();

            // * Toggle is also not locked
            await expect(configuration.bannerSwitch.locator).not.toBeDisabled();
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify that when a required attribute is banner-designated, the banner
     * toggle in Channel Settings is locked and cannot be turned off.
     */
    test('banner toggle is disabled when a required attribute designates the banner', async ({pw}) => {
        await pw.ensureFeatureFlag({ChannelAttributes: true, ChannelAttributesRequired: true});
        await pw.skipIfNoLicense();

        const {adminClient, adminUser, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);
            await assertNoForeignRequiredAttributes(adminClient);

            const marker = await createAttribute(adminClient, attributeName('req_banner', suffix), {
                options: ['RESTRICTED'],
                required: true,
                actions: [DISPLAY_BANNER_TOP],
                optionColors: {RESTRICTED: BANNER_COLOR},
            });
            created.push(marker);

            // Required attributes must be seeded at channel creation time
            const channel = await createChannelForAttributes(adminClient, team, `req-banner-${suffix}`, undefined, [
                {field_id: marker.id, value: optionId(marker, 'RESTRICTED')},
            ]);
            await adminClient.addToChannel(adminUser.id, channel.id);

            const app = await openChannel(pw, adminUser, team, channel);

            const settings = await openChannelSettingsConfiguration(app);
            const configuration = settings.configuration;

            // * Toggle is locked — a required attribute mandates the banner
            await expect(configuration.bannerSwitch.locator).toBeDisabled();
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * Channel Classification E2E tests.
 * Tests the classification level assignment feature on both new and existing channels.
 *
 * Prerequisites: Enterprise-tier license + ClassificationMarkings feature flag enabled.
 */

import {expect, test, getAdminClient, licenseTier, duration} from '@mattermost/playwright-lib';
import type {App, generated, PlaywrightExtended} from '@mattermost/playwright-lib';

import {setupClassificationWithChannelField, deleteClassificationFieldsIfExist} from './helpers';
import type {ClassificationLevel} from './helpers';

let classificationLevels: ClassificationLevel[] = [];
let setupComplete = false;

// Teams created by pw.initSetup() in each test are tracked here and deleted in
// afterEach so local environments don't accumulate stale teams across runs.
const createdTeamIds: string[] = [];

async function initSetupTracked(pw: PlaywrightExtended) {
    const setup = await pw.initSetup();
    createdTeamIds.push(setup.team.id);
    return setup;
}

test.afterAll(async () => {
    if (!setupComplete) {
        return;
    }
    const {adminClient} = await getAdminClient();
    try {
        await deleteClassificationFieldsIfExist(adminClient);
    } catch {
        // Best-effort cleanup
    }
});

test.beforeEach(async ({pw}) => {
    await pw.ensureFeatureFlag({ChannelAttributes: false, ClassificationMarkings: true});
    const {adminClient} = await getAdminClient();
    const license = await adminClient.getClientLicenseOld();
    test.skip(licenseTier(license.SkuShortName) < 20, 'Channel classification requires Enterprise-tier license');

    if (!setupComplete) {
        const setup = await setupClassificationWithChannelField(adminClient);
        classificationLevels = setup.levels;
        setupComplete = true;
    }
});

test.afterEach(async () => {
    if (createdTeamIds.length === 0) {
        return;
    }
    const ids = createdTeamIds.splice(0);
    try {
        const {adminClient} = await getAdminClient({skipLog: true});
        await Promise.allSettled(ids.map((id) => adminClient.deleteTeam(id)));
    } catch {
        // Best-effort cleanup
    }
});

/** A classification level from the template, by name. */
function level(name: string) {
    const found = classificationLevels.find((l) => l.name === name);
    expect(found).toBeDefined();
    return found!;
}

/** Logs in as an admin and opens a team. */
async function openTeam(pw: PlaywrightExtended) {
    const {adminUser, team} = await initSetupTracked(pw);
    const {app} = await pw.testBrowser.login(adminUser);
    await app.teamPage.goto({team});
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible({timeout: duration.one_min});
    return app;
}

/** Opens the new channel dialog from the sidebar's browse-or-add menu, and names the channel. */
async function openNewChannel(pw: PlaywrightExtended, app: App, prefix: string) {
    const modal = await (await app.lhs.header.clickOpenBrowseOrAddMenuButton()).clickCreateChannelMenuItem();
    await expect(modal.nameTextbox.locator).toBeVisible();
    await modal.fillNameTextbox(`${prefix}-${pw.random.id()}`);
    return modal;
}

/** Creates a channel as an admin, logs in and opens it, and opens Channel Settings > Configuration. */
async function openConfigurationOfNewChannel(pw: PlaywrightExtended) {
    const {adminUser, team, adminClient} = await initSetupTracked(pw);

    const channel = await adminClient.createChannel(
        pw.random.channel({teamId: team.id, name: `cls-${pw.random.id()}`, displayName: `Cls ${pw.random.id()}`}),
    );
    await adminClient.addToChannel(adminUser.id, channel.id);

    const {app} = await pw.testBrowser.login(adminUser);
    await app.channelsPage.goto({team, channel: channel.name});
    await expect(app.center.postCreate.messageTextbox.locator).toBeVisible({timeout: duration.one_min});

    const settings = await (await app.channelHeader.clickOpenMenuButton()).clickChannelSettingsMenuItem();
    await settings.tabs.configurationTab.select();
    await expect(settings.tabs.configurationTab.locator).toHaveAttribute('aria-selected', 'true');
    return {adminClient, app, channel, settings};
}

/** Opens a classification dropdown and picks a level. */
async function pickLevel(dropdown: generated.DropdownInput, picked: {id: string}) {
    await dropdown.locator.click();
    await dropdown.menu.option(picked.id).select();
}

/** Saves the open Channel Settings tab and waits for the save panel to settle. */
async function save(settings: generated.ChannelSettingsModal) {
    await settings.savePanel.clickSaveButton();
    await expect(settings.savePanel.saveButton.locator).not.toBeVisible();
}

test.describe('Channel Classification - New channel creation', () => {
    test('Enabling classification toggle without selecting values prevents channel creation', async ({pw}) => {
        const app = await openTeam(pw);
        const modal = await openNewChannel(pw, app, 'test');
        await modal.type.publicButton.click();

        // Create button should be enabled before toggling classification
        await expect(modal.confirmButton.locator).toBeEnabled();

        // Enable classification toggle
        await modal.classificationSwitch.toggle();

        // Create button should be disabled (no classification level selected, no banner text)
        await expect(modal.confirmButton.locator).toBeDisabled();
    });

    test('Classification dropdown displays the correct levels from the template', async ({pw}) => {
        const app = await openTeam(pw);
        const modal = await openNewChannel(pw, app, 'test');

        // Enable classification toggle
        await modal.classificationSwitch.toggle();

        // Open the classification dropdown
        await modal.classificationLevel.locator.click();

        // Verify all test levels are present in the dropdown menu
        const {menu} = modal.classificationLevel;
        await expect(menu.optionItems.first()).toBeVisible();
        for (const l of classificationLevels) {
            await expect(menu.option(l.id).locator).toHaveText(l.name);
        }
    });

    test('User can append text to the Banner Text field after selecting a classification', async ({pw}) => {
        const app = await openTeam(pw);
        const selectedLevel = level('SECRET');
        const modal = await openNewChannel(pw, app, 'test');

        // Enable classification toggle
        await modal.classificationSwitch.toggle();

        // Select a classification level
        await pickLevel(modal.classificationLevel, selectedLevel);

        // Banner text should be auto-populated with the bold level name
        const bannerTextbox = modal.classificationBannerTextTextbox.locator;
        await expect(bannerTextbox).toBeVisible();
        expect(await bannerTextbox.inputValue()).toContain(selectedLevel.name);

        // Append custom text to the banner
        await bannerTextbox.click();
        await bannerTextbox.press('End');
        await bannerTextbox.pressSequentially(' - Custom suffix');

        expect(await bannerTextbox.inputValue()).toContain('Custom suffix');
    });

    test('Creating channel with classification shows banner with correct color', async ({pw}) => {
        const app = await openTeam(pw);
        const selectedLevel = level('SECRET');
        const modal = await openNewChannel(pw, app, 'classified');
        await modal.type.publicButton.click();

        // Enable classification toggle
        await modal.classificationSwitch.toggle();

        // Select the classification level
        await pickLevel(modal.classificationLevel, selectedLevel);

        // Wait for banner text to auto-populate, then create the channel
        const bannerTextbox = modal.classificationBannerTextTextbox.locator;
        await expect(bannerTextbox).toBeVisible();
        await expect(bannerTextbox).not.toHaveValue('');

        await modal.clickConfirmButton();

        // Should be redirected to the new channel and center view loads
        await expect(app.page).toHaveURL(/\/channels\//, {timeout: duration.half_min});
        await expect(app.center.postCreate.messageTextbox.locator).toBeVisible({timeout: duration.half_min});

        // Channel banner should be visible (allow extra time for property value fetch)
        const banner = app.center.channelBanner.locator;
        await expect(banner).toBeVisible({timeout: duration.half_min});

        // Verify the banner has the correct background color
        await expect(banner).toHaveCSS('background-color', hexToRgb(selectedLevel.color));

        // Verify the banner contains the classification level name (rendered from **SECRET** markdown)
        await expect(banner).toContainText(selectedLevel.name);
    });
});

test.describe('Channel Classification - Existing channel settings', () => {
    test('Classification toggle can be enabled from channel settings', async ({pw}) => {
        const {settings} = await openConfigurationOfNewChannel(pw);

        // The classification toggle should be available
        const classificationToggle = settings.configuration.classificationSwitch;
        await expect(classificationToggle.locator).toBeVisible();

        // Toggle it on
        await classificationToggle.turnOn();

        // Toggle should now be active
        await expect(classificationToggle.locator).toBeChecked();
    });

    test('Classification level can be set once toggle is enabled', async ({pw}) => {
        const {settings} = await openConfigurationOfNewChannel(pw);
        const {configuration} = settings;

        // Enable classification toggle
        await configuration.classificationSwitch.toggle();

        // Classification level dropdown should be visible
        const dropdown = configuration.classificationLevel;
        await expect(dropdown.locator).toBeVisible();

        // Open dropdown and select a level
        await dropdown.locator.click();
        await expect(dropdown.menu.optionItems.first()).toBeVisible();

        const selectedLevel = level('CONFIDENTIAL');
        await dropdown.menu.option(selectedLevel.id).select();

        // The dropdown should now show the selected value
        await expect(dropdown.locator).toContainText(selectedLevel.name);
    });

    test('Selecting classification locks banner toggle active and disabled, with matching color', async ({pw}) => {
        const {settings} = await openConfigurationOfNewChannel(pw);
        const {configuration} = settings;

        // Enable classification and select a level
        await configuration.classificationSwitch.toggle();
        const selectedLevel = level('SECRET');
        await pickLevel(configuration.classificationLevel, selectedLevel);

        // The channel banner toggle should now be forced active and disabled
        const bannerToggle = configuration.bannerSwitch.locator;
        await expect(bannerToggle).toBeVisible();
        await expect(bannerToggle).toBeChecked();
        await expect(bannerToggle).toBeDisabled();

        // Banner color input should be locked to the classification color
        const colorInput = configuration.bannerColor.valueTextbox.locator;
        await expect(colorInput).toBeVisible();
        const colorValue = await colorInput.inputValue();
        expect(colorValue.toLowerCase().replace('#', '')).toBe(selectedLevel.color.toLowerCase().replace('#', ''));
    });

    test('Disabling classification with a custom banner color preserves it server-side, and re-enabling restores the Save button', async ({
        pw,
    }) => {
        const {adminClient, channel, settings} = await openConfigurationOfNewChannel(pw);
        const {configuration} = settings;

        // Step 1: enable classification, select a level, save
        const classificationToggle = configuration.classificationSwitch;
        await classificationToggle.toggle();
        await pickLevel(configuration.classificationLevel, level('SECRET'));
        await save(settings);

        // Step 2: in the same open modal, disable classification, enable a manual banner,
        // set a custom color, save. The manual banner toggle is needed because master no
        // longer auto-enables banner_info.enabled when classification is on, so the banner
        // section body (and its color input) is hidden after toggling classification off
        // until a manual banner is enabled.
        await classificationToggle.toggle();
        await configuration.bannerSwitch.turnOn();
        const customColor = 'aa00aa';
        const colorInput = configuration.bannerColor.valueTextbox.locator;
        await colorInput.fill(customColor);
        expect((await colorInput.inputValue()).replace('#', '')).toBe(customColor);
        await save(settings);

        // Symptom 1 guard: color input reflects what we typed and the server persisted the custom color
        await expect(colorInput).toHaveValue(`#${customColor}`);
        const persisted = await adminClient.getChannel(channel.id);
        expect(persisted.banner_info?.background_color?.toLowerCase().replace('#', '')).toBe(customColor);

        // Symptom 2 guard: re-enable classification → Save button reappears (panel transitions out of 'saved')
        await classificationToggle.toggle();
        const saveButton = settings.savePanel.saveButton.locator;
        await expect(saveButton).toBeVisible();
        await expect(saveButton).toBeEnabled();

        await settings.clickCloseButton();
    });

    test('Editing banner text and saving updates the banner in real time', async ({pw}) => {
        const {app, settings} = await openConfigurationOfNewChannel(pw);
        const {configuration} = settings;

        // Enable classification and select a level
        await configuration.classificationSwitch.toggle();
        const selectedLevel = level('TOP SECRET');
        await pickLevel(configuration.classificationLevel, selectedLevel);

        // Edit the banner text to a custom value
        const customBannerText = 'TOP SECRET - Handle via COMINT channels only';
        await expect(configuration.bannerTextTextbox.locator).toBeVisible();
        await configuration.fillBannerTextTextbox(customBannerText);

        // Save the changes
        await save(settings);
        await settings.clickCloseButton();

        // The channel banner should now show the custom text with the classification color
        const banner = app.center.channelBanner.locator;
        await expect(banner).toBeVisible({timeout: duration.half_min});
        await expect(banner).toContainText(customBannerText);
        await expect(banner).toHaveCSS('background-color', hexToRgb(selectedLevel.color));
    });
});

function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    if (!result) {
        return hex;
    }
    return `rgb(${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)})`;
}

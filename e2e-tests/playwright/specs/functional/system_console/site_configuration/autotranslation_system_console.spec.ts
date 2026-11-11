// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * System Console autotranslation settings (Site Configuration -> Localization).
 * AT-SC-01: Without EA license, feature discovery is shown.
 * AT-SC-02: With EA license, Auto-translation toggle is visible and off by default.
 * AT-SC-03: Enabling the system toggle expands provider and target language configuration.
 * AT-SC-05: Selecting LibreTranslate shows endpoint and API key fields.
 * AT-SC-07: Target languages multi-select is visible and usable.
 */

import {expect, test, hasAutotranslationLicense, type App, Msg} from '@mattermost/playwright-lib';

/** Opens System Console > Site Configuration > Localization through the sidebar. */
async function openLocalization(app: App) {
    await app.adminConsolePage.goto();
    await app.admin.sidebar.category('site').section('localization').clickTitleLink();
    await expect(app.page).toHaveURL(/\/admin_console\/site_config\/localization/);
}

/**
 * The section's enable switch. It's compass AdminPanel's built-in header switch, which takes no testid, so it's
 * the one switch in the generated header.
 */
function enableSwitch(app: App) {
    return app.admin.autoTranslation.header.locator.getByRole('switch');
}

/** Opens Localization and turns auto-translation on (staged, not saved). */
async function openWithAutoTranslation(app: App) {
    await openLocalization(app);
    const at = app.admin.autoTranslation;
    // compass's switch input is hidden under a sibling <label for>, which takes the pointer: click the input itself
    await enableSwitch(app).dispatchEvent('click');
    await expect(enableSwitch(app)).toBeChecked();
    return at;
}

test.describe('System Console - Autotranslation (Localization)', () => {
    test(
        'without EA license, auto-translation shows feature discovery block',
        {
            tag: ['@autotranslation', '@system_console'],
        },
        async ({pw}) => {
            const {adminUser, adminClient} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - this test requires non-Entry/Advanced license to see feature discovery',
            );

            const {app} = await pw.testBrowser.login(adminUser);

            await openLocalization(app);

            // * The feature discovery block shows instead of the auto-translation settings
            await expect(app.admin.featureDiscovery.locator).toContainMessage(
                Msg.admin.auto_translation_feature_discovery.title,
            );
            await expect(app.admin.autoTranslation.header.locator).not.toBeVisible();
        },
    );

    test(
        'with EA license, Auto-translation toggle is visible and off by default',
        {
            tag: ['@autotranslation', '@system_console'],
        },
        async ({pw}) => {
            const {adminUser, adminClient} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            const {app} = await pw.testBrowser.login(adminUser);

            await openLocalization(app);

            // * The auto-translation section shows, with its toggle off
            const at = app.admin.autoTranslation;
            await expect(at.header.locator).toBeVisible();
            await expect(enableSwitch(app)).not.toBeChecked();
        },
    );

    test(
        'enabling system toggle expands provider and target language configuration',
        {
            tag: ['@autotranslation', '@system_console'],
        },
        async ({pw}) => {
            const {adminUser, adminClient} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            const {app} = await pw.testBrowser.login(adminUser);

            const at = await openWithAutoTranslation(app);

            // * The provider and target language settings show
            await expect(at.providerCombobox.locator).toBeVisible();
            await expect(app.admin.setting('TargetLanguages').valuesCombobox.locator).toBeVisible();
        },
    );

    test(
        'selecting LibreTranslate shows endpoint and API key fields',
        {
            tag: ['@autotranslation', '@system_console'],
        },
        async ({pw}) => {
            const {adminUser, adminClient} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            const {app} = await pw.testBrowser.login(adminUser);

            const at = await openWithAutoTranslation(app);
            await at.chooseProviderCombobox('LibreTranslate');

            // * The LibreTranslate endpoint and API key fields show, with the API key docs linked
            await expect(app.admin.setting('URL').valueTextbox.locator).toBeVisible();
            await expect(app.admin.setting('APIKey').valueTextbox.locator).toBeVisible();
            await expect(app.admin.setting('APIKey').helpText.locator).toContainText(/LibreTranslate docs/i);
        },
    );

    test(
        'selecting Mattermost Agents hides LibreTranslate fields and shows plugin guidance',
        {
            tag: ['@autotranslation', '@system_console'],
        },
        async ({pw}) => {
            const {adminUser, adminClient} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            const {app} = await pw.testBrowser.login(adminUser);

            // # Open Localization, turn auto-translation on and switch the provider to Mattermost Agents
            const at = await openWithAutoTranslation(app);
            await at.chooseProviderCombobox('Mattermost Agents');

            // * Verify Mattermost Agents guidance is shown for the inactive plugin
            await expect(at.agentsErrorText.locator).toBeVisible();
            await expect(at.agentsConfigLink.locator).toBeVisible();
            await expect(at.agentsConfigLink.locator).toHaveHrefPath('/admin_console/plugins/plugin_mattermost-ai');

            // * Verify LibreTranslate-specific inputs are hidden for the Mattermost Agents provider
            await expect(app.admin.setting('URL').valueTextbox.locator).not.toBeVisible();
            await expect(app.admin.setting('APIKey').valueTextbox.locator).not.toBeVisible();
        },
    );

    test(
        'admin can select multiple target languages',
        {
            tag: ['@autotranslation', '@system_console'],
        },
        async ({pw}) => {
            const {adminUser, adminClient} = await pw.initSetup();

            const license = await adminClient.getClientLicenseOld();
            test.skip(
                !hasAutotranslationLicense(license.SkuShortName),
                'Skipping test - server does not have Entry or Advanced license',
            );

            const {app} = await pw.testBrowser.login(adminUser);

            await openWithAutoTranslation(app);
            const languages = app.admin.setting('TargetLanguages');

            // * The target languages setting shows
            await expect(languages.valuesCombobox.locator).toBeVisible();
            await expect(languages.locator).toContainMessage(Msg.admin.site.localization.targetLanguagesTitle);

            // # Choose Spanish and French (the list closes after each choice)
            await languages.valuesCombobox.choose(/Español/);
            await languages.valuesCombobox.choose(/Français/);
            await languages.valuesCombobox.press('Escape');

            // * Both are chosen: each has its remove button
            await expect(languages.remove('es').locator).toBeVisible();
            await expect(languages.remove('fr').locator).toBeVisible();
        },
    );
});

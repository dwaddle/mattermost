// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {expect, generated, type App} from '@mattermost/playwright-lib';

/** A True/False setting on the page. */
class RadioSetting {
    constructor(private readonly setting: generated.AdminSetting) {}

    get trueOption(): Locator {
        return this.setting.trueRadio.locator;
    }

    get falseOption(): Locator {
        return this.setting.falseRadio.locator;
    }

    async selectTrue() {
        await this.trueOption.check();
    }

    async selectFalse() {
        await this.falseOption.check();
    }

    async toBeTrue() {
        await expect(this.trueOption).toBeChecked();
    }

    async toBeFalse() {
        await expect(this.falseOption).toBeChecked();
    }
}

/** A text or number setting on the page. */
class InputSetting {
    constructor(readonly input: Locator) {}

    async fill(value: string) {
        await this.input.fill(value);
    }

    async getValue(): Promise<string> {
        return (await this.input.inputValue()) ?? '';
    }

    async clear() {
        await this.input.clear();
    }
}

/** A dropdown setting on the page. */
class DropdownSetting {
    constructor(readonly dropdown: Locator) {}

    async select(option: string) {
        await this.dropdown.selectOption(option);
    }

    async getSelectedValue(): Promise<string> {
        return (await this.dropdown.inputValue()) ?? '';
    }
}

/** System Console > Environment > Mobile Security on the generated page objects, by setting. */
export class MobileSecurity {
    readonly enableBiometricAuthentication: RadioSetting;
    readonly preventScreenCapture: RadioSetting;
    readonly enableJailbreakProtection: RadioSetting;
    readonly enableSecureFilePreviewMode: RadioSetting;
    readonly allowPdfLinkNavigation: RadioSetting;
    readonly enableIntuneMAM: RadioSetting;
    readonly authProvider: DropdownSetting;
    readonly tenantId: InputSetting;
    readonly clientId: InputSetting;
    readonly enableMobileEphemeralMode: RadioSetting;
    readonly disconnectionTimeout: InputSetting;
    readonly offlinePersistenceTimer: InputSetting;
    readonly autoCacheCleanup: InputSetting;

    constructor(private readonly app: App) {
        const setting = app.admin.setting.bind(app.admin);
        this.enableBiometricAuthentication = new RadioSetting(setting('NativeAppSettings.MobileEnableBiometrics'));
        this.preventScreenCapture = new RadioSetting(setting('NativeAppSettings.MobilePreventScreenCapture'));
        this.enableJailbreakProtection = new RadioSetting(setting('NativeAppSettings.MobileJailbreakProtection'));
        this.enableSecureFilePreviewMode = new RadioSetting(setting('NativeAppSettings.MobileEnableSecureFilePreview'));
        this.allowPdfLinkNavigation = new RadioSetting(setting('NativeAppSettings.MobileAllowPdfLinkNavigation'));
        this.enableIntuneMAM = new RadioSetting(setting('IntuneSettings.Enable'));
        this.authProvider = new DropdownSetting(setting('IntuneSettings.AuthService').valueCombobox.locator);
        this.tenantId = new InputSetting(setting('IntuneSettings.TenantId').valueTextbox.locator);
        this.clientId = new InputSetting(setting('IntuneSettings.ClientId').valueTextbox.locator);
        this.enableMobileEphemeralMode = new RadioSetting(setting('MobileEphemeralModeSettings.Enable'));
        this.disconnectionTimeout = new InputSetting(
            setting('MobileEphemeralModeSettings.DisconnectionTimeoutSeconds').valueSpinButton.locator,
        );
        this.offlinePersistenceTimer = new InputSetting(
            setting('MobileEphemeralModeSettings.OfflinePersistenceTimerHours').valueSpinButton.locator,
        );
        this.autoCacheCleanup = new InputSetting(
            setting('MobileEphemeralModeSettings.AutoCacheCleanupDays').valueSpinButton.locator,
        );
    }

    get saveButton(): Locator {
        return this.app.admin.saveButton.locator;
    }

    get errorMessage(): Locator {
        return this.app.admin.saveError.locator;
    }

    private async goto() {
        await this.app.page.goto(`${generated.AdminConsolePage.path()}/environment/mobile_security`);
    }

    /** Opens the page, once its settings show. */
    async open() {
        await this.goto();
        await expect(this.saveButton).toBeVisible();
    }

    /** Opens the page without a license for it: the upsell. */
    async openUpsell() {
        await this.goto();
        await expect(this.app.admin.featureDiscovery.titleText.locator).toBeVisible();
    }

    /** Opens another page (Users), to come back to this one. */
    async openUsers() {
        await this.app.page.goto(`${generated.AdminConsolePage.path()}/user_management/users`);
        await expect(this.app.admin.users.table.rowItems.first()).toBeVisible();
    }

    async save() {
        await this.app.admin.clickSaveButton();
    }
}

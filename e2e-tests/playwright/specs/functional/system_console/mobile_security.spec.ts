// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test, testConfig} from '@mattermost/playwright-lib';

import {MobileSecurity} from './mobile_security_support';

test('should be able to enable mobile security settings when licensed', async ({pw}) => {
    const {adminUser, adminClient} = await pw.initSetup();

    const license = await adminClient.getClientLicenseOld();

    test.skip(
        license.SkuShortName !== 'enterprise' && license.SkuShortName !== 'advanced',
        'Skipping test - server has no enterprise or enterprise advanced license',
    );

    if (!adminUser) {
        throw new Error('Failed to create admin user');
    }

    // # Log in as admin
    const {app} = await pw.testBrowser.login(adminUser);
    const security = new MobileSecurity(app);

    // # Go to Mobile Security section
    await security.open();

    // # Enable Biometric Authentication
    await security.enableBiometricAuthentication.selectTrue();

    // * Verify only Biometric Authentication is enabled
    await security.enableBiometricAuthentication.toBeTrue();
    await security.preventScreenCapture.toBeFalse();
    await security.enableJailbreakProtection.toBeFalse();

    // # Save settings
    await security.save();
    // # Wait until the save button has settled
    await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

    // # Go to any other section and come back to Mobile Security
    await security.openUsers();

    await security.open();

    // * Verify Biometric Authentication is still enabled
    await security.enableBiometricAuthentication.toBeTrue();
    await security.preventScreenCapture.toBeFalse();
    await security.enableJailbreakProtection.toBeFalse();

    // # Enable Prevent Screen Capture
    await security.preventScreenCapture.selectTrue();

    // * Verify only Biometric Authentication and Prevent Screen Capture are enabled
    await security.enableBiometricAuthentication.toBeTrue();
    await security.preventScreenCapture.toBeTrue();
    await security.enableJailbreakProtection.toBeFalse();

    // # Save settings
    await security.save();
    // # Wait until the save button has settled
    await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

    // # Go to any other section and come back to Mobile Security
    await security.openUsers();

    await security.open();

    // * Verify Biometric Authentication and Prevent Screen Capture are still enabled
    await security.enableBiometricAuthentication.toBeTrue();
    await security.preventScreenCapture.toBeTrue();
    await security.enableJailbreakProtection.toBeFalse();

    // # Enable Jailbreak Protection
    await security.enableJailbreakProtection.selectTrue();

    // * Verify all toggles are enabled
    await security.enableBiometricAuthentication.toBeTrue();
    await security.preventScreenCapture.toBeTrue();
    await security.enableJailbreakProtection.toBeTrue();

    // # Save settings
    await security.save();
    // # Wait until the save button has settled
    await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

    // # Go to any other section and come back to Mobile Security
    await security.openUsers();

    await security.open();

    // * Verify all toggles are still enabled
    await security.enableBiometricAuthentication.toBeTrue();
    await security.preventScreenCapture.toBeTrue();
    await security.enableJailbreakProtection.toBeTrue();

    if (license.SkuShortName === 'advanced') {
        // # Enable Secure File Preview
        await security.enableSecureFilePreviewMode.selectTrue();

        // * Verify all toggles are enabled
        await security.enableBiometricAuthentication.toBeTrue();
        await security.preventScreenCapture.toBeTrue();
        await security.enableJailbreakProtection.toBeTrue();
        await security.enableSecureFilePreviewMode.toBeTrue();
        await security.allowPdfLinkNavigation.toBeFalse();

        // # Save settings
        await security.save();
        // # Wait until the save button has settled
        await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

        // # Go to any other section and come back to Mobile Security
        await security.openUsers();
        await security.open();

        // * Verify all toggles are still enabled
        await security.enableBiometricAuthentication.toBeTrue();
        await security.preventScreenCapture.toBeTrue();
        await security.enableJailbreakProtection.toBeTrue();
        await security.enableSecureFilePreviewMode.toBeTrue();
        await security.allowPdfLinkNavigation.toBeFalse();

        // # Enable Allow PDF Link Navigation
        await security.allowPdfLinkNavigation.selectTrue();

        // * Verify all toggles are enabled
        await security.enableBiometricAuthentication.toBeTrue();
        await security.preventScreenCapture.toBeTrue();
        await security.enableJailbreakProtection.toBeTrue();
        await security.enableSecureFilePreviewMode.toBeTrue();
        await security.allowPdfLinkNavigation.toBeTrue();

        // # Save settings
        await security.save();
        // # Wait until the save button has settled
        await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

        // # Go to any other section and come back to Mobile Security
        await security.openUsers();
        await security.open();

        // * Verify all toggles are still enabled
        await security.enableBiometricAuthentication.toBeTrue();
        await security.preventScreenCapture.toBeTrue();
        await security.enableJailbreakProtection.toBeTrue();
        await security.enableSecureFilePreviewMode.toBeTrue();
        await security.allowPdfLinkNavigation.toBeTrue();
    }
});

test('should show mobile security upsell when not licensed', async ({pw}) => {
    const {adminUser, adminClient} = await pw.initSetup();

    const license = await adminClient.getClientLicenseOld();

    // the upsell shows below Enterprise
    test.skip(
        license.SkuShortName === 'enterprise' || license.SkuShortName === 'advanced',
        'Skipping test - server has an enterprise or enterprise advanced license, so no upsell',
    );

    if (!adminUser) {
        throw new Error('Failed to create admin user');
    }

    // # Log in as admin
    const {app} = await pw.testBrowser.login(adminUser);
    const security = new MobileSecurity(app);

    // # Go to Mobile Security section
    await security.openUpsell();

    // * Verify title is correct
    await expect(app.admin.featureDiscovery.titleText.locator).toContainText(
        'Enhance mobile app security with Mattermost Enterprise',
    );
});

test('should show and enable Intune MAM when Enterprise Advanced licensed and Office365 configured', async ({pw}) => {
    const {adminUser, adminClient} = await pw.initSetup();

    const license = await adminClient.getClientLicenseOld();

    test.skip(license.SkuShortName !== 'advanced', 'Skipping test - server does not have enterprise advanced license');

    if (!adminUser) {
        throw new Error('Failed to create admin user');
    }

    // # Configure Office365 settings
    await adminClient.patchConfig({
        Office365Settings: {
            Enable: true,
            Id: 'test-client-id',
            Secret: 'test-client-secret',
            DirectoryId: 'test-directory-id',
        },
    } as any);

    // # Log in as admin
    const {app} = await pw.testBrowser.login(adminUser);
    const security = new MobileSecurity(app);

    // # Go to Mobile Security section
    await security.open();

    // * Verify Intune MAM toggle is visible
    await expect(security.enableIntuneMAM.trueOption).toBeVisible();
    await expect(security.enableIntuneMAM.falseOption).toBeVisible();

    // # Enable Intune MAM
    await security.enableIntuneMAM.selectTrue();

    // * Verify Intune MAM is enabled
    await security.enableIntuneMAM.toBeTrue();

    await security.authProvider.select('office365');

    // # Fill in Intune configuration
    await security.tenantId.fill('12345678-1234-1234-1234-123456789012');
    await security.clientId.fill('87654321-4321-4321-4321-210987654321');

    // # Save settings
    await security.save();

    // # Wait until the save button has settled
    await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

    // # Go to any other section and come back to Mobile Security
    await security.openUsers();

    await security.open();

    // * Verify Intune MAM is still enabled
    await security.enableIntuneMAM.toBeTrue();
});

test('should hide Intune MAM when Office365 is not configured', async ({pw}) => {
    const {adminUser, adminClient} = await pw.initSetup();

    const license = await adminClient.getClientLicenseOld();

    test.skip(license.SkuShortName !== 'advanced', 'Skipping test - server does not have enterprise advanced license');

    if (!adminUser) {
        throw new Error('Failed to create admin user');
    }

    // # Disable Office365, and Intune MAM in the same patch — the server rejects a config where
    // # Intune MAM is on with AuthService 'office365' but Office365 is off
    await adminClient.patchConfig({
        IntuneSettings: {
            Enable: false,
        },
        Office365Settings: {
            Enable: false,
        },
    } as any);

    // # Log in as admin
    const {app} = await pw.testBrowser.login(adminUser);
    const security = new MobileSecurity(app);

    // # Go to Mobile Security section
    await security.open();

    // * Verify Intune MAM toggle is visible
    await expect(security.enableIntuneMAM.trueOption).toBeVisible();
    await expect(security.enableIntuneMAM.falseOption).toBeVisible();
    await expect(security.authProvider.dropdown).toBeDisabled();
});

test('should configure new IntuneSettings with Office365 auth provider', async ({pw}) => {
    const {adminUser, adminClient} = await pw.initSetup();

    const license = await adminClient.getClientLicenseOld();

    test.skip(license.SkuShortName !== 'advanced', 'Skipping test - server does not have enterprise advanced license');

    if (!adminUser) {
        throw new Error('Failed to create admin user');
    }

    // # Configure Office365 settings
    await adminClient.patchConfig({
        Office365Settings: {
            Enable: true,
            Id: 'test-office365-client-id',
            Secret: 'test-office365-secret',
            DirectoryId: 'test-office365-directory-id',
        },
        SamlSettings: {
            EmailAttribute: 'useremail',
        },
    } as any);
    await pw.waitUntil(async () => {
        const cfg = await adminClient.getConfig();
        return cfg.Office365Settings?.Enable === true && Boolean(cfg.Office365Settings?.Id);
    });

    // # Log in as admin
    const {app} = await pw.testBrowser.login(adminUser);
    const security = new MobileSecurity(app);

    // # Go to Mobile Security section
    await security.open();

    // * Verify new Intune toggle is visible
    await expect(security.enableIntuneMAM.trueOption).toBeVisible();
    await expect(security.enableIntuneMAM.falseOption).toBeVisible();

    // # Enable Intune
    await security.enableIntuneMAM.selectTrue();

    // * Verify Intune is enabled
    await security.enableIntuneMAM.toBeTrue();

    // # Select Office365 as auth provider.
    // After enabling Intune MAM the form re-renders; scroll the dropdown into view
    // before selecting so it is both visible and interactive.
    await security.authProvider.dropdown.scrollIntoViewIfNeeded();
    await expect(security.authProvider.dropdown).toBeEnabled({timeout: 15000});
    await security.authProvider.select('office365');

    // # Fill in Intune configuration
    await security.tenantId.fill('12345678-1234-1234-1234-123456789012');
    await security.clientId.fill('87654321-4321-4321-4321-210987654321');

    // # Save settings
    await security.save();

    // # Wait until the save button has settled
    await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

    // # Go to any other section and come back to Mobile Security
    await security.openUsers();

    await security.open();

    // * Verify Intune is still enabled and configured
    await security.enableIntuneMAM.toBeTrue();
    expect(await security.tenantId.getValue()).toBe('12345678-1234-1234-1234-123456789012');
    expect(await security.clientId.getValue()).toBe('87654321-4321-4321-4321-210987654321');
});

test('should configure new IntuneSettings with SAML auth provider', async ({pw}) => {
    // # Configure SAML settings
    const {adminUser, adminClient} = await pw.initSetup();
    const license = await adminClient.getClientLicenseOld();

    test.skip(license.SkuShortName !== 'advanced', 'Skipping test - server does not have enterprise advanced license');

    if (!adminUser) {
        throw new Error('Failed to create admin user');
    }

    // # Set server URL for fetch calls
    const serverUrl = testConfig.baseURL;

    // # Upload a valid SAML IdP certificate using fetch
    const idpCert =
        '-----BEGIN CERTIFICATE-----\nMIIDXTCCAkWgAwIBAgIJAKC1r6Qw3v6OMA0GCSqGSIb3DQEBCwUAMEUxCzAJBgNVBAYTAlVTMRYwFAYDVQQIDA1Tb21lLVN0YXRlMRYwFAYDVQQKDA1FeGFtcGxlIEluYy4wHhcNMTkwMTAxMDAwMDAwWhcNMjkwMTAxMDAwMDAwWjBFMQswCQYDVQQGEwJVUzEWMBQGA1UECAwNU29tZS1TdGF0ZTEWMBQGA1UECgwNRXhhbXBsZSBJbmMuMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAu6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6QwIDAQABo1AwTjAdBgNVHQ4EFgQU6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMAwGA1UdEwQFMAMBAf8wHwYDVR0jBBgwFoAU6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMAwGA1UdEwQFMAMBAf8wDQYJKoZIhvcNAQELBQADggEBAKQw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw3v6OMC1r6Qw=\n-----END CERTIFICATE-----\n';
    const idpFormData = new FormData();
    idpFormData.append(
        'certificate',
        new Blob([idpCert], {type: 'application/x-x509-ca-cert'}),
        'Intune SAML Test.cer',
    );
    await fetch(`${serverUrl}/api/v4/saml/certificate/idp`, {
        method: 'POST',
        body: idpFormData,
        credentials: 'include',
    });

    // # Upload a minimal, valid SP public certificate (PEM-encoded)
    const spCert =
        '-----BEGIN CERTIFICATE-----\nMIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEArv1Qw4v7OMC2r7Qw4v7OMC2r7Qw4v7OMC2r7QwIDAQAB\n-----END CERTIFICATE-----\n';
    const spFormData = new FormData();
    spFormData.append('certificate', new Blob([spCert], {type: 'application/x-x509-ca-cert'}), 'saml-public-cert.pem');
    await fetch(`${serverUrl}/api/v4/saml/certificate/public`, {
        method: 'POST',
        body: spFormData,
        credentials: 'include',
    });

    // # Configure SAML settings
    await adminClient.patchConfig({
        SamlSettings: {
            Enable: true,
            IdpURL: 'https://example.com/saml',
            IdpDescriptorURL: 'https://example.com/saml/metadata',
            IdpCertificateFile: 'saml-idp.crt',
            EmailAttribute: 'useremail',
            UsernameAttribute: 'username',
            ServiceProviderIdentifier: 'sp-entity-id',
            AssertionConsumerServiceURL: 'https://sp.example.com/login',
            PrivateKeyFile: 'saml-idp.crt',
            PublicCertificateFile: 'saml-public-cert.pem',
        },
    } as any);

    // # Log in as admin
    const {app} = await pw.testBrowser.login(adminUser);
    const security = new MobileSecurity(app);

    // # Go to Mobile Security section
    await security.open();

    // * Verify new Intune toggle is visible
    await expect(security.enableIntuneMAM.trueOption).toBeVisible();

    // # Enable Intune
    await security.enableIntuneMAM.selectTrue();

    // # Select SAML as auth provider
    await security.authProvider.select('saml');

    // # Fill in Intune configuration
    await security.tenantId.fill('abcdef01-2345-6789-abcd-ef0123456789');
    await security.clientId.fill('fedcba98-7654-3210-fedc-ba9876543210');

    // # Save settings
    await security.save();

    // # Wait until the save button has settled
    await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

    // # Go to any other section and come back to Mobile Security
    await security.openUsers();

    await security.open();

    // * Verify Intune is still enabled and configured with SAML
    await security.enableIntuneMAM.toBeTrue();
    expect(await security.tenantId.getValue()).toBe('abcdef01-2345-6789-abcd-ef0123456789');
    expect(await security.clientId.getValue()).toBe('fedcba98-7654-3210-fedc-ba9876543210');
});

test('should disable Intune inputs when toggle is off', async ({pw}) => {
    const {adminUser, adminClient} = await pw.initSetup();

    const license = await adminClient.getClientLicenseOld();

    test.skip(license.SkuShortName !== 'advanced', 'Skipping test - server does not have enterprise advanced license');

    if (!adminUser) {
        throw new Error('Failed to create admin user');
    }

    // # Configure Office365 settings, with the Intune MAM toggle off as this test requires
    await adminClient.patchConfig({
        IntuneSettings: {
            Enable: false,
        },
        Office365Settings: {
            Enable: true,
            Id: 'test-client-id',
            Secret: 'test-secret',
            DirectoryId: 'test-directory-id',
        },
    } as any);

    // # Log in as admin
    const {app} = await pw.testBrowser.login(adminUser);
    const security = new MobileSecurity(app);

    // # Go to Mobile Security section
    await security.open();

    // * Verify Intune inputs are disabled when toggle is off
    expect(await security.authProvider.dropdown.isDisabled()).toBe(true);
    expect(await security.tenantId.input.isDisabled()).toBe(true);
    expect(await security.clientId.input.isDisabled()).toBe(true);

    // # Enable Intune
    await security.enableIntuneMAM.selectTrue();

    // * Verify Intune inputs are now enabled
    expect(await security.authProvider.dropdown.isDisabled()).toBe(false);
    expect(await security.tenantId.input.isDisabled()).toBe(false);
    expect(await security.clientId.input.isDisabled()).toBe(false);
});

/**
 * @objective Verify timer settings are disabled when Mobile Ephemeral Mode is not enabled, and become editable when enabled
 */
test(
    'should disable Mobile Ephemeral Mode sub-settings when toggle is off and enable them when toggle is on',
    {tag: '@mobile_ephemeral_mode'},
    async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();

        test.skip(
            license.SkuShortName !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        const config = await adminClient.getConfig();
        test.skip(
            config.FeatureFlags.MobileEphemeralMode !== true && config.FeatureFlags.MobileEphemeralMode !== 'true',
            'Skipping test - MobileEphemeralMode feature flag is not enabled on the server',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Log in as admin
        const {app} = await pw.testBrowser.login(adminUser);
        const security = new MobileSecurity(app);

        // # Go to Mobile Security section
        await security.open();

        // * Verify Mobile Ephemeral Mode toggle is off by default
        await security.enableMobileEphemeralMode.toBeFalse();

        // * Verify all sub-settings are disabled
        expect(await security.disconnectionTimeout.input.isDisabled()).toBe(true);
        expect(await security.offlinePersistenceTimer.input.isDisabled()).toBe(true);
        expect(await security.autoCacheCleanup.input.isDisabled()).toBe(true);

        // # Enable Mobile Ephemeral Mode toggle
        await security.enableMobileEphemeralMode.selectTrue();

        // * Verify all sub-settings are now enabled
        expect(await security.disconnectionTimeout.input.isDisabled()).toBe(false);
        expect(await security.offlinePersistenceTimer.input.isDisabled()).toBe(false);
        expect(await security.autoCacheCleanup.input.isDisabled()).toBe(false);
    },
);

/**
 * @objective Verify all Mobile Ephemeral Mode settings persist after save and navigation
 */
test(
    'should save and persist all Mobile Ephemeral Mode settings after navigation',
    {tag: '@mobile_ephemeral_mode'},
    async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();

        test.skip(
            license.SkuShortName !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        const config = await adminClient.getConfig();
        test.skip(
            config.FeatureFlags.MobileEphemeralMode !== true && config.FeatureFlags.MobileEphemeralMode !== 'true',
            'Skipping test - MobileEphemeralMode feature flag is not enabled on the server',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Enable Mobile Ephemeral Mode setting via config API
        config.MobileEphemeralModeSettings.Enable = true;
        await adminClient.updateConfig(config);

        // # Log in as admin
        const {app} = await pw.testBrowser.login(adminUser);
        const security = new MobileSecurity(app);

        // # Go to Mobile Security section
        await security.open();

        // # Set custom values
        await security.disconnectionTimeout.fill('120');
        await security.offlinePersistenceTimer.fill('48');
        await security.autoCacheCleanup.fill('14');

        // # Save settings
        await security.save();
        await pw.waitUntil(async () => (await security.saveButton.textContent()) === 'Save');

        // # Navigate away and back
        await security.openUsers();
        await security.open();

        // * Verify Mobile Ephemeral Mode is still enabled
        await security.enableMobileEphemeralMode.toBeTrue();

        // * Verify all values persisted correctly
        expect(await security.disconnectionTimeout.getValue()).toBe('120');
        expect(await security.offlinePersistenceTimer.getValue()).toBe('48');
        expect(await security.autoCacheCleanup.getValue()).toBe('14');
    },
);

/**
 * @objective Verify offline persistence timer is disabled when auto cache cleanup is set to 0 (zero-persistence mode)
 */
test(
    'should disable offline persistence timer when auto cache cleanup is set to zero',
    {tag: '@mobile_ephemeral_mode'},
    async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();

        test.skip(
            license.SkuShortName !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        const config = await adminClient.getConfig();
        test.skip(
            config.FeatureFlags.MobileEphemeralMode !== true && config.FeatureFlags.MobileEphemeralMode !== 'true',
            'Skipping test - MobileEphemeralMode feature flag is not enabled on the server',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Enable Mobile Ephemeral Mode setting via config API
        config.MobileEphemeralModeSettings.Enable = true;
        await adminClient.updateConfig(config);

        // # Log in as admin
        const {app} = await pw.testBrowser.login(adminUser);
        const security = new MobileSecurity(app);

        // # Go to Mobile Security section
        await security.open();

        // * Verify offline persistence timer is enabled
        expect(await security.offlinePersistenceTimer.input.isDisabled()).toBe(false);

        // # Set auto cache cleanup to 0
        await security.autoCacheCleanup.clear();
        await security.autoCacheCleanup.fill('0');

        // * Verify offline persistence timer is now disabled
        expect(await security.offlinePersistenceTimer.input.isDisabled()).toBe(true);

        // # Set auto cache cleanup back to 7
        await security.autoCacheCleanup.clear();
        await security.autoCacheCleanup.fill('7');

        // * Verify offline persistence timer is enabled again
        expect(await security.offlinePersistenceTimer.input.isDisabled()).toBe(false);
    },
);

/**
 * @objective Verify Mobile Ephemeral Mode settings show correct defaults on first enable
 */
test(
    'should show correct default values when Mobile Ephemeral Mode is first enabled',
    {tag: '@mobile_ephemeral_mode'},
    async ({pw}) => {
        const {adminUser, adminClient} = await pw.initSetup();

        const license = await adminClient.getClientLicenseOld();

        test.skip(
            license.SkuShortName !== 'advanced',
            'Skipping test - server does not have enterprise advanced license',
        );

        const config = await adminClient.getConfig();
        test.skip(
            config.FeatureFlags.MobileEphemeralMode !== true && config.FeatureFlags.MobileEphemeralMode !== 'true',
            'Skipping test - MobileEphemeralMode feature flag is not enabled on the server',
        );

        if (!adminUser) {
            throw new Error('Failed to create admin user');
        }

        // # Log in as admin
        const {app} = await pw.testBrowser.login(adminUser);
        const security = new MobileSecurity(app);

        // # Go to Mobile Security section
        await security.open();

        // # Enable Mobile Ephemeral Mode
        await security.enableMobileEphemeralMode.selectTrue();

        // * Verify default values
        expect(await security.disconnectionTimeout.getValue()).toBe('60');
        expect(await security.offlinePersistenceTimer.getValue()).toBe('24');
        expect(await security.autoCacheCleanup.getValue()).toBe('7');
    },
);

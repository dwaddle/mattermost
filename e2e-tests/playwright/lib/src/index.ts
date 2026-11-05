// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

export {test, expect, PlaywrightExtended} from './test_fixture';

// generated page objects (src/ui/generated), their runtime, and the framework's wait helper.
// Tests reach page objects through `app`; the classes are under `generated` (some names match
// hand-written classes that are still being migrated).
export {Api, App, Msg, type Plugins} from './ui/generated';
export * from './ui/generated/sets';
export * as generated from './ui/generated';
export {
    drivers,
    effect,
    formatMessage,
    KeyedList,
    keyOfTestId,
    msg,
    pluginKey,
    registerPluginSurface,
    RUNTIME_API,
    Scope,
    settingTestKey,
    suggestionTestKey,
    textTestKey,
    withElement,
    type AdminSettingIds,
    type AdminSettingKey,
    type AdminSettingPath,
    type BodyOf,
    type ContentFilter,
    type PathParamsOf,
    type PluginKeyOf,
    type RuntimeApiCheck,

    // the drivers' types, so a plugin's generated package (its getters return them) can emit declarations
    type ButtonDriver,
    type CheckboxDriver,
    type ComboboxDriver,
    type ContainerDriver,
    type LinkDriver,
    type MenuitemCheckDriver,
    type MenuitemDriver,
    type OptionDriver,
    type RadioDriver,
    type RadiogroupDriver,
    type SwitchDriver,
    type TabDriver,
    type TextboxDriver,
    type TextDriver,
    type TogglebuttonDriver,
    type Effect,
    type Message,
    type Meta,
    type ParamsOf,
    type PluginKey,
    type PluginKeys,
} from './aria';
export {settle, settleAll, SettleError, waitForApi, type ApiWaitOptions, type SettleOptions} from './settle';
export * from './flows';
export type {ExtendedFixtures} from './test_fixture';
export {testConfig, TESTCONTAINERS_SERVICE_NAMES, SERVER_DEPLOYMENTS} from './test_config';
export type {TestContainersServiceName, ServerDeployment} from './test_config';
export {
    assertUpgradeFromFreshStart,
    assertUpgradeToRequiresPriorFromRun,
    exportUpgradePathProjectSelection,
    getUpgradeFromServerImage,
    getUpgradeToServerImage,
    isUpgradeFromProjectSelected,
    isUpgradePathProjectSelected,
    isUpgradeToPhaseProjectSelected,
    logUpgradeFromServerImage,
    logUpgradeToServerImage,
    UPGRADE_FROM_SERVER_IMAGE_ENV,
} from './upgrade_env';
export {baseGlobalSetup} from './global_setup';
export {clearGlobalSetupFailure, readGlobalSetupFailure, recordGlobalSetupFailure} from './global_setup_failure';
export {TestBrowser} from './browser_context';
export {assetPath, getBlobFromAsset, getFileFromAsset, getFileData, getBlobData} from './file';
export {setupFileServer} from './file_server';
export {decomposeKorean, koreanTestPhrase, typeHangulCharacterWithIme, typeHangulWithIme} from './ime';
export {type SizeObservation, type SizeWatcher, watchElementSize} from './layout_shift';
export {pasteHtml} from './paste';

// react-day-picker, a library calendar with no testids of its own: its days by date, and month navigation
export {getDayPickerDayCell, goToDisplayedMonth} from './ui/components/day_picker';
export {duration, getRandomId, wait, newTestPassword} from './util';
export {
    DefaultChannel,
    LicenseSkus,
    aiPluginId,
    appsPluginId,
    callsPluginId,
    demoPluginId,
    demoPluginUrl,
    playbooksPluginId,
} from './constant';

export {
    getAdminClient,
    getRecentEmail,
    extractEmailLink,
    isWebhookTestServerReachable,
    setupWebhookTestServer,
    PlaywrightClient4,
    generateLdapUser,
    createLdapUser,
    updateLdapUser,
    deleteLdapUser,
    ldapServerConfig,
    ensureOpenldap,
    createKeycloakUser,
    deleteKeycloakUser,
    listMinioObjectKeys,
    ensureMinio,
    samlServerConfig,
    ensureKeycloak,
    elasticsearchServerConfig,
    opensearchServerConfig,
    ensureElasticsearch,
    ensureOpensearch,
    ensureAzurite,
    listAzuriteBlobNames,
    ensureLocalFile,
    listMattermostDataFiles,
    ensurePostgresSearch,
    ensureFeatureFlag,
    requireSubpathServer,
    runMmctl,
    ensureMmctl,
    upgradeServerImage,
    saveUpgradePhaseLogs,
    ensureDemoPlugin,
    installAndEnablePlugin,
    getPluginStatus,
    isPluginActive,
    buildWebappPluginBundle,
    ensureTestWebappPlugins,
    postAuthTestPluginId,
    preAuthTestPluginId,
    removeTestWebappPlugins,
    testWebappPluginMarkerTestId,
    testWebappPluginRoute,
} from './server';
export type {
    EnsureDemoPluginOptions,
    WebappPluginBundleOptions,
    InbucketEmail,
    LdapUser,
    KeycloakUser,
    MmctlResult,
    UpgradeLogPhase,
} from './server';

export {startStack, stopStack, withStackLock} from './containers';

export {ChannelsPage, LoginPage, SystemConsolePage} from './ui/pages';

export {
    components,
    GlobalHeader,
    SearchBox,
    ChannelsCenterView,
    ChannelsSidebarLeft,
    ChannelsSidebarRight,
    ChannelsHeader,
    ChannelsPostCreate,
    ChannelsPost,
    ChannelSettingsModal,
    UserAccountMenu,
} from './ui/components';

export {setWysiwygUserPreference, WYSIWYG_PREF_CATEGORY, WYSIWYG_PREF_NAME} from './wysiwyg_helpers';

export {expectFilesVisible, expectFilesRedacted} from './ui/components/channels/post';

export {TestArgs, ScreenshotOptions} from './types';

export {
    enableAutotranslationConfig,
    disableAutotranslationConfig,
    enableChannelAutotranslation,
    disableChannelAutotranslation,
    setUserChannelAutotranslation,
    setMockSourceLanguage,
} from './autotranslation_helpers';
export type {EnableAutotranslationOptions} from './autotranslation_helpers';
export {
    hasAutotranslationLicense,
    hasEnterpriseLicense,
    hasSharedChannelsLicense,
    hasCustomPermissionsSchemesLicense,
    licenseTier,
} from './license_helpers';

// ABAC (Attribute-Based Access Control) helpers
export {
    createUserWithAttributes,
    enableABAC,
    disableABAC,
    navigateToABACPage,
    navigateToPermissionPoliciesPage,
    navigateToAttributeBasedAccessPage,
    createBasicPolicy,
    createAdvancedPolicy,
    editPolicy,
    deletePolicy,
    runSyncJob,
    verifyUserInChannel,
    verifyUserNotInChannel,
    updateUserAttributes,
} from './server';

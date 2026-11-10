// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Hand-written runtime for the generated page objects (src/ui/generated): one driver per ARIA pattern,
// the Scope base class, branded API effects, i18n messages and retrying matchers.

export {RUNTIME_API, type RuntimeApiCheck} from './api_version';
export * from './drivers';
export {
    effect,
    pathPattern,
    type BodyOf,
    type Effect,
    type Meta,
    type PathParamsOf,
    type PlaceholdersOf,
} from './effects';
export {expect} from './matchers';
export {formatMessage, msg, type Message, type ParamsOf} from './msg';
export {buildPath, keyOf} from './pages';
export {
    pluginKey,
    pluginSurfaces,
    registerPluginSurface,
    type PluginKey,
    type PluginKeyOf,
    type PluginKeys,
} from './plugins';
export {
    settingTestKey,
    suggestionTestKey,
    type AdminSettingId,
    type AdminSettingIds,
    type AdminSettingKey,
    type AdminSettingPath,
} from './settings';
export {KeyedList, keyOfTestId, Scope, type ContentFilter} from './scope';
export {settle, settleAll, SettleError, type SettleOptions} from './settle';

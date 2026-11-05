// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Hand-written runtime for the generated page objects (src/ui/generated): one driver per ARIA pattern,
// the Scope base class, branded API effects, i18n messages and retrying matchers.

export * from './drivers';
export {effect, pathPattern, type BodyOf, type Effect, type Meta} from './effects';
export {expect} from './matchers';
export {formatMessage, msg, type Message, type ParamsOf} from './msg';
export {buildPath, keyOf} from './pages';
export {pluginSurfaces, registerPluginSurface, type PluginKey, type PluginKeys} from './plugins';
export {settingTestKey, suggestionTestKey, type AdminSettingPath} from './settings';
export {Scope} from './scope';

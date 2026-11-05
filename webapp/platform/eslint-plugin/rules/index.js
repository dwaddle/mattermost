// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import e2eNoExpectInPageObjects from './e2e-no-expect-in-page-objects.js';
import e2eNoLiteralLocators from './e2e-no-literal-locators.js';
import e2eNoWaitForTimeout from './e2e-no-wait-for-timeout.js';
import noDispatchGetState from './no-dispatch-getstate.js';
import noRedundantAdminConfigDeps from './no-redundant-admin-config-deps.js';
import testidGrammar from './testid-grammar.js';
import testidNoUnscopedData from './testid-no-unscoped-data.js';
import useExternalLink from './use-external-link.js';

export default {
    'e2e-no-expect-in-page-objects': e2eNoExpectInPageObjects,
    'e2e-no-literal-locators': e2eNoLiteralLocators,
    'e2e-no-wait-for-timeout': e2eNoWaitForTimeout,
    'no-dispatch-getstate': noDispatchGetState,
    'no-redundant-admin-config-deps': noRedundantAdminConfigDeps,
    'testid-grammar': testidGrammar,
    'testid-no-unscoped-data': testidNoUnscopedData,
    'use-external-link': useExternalLink,
};

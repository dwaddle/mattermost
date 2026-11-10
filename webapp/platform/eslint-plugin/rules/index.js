// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import e2eCommitSettles from './e2e-commit-settles.js';
import e2eNamedTimeouts from './e2e-named-timeouts.js';
import e2eNoCatalogText from './e2e-no-catalog-text.js';
import e2eNoExpectInPageObjects from './e2e-no-expect-in-page-objects.js';
import e2eNoInstantCheck from './e2e-no-instant-check.js';
import e2eNoLiteralLocators from './e2e-no-literal-locators.js';
import e2eNoLocatorAction from './e2e-no-locator-action.js';
import e2eNoWaitForTimeout from './e2e-no-wait-for-timeout.js';
import noDispatchGetState from './no-dispatch-getstate.js';
import noRedundantAdminConfigDeps from './no-redundant-admin-config-deps.js';
import testidGrammar from './testid-grammar.js';
import testidNoUnscopedData from './testid-no-unscoped-data.js';
import useExternalLink from './use-external-link.js';

export default {
    'e2e-commit-settles': e2eCommitSettles,
    'e2e-named-timeouts': e2eNamedTimeouts,
    'e2e-no-catalog-text': e2eNoCatalogText,
    'e2e-no-expect-in-page-objects': e2eNoExpectInPageObjects,
    'e2e-no-instant-check': e2eNoInstantCheck,
    'e2e-no-literal-locators': e2eNoLiteralLocators,
    'e2e-no-locator-action': e2eNoLocatorAction,
    'e2e-no-wait-for-timeout': e2eNoWaitForTimeout,
    'no-dispatch-getstate': noDispatchGetState,
    'no-redundant-admin-config-deps': noRedundantAdminConfigDeps,
    'testid-grammar': testidGrammar,
    'testid-no-unscoped-data': testidNoUnscopedData,
    'use-external-link': useExternalLink,
};

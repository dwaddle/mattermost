// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {readFileSync} from 'node:fs';

import {defineConfig, globalIgnores} from 'eslint/config';
import formatjsPlugin from 'eslint-plugin-formatjs';
import noOnlyTestsPlugin from 'eslint-plugin-no-only-tests';

import eslintPlugin from '@mattermost/eslint-plugin';

// Strict files where the testid rules' extended checks (every branch of a testid, such as a `testId ? new : 'legacy'`
// fallback, and the testid helpers) found what the area-fix wave fixes: there the two rules stay warnings until then.
const TESTID_LINT_PENDING = [
    // its announcement bar renders a testid built only from runtime data; the strict PR fixes it with the other bars
    'src/components/announcement_bar/default_announcement_bar/announcement_bar.tsx',
    // the settings row keeps its label and help fallbacks for hosts without a scope until the strict PR drops the
    // shared widgets' legacy ids
    'src/components/widgets/settings/setting.tsx',
];

// Files the testid scan keeps at warnings (dead code, reviewed a11y cases): repo-relative paths become src/ globs.
const STRICT_EXCEPTIONS = JSON.parse(readFileSync(new URL('./test-surface.config.json', import.meta.url), 'utf8')).checks.strictExceptions.
    map(({path}) => path.replace(/^channels\//, '')).
    map((path) => (path.endsWith('/') ? `${path}**` : path));

export default defineConfig([
    ...eslintPlugin.configs.react,
    globalIgnores(['./dist']),
    {
        plugins: {
            formatjs: formatjsPlugin,
        },
        rules: {
            'react/prop-types': [
                2,
                {
                    ignore: [
                        'location',
                        'history',
                        'component',
                    ],
                },
            ],
            'react/no-unknown-property': [
                2,
                {
                    ignore: [
                        'mask-type',
                    ],
                },
            ],
            'react/style-prop-object': [2, {
                allow: ['Timestamp', 'IconButton'],
            }],
            'formatjs/enforce-default-message': 2,
            'formatjs/enforce-id': 2,
            'formatjs/enforce-placeholders': 2,
            'formatjs/no-invalid-icu': 2,
            'formatjs/no-multiple-plurals': 1,
            'formatjs/no-multiple-whitespaces': 2,
            'formatjs/no-literal-string-in-jsx': 1,
            'formatjs/prefer-formatted-message': 1,
            'formatjs/no-useless-message': 1,
            'formatjs/prefer-pound-in-plural': 0,
            'react/jsx-fragments': ['error', 'syntax'],
        },
    },
    {
        files: ['src/**/*.tsx', 'src/**/*.ts'], // testids follow the grammar (scope.name:key--role) everywhere
        ignores: ['**/*.test.*', '**/__mocks__/**'],
        rules: {
            '@mattermost/testid-grammar': 2,
            '@mattermost/testid-no-unscoped-data': 2,
        },
    },
    {
        files: STRICT_EXCEPTIONS, // the scan's reviewed exceptions (`checks.strictExceptions`, with their reasons)
        rules: {
            '@mattermost/testid-grammar': 1,
            '@mattermost/testid-no-unscoped-data': 1,
        },
    },
    {
        files: ['**/*.{test,spec}.{js,jsx,ts,tsx}'],
        plugins: {
            'no-only-tests': noOnlyTestsPlugin,
        },
        rules: {
            'no-only-tests/no-only-tests': ['error', {focus: ['only', 'skip']}],
            'no-restricted-properties': ['error', ...['toMatchSnapshot', 'toMatchInlineSnapshot', 'toThrowErrorMatchingSnapshot', 'toThrowErrorMatchingInlineSnapshot'].map((property) => ({
                property,
                message: "Don't use snapshot tests. Assert explicitly on what should be rendered instead.",
            }))],
        },
    },
    {
        ignores: ['src/packages/mattermost-redux/**'],
        rules: {
            '@typescript-eslint/no-restricted-imports': [
                'error',
                {
                    paths: [{
                        name: 'mattermost-redux/types/actions',
                        importNames: ['DispatchFunc', 'GetStateFunc', 'ActionFunc', 'ActionFuncAsync', 'ThunkActionFunc'],
                        message: 'Use the web app version of it from types/store',
                    }, {
                        name: 'i18n/en.json',
                        message: 'en.json is not shipped. English renders from the defaultMessage at each call site, so importing it only duplicates every English string in the bundle.',
                    }],
                    patterns: [{
                        group: ['@mattermost/client/src/*', '@mattermost/components/src/*', '@mattermost/types/src/*'],
                        message: "Don't include the src folder when importing from packages in webapp/platform",
                    }],
                },
            ],
        },
    },
    {
        settings: {
            'import/resolver': 'webpack',
            formatjs: {
                additionalFunctionNames: ['localizeMessage', 'defineMessage'],
            },
        },
    },
    {
        files: TESTID_LINT_PENDING,
        rules: {
            '@mattermost/testid-grammar': 1,
            '@mattermost/testid-no-unscoped-data': 1,
        },
    },
]);

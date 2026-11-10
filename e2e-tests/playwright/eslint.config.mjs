// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import globals from 'globals';

import eslintPlugin from '@mattermost/eslint-plugin';

// Specs reach elements through the generated page objects and wait on state (settle() and the retrying matchers), so
// literal locators and fixed sleeps are errors in every spec. Reviewed exceptions, where they stay warnings, and why:
const LITERAL_LOCATOR_EXCEPTIONS = {
    'specs/functional/system_console/site_configuration/classification_markings.spec.ts':
        "every test skips on master, CI included (the beforeEach's property group check, and the save tests are " +
        'test.skip for a master regression), so a port to the generated API could not be run to check it',
    'specs/functional/plugins/demo_plugin/server/slash_commands/demo_plugin_hook_toggle.spec.ts':
        'test.fixme on master: it does not run in CI, so a port could not be checked there either',
    'specs/functional/system_console/desktop_app_update_required.spec.ts':
        'the server renders the desktop app update page, not the webapp: no page object can exist, so its role ' +
        'selectors are the agreed way in',
};

// Spec areas: the folders under specs/functional, and specs/accessibility, specs/visual and specs/client. A spec
// imports helpers from its own area or from the lib (UI flows in lib/src/flows); a helper two areas need moves to the
// lib. The reviewed exceptions, by area:
const SPEC_AREAS = [
    'functional/auth',
    'functional/channels',
    'functional/ldap',
    'functional/oidc',
    'functional/plugins',
    'functional/saml',
    'functional/subpath',
    'functional/system_console',
    'accessibility',
    'client',
    'visual',
];
const CROSS_AREA_IMPORTS = {
    'functional/system_console': [
        // API setup helpers the System Console specs shared with channels before the test surface work; moving them to
        // lib/src/server is a follow-up
        './functional/channels/custom_profile_attributes/helpers.ts',
        './functional/channels/team_settings/helpers.ts',
        './functional/channels/channel_classification/helpers.ts',

        // the ABAC burn-on-read specs test the same feature as the channels ones, through its helpers
        './functional/channels/burn_on_read/support.ts',

        // master's attribute specs (user_graph_value_picker, ranked values) share the channel attribute helpers; they move
        // to lib/src/flows with the ABAC PR, which removes this entry
        './functional/channels/channel_attributes/helpers.ts',

        // an ABAC burn-on-read edge case schedules its message the way the scheduled-messages specs do
        './functional/channels/scheduled_messages/support.ts',

        // the masking specs check Team Settings' membership policies like the team settings specs, and close the
        // dialog through their helper (it handles the unsaved-changes warning the lib's close doesn't)
        './functional/channels/team_settings/surface.ts',
    ],
    'functional/channels': [
        // master's channel-settings spec for locked rules builds its fields with the ABAC support; it moves to the
        // generated objects and the lib flows with the ABAC PR, which removes this entry
        './functional/system_console/abac/support.ts',
    ],
};

// Files where the spec rules' extended checks (template, variable, hasText and selector locators; pw.wait and timer
// sleeps) found what the area-fix wave moves: there the two rules stay warnings until then (see the last block).
const EXTENDED_LINT_PENDING = [
    'specs/accessibility/channels/settings_dialog/support.ts',
    'specs/functional/channels/ai/ai_bridge_fixture.ts',
    'specs/functional/channels/ai/recaps_support.ts',
    'specs/functional/channels/autotranslation/autotranslation.spec.ts',
    'specs/functional/channels/autotranslation/autotranslation_users.spec.ts',
    'specs/functional/channels/autotranslation/support.ts',
    'specs/functional/channels/channel_attributes/surface.ts',
    'specs/functional/channels/channel_settings/helpers.ts',
    'specs/functional/channels/custom_groups/custom_group_management.spec.ts',
    'specs/functional/channels/interactive_messages/support.ts',
    'specs/functional/channels/messaging/quote_selection.spec.ts',
    'specs/functional/channels/notifications/desktop_notification_support.ts',
    'specs/functional/channels/post_list/scroll_helpers.ts',
    'specs/functional/channels/search/search_date_filter_helpers.ts',
    'specs/functional/channels/team_settings/helpers.ts',
    'specs/functional/channels/wysiwyg_editor/quote_selection.spec.ts',
    'specs/functional/plugins/pre_auth_webapp_plugins.spec.ts',
    'specs/functional/saml/ldap_sync_wait.ts',
    'specs/functional/subpath/subpath_websocket_realtime.spec.ts',
    'specs/functional/system_console/abac/teams/helpers.ts',
];

export default [
    {
        ignores: [
            '**/node_modules',
            '**/dist',
            '**/playwright-report',
            '**/test-results',
            '**/results',
            '.mattermost_data/**',
            'lib/src/containers/assets/webhook/tests/**',
        ],
    },
    ...eslintPlugin.configs.base,
    {
        files: ['**/*.ts', '**/*.js'],
        languageOptions: {
            globals: {
                ...globals.node,
            },
            ecmaVersion: 5,
            sourceType: 'module',
        },
        settings: {
            'import/resolver': {
                typescript: true,
                node: true,
            },
        },
        rules: {
            '@stylistic/dot-location': 'off', // Covered by Prettier
            '@stylistic/indent': 'off', // Covered by Prettier
            '@stylistic/lines-around-comment': 'off', // Covered by Prettier
            '@stylistic/multiline-ternary': 'off', // Covered by Prettier
            '@stylistic/no-mixed-operators': 'off',
            '@stylistic/operator-linebreak': 'off', // Covered by Prettier
            '@stylistic/space-before-function-paren': 'off', // Covered by Prettier
            '@stylistic/wrap-regex': 'off', // Covered by Prettier
            '@typescript-eslint/explicit-module-boundary-types': 'off',
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            'func-names': 'off',
            'max-lines': ['warn', {max: 800, skipBlankLines: true, skipComments: true}],
            'no-await-in-loop': 'off',
            'no-console': 'error',
            'no-empty-pattern': ['error', {allowObjectPatternsAsParameters: true}],
            'no-loop-func': 0,
            'no-process-env': 0,
            'no-process-exit': 0,
            'headers/header-format': [
                'error',
                {
                    source: 'string',
                    style: 'line',
                    content:
                        'Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.\nSee LICENSE.txt for license information.',
                    trailingNewlines: 2,
                },
            ],
            'import/order': [
                'error',
                {
                    'newlines-between': 'always',
                    groups: ['builtin', 'external', 'internal', 'parent', 'sibling', 'index'],
                },
            ],
            'import/no-unresolved': 'off',

            // Playwright resolves toHaveURL('/path') against baseURL, which drops the subpath in subpath mode.
            'no-restricted-syntax': [
                'error',
                {
                    selector:
                        "CallExpression[callee.property.name='toHaveURL'] > :matches(Literal[value=/^\\//], TemplateLiteral:first-child[quasis.0.value.raw=/^\\//])",
                    message: "toHaveURL('/path') drops the server subpath. Use toHavePath('/path') instead.",
                },
            ],
        },
    },

    {
        files: ['specs/**/*.ts'],
        rules: {
            '@mattermost/e2e-no-literal-locators': 'error',
            '@mattermost/e2e-no-wait-for-timeout': 'error',

            // warnings while the area PRs move the specs over; see each rule's comment in @mattermost/eslint-plugin
            '@mattermost/e2e-commit-settles': ['warn', {generated: 'lib/src/ui/generated'}], // saves wait: commit()/submit()/settle()
            '@mattermost/e2e-no-catalog-text': 'warn', // catalog English is asserted through Msg (reads webapp/channels/src/i18n/en.json)
            '@mattermost/e2e-no-locator-action': 'warn', // act through the driver, not x.locator
            '@mattermost/e2e-named-timeouts': 'warn', // timeouts come from duration.*
            '@mattermost/e2e-no-instant-check': 'warn', // no expect(await x.isDisabled()): use the retrying matchers
        },
    },
    {
        files: ['specs/**/*.ts'],
        rules: {
            'import/no-restricted-paths': [
                'error',
                {
                    zones: SPEC_AREAS.map((area) => ({
                        target: `./specs/${area}`,
                        from: './specs',
                        except: [`./${area}`, './test_setup.ts', ...(CROSS_AREA_IMPORTS[area] ?? [])],
                        message:
                            'Specs import helpers from their own area or the lib: move a shared helper to lib/src/flows.',
                    })),
                },
            ],
        },
    },
    {
        files: Object.keys(LITERAL_LOCATOR_EXCEPTIONS),
        rules: {
            '@mattermost/e2e-no-literal-locators': 'warn',
            '@mattermost/e2e-no-wait-for-timeout': 'warn',
        },
    },
    {
        files: ['lib/src/ui/generated/**/*.ts', 'lib/src/flows/**/*.ts', 'plugins/**/*.ts'], // page objects locate and act; specs assert
        rules: {
            '@mattermost/e2e-no-expect-in-page-objects': 'error',
        },
    },
    {
        files: EXTENDED_LINT_PENDING,
        rules: {
            '@mattermost/e2e-no-literal-locators': 'warn',
            '@mattermost/e2e-no-wait-for-timeout': 'warn',
        },
    },
];

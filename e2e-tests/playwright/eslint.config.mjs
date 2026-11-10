// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import globals from 'globals';

import eslintPlugin from '@mattermost/eslint-plugin';

// Specs written on the generated page objects: no hand-written selectors or fixed sleeps (waiting is
// settle() and the retrying matchers). Add a spec here when it moves to the generated API.
const GENERATED_API_SPECS = [
    'specs/accessibility/channels/account_menu_keyboard.spec.ts',
    'specs/accessibility/channels/account_settings_sidebar.spec.ts',
    'specs/accessibility/channels/add_people_to_channel_dialog.spec.ts',
    'specs/accessibility/channels/intro_channel.spec.ts',
    'specs/accessibility/channels/invite_people_dialog.spec.ts',
    'specs/accessibility/channels/product_menu_keyboard.spec.ts',
    'specs/accessibility/channels/settings_dialog/advanced.spec.ts',
    'specs/accessibility/channels/settings_dialog/display.spec.ts',
    'specs/accessibility/channels/settings_dialog/notifications.spec.ts',
    'specs/accessibility/channels/settings_dialog/settings.spec.ts',
    'specs/accessibility/channels/settings_dialog/sidebar.spec.ts',
    'specs/accessibility/channels/team_menu.spec.ts',
    'specs/accessibility/channels/theme_settings.spec.ts',
    'specs/functional/channels/account_settings/profile/popover_fields.spec.ts',
    'specs/functional/channels/account_settings/security/personal_access_tokens.spec.ts',
    'specs/functional/channels/ai/rewrite_korean.spec.ts',
    'specs/functional/channels/archived_channels/archived_channel_restrictions.spec.ts',
    'specs/functional/channels/archived_channels/archived_channels.spec.ts',
    'specs/functional/channels/bot_accounts/bot_pat_expiry.spec.ts',
    'specs/functional/channels/burn_on_read/dm_gm_flow.spec.ts',
    'specs/functional/channels/burn_on_read/receiver_flow.spec.ts',
    'specs/functional/channels/burn_on_read/restrictions.spec.ts',
    'specs/functional/channels/burn_on_read/sender_flow.spec.ts',
    'specs/functional/channels/categories/managed_categories_flag_off.spec.ts',
    'specs/functional/channels/center_view/page_up_down_scroll.spec.ts',
    'specs/functional/channels/channel_banner/channel_banner.spec.ts',
    'specs/functional/channels/channel_info_rhs/channel_info_rhs.spec.ts',
    'specs/functional/channels/channel_privacy/sidebar_icon_realtime_update.spec.ts',
    'specs/functional/channels/channel_settings/add_existing_member.spec.ts',
    'specs/functional/channels/channel_settings/channel_headers.spec.ts',
    'specs/functional/channels/channel_settings/cross_session_sync.spec.ts',
    'specs/functional/channels/channel_settings/default_channel_url.spec.ts',
    'specs/functional/channels/channel_settings/join_leave_messages.spec.ts',
    'specs/functional/channels/channel_settings/membership_updates.spec.ts',
    'specs/functional/channels/channel_settings/modal_behavior.spec.ts',
    'specs/functional/channels/channel_settings/unsaved_changes_on_open.spec.ts',
    'specs/functional/channels/custom_status/custom_status_set_and_clear.spec.ts',
    'specs/functional/channels/direct_messages_modal/direct_message_actions.spec.ts',
    'specs/functional/channels/direct_messages_modal/edit_direct_message.spec.ts',
    'specs/functional/channels/direct_messages_modal/remove_last_post.spec.ts',
    'specs/functional/channels/drafts/draft_channel_switch.spec.ts',
    'specs/functional/channels/drafts/draft_sidebar_switch.spec.ts',
    'specs/functional/channels/drafts/drafts_on_deleted_message.spec.ts',
    'specs/functional/channels/emoji_picker/emoji_picker.spec.ts',
    'specs/functional/channels/emoji_picker/scroll_disabled_with_picker.spec.ts',
    'specs/functional/channels/file_attachments/attachment_kinds.spec.ts',
    'specs/functional/channels/file_attachments/cancel_file_upload.spec.ts',
    'specs/functional/channels/file_attachments/edit_file_attachment.spec.ts',
    'specs/functional/channels/file_attachments/edit_message_with_attachment.spec.ts',
    'specs/functional/channels/file_attachments/upload_svg.spec.ts',
    'specs/functional/channels/forward_post_modal/forward_from_private_channel.spec.ts',
    'specs/functional/channels/forward_post_modal/forward_post_channel_select.spec.ts',
    'specs/functional/channels/gif_picker/gif_picker_search.spec.ts',
    'specs/functional/channels/image_assets/webpack_static_assets.spec.ts',
    'specs/functional/channels/integrations/incoming_webhooks.spec.ts',
    'specs/functional/channels/interactive_messages/mm_blocks_ephemeral.spec.ts',
    'specs/functional/channels/interactive_messages/mm_blocks_incoming_webhook.spec.ts',
    'specs/functional/channels/keyboard_shortcuts/channel_search_and_thread_shortcuts.spec.ts',
    'specs/functional/channels/keyboard_shortcuts/keyboard_message_editing_composition.spec.ts',
    'specs/functional/channels/keyboard_shortcuts/keyboard_navigation_modal_search_shortcuts.spec.ts',
    'specs/functional/channels/keyboard_shortcuts/keyboard_shortcuts_message_history_editing.spec.ts',
    'specs/functional/channels/keyboard_shortcuts/message_formatting_and_emoji_picker.spec.ts',
    'specs/functional/channels/mark_as_unread/channel_and_dm.spec.ts',
    'specs/functional/channels/mark_as_unread/thread_and_rhs.spec.ts',
    'specs/functional/channels/mentions/channel_mention_resolution.spec.ts',
    'specs/functional/channels/mentions/multiple_mentions.spec.ts',
    'specs/functional/channels/mentions/notify_all.spec.ts',
    'specs/functional/channels/mentions/preview_mention_popover.spec.ts',
    'specs/functional/channels/message_attachments/attachment_button_themes.spec.ts',
    'specs/functional/channels/message_attachments/message_attachment_special_characters.spec.ts',
    'specs/functional/channels/message_priority/message_priority.spec.ts',
    'specs/functional/channels/message_scroll/thread_appears_and_scrollable_in_the_rhs.spec.ts',
    'specs/functional/channels/messaging/autocomplete_highlight.spec.ts',
    'specs/functional/channels/messaging/channel_autocomplete_tildes.spec.ts',
    'specs/functional/channels/messaging/channel_users_interactions.spec.ts',
    'specs/functional/channels/messaging/cjk_messages.spec.ts',
    'specs/functional/channels/messaging/date_separator_day_rollover.spec.ts',
    'specs/functional/channels/messaging/edit_history_restore.spec.ts',
    'specs/functional/channels/messaging/emoji_behavior.spec.ts',
    'specs/functional/channels/messaging/group_message.spec.ts',
    'specs/functional/channels/messaging/group_message_reactions.spec.ts',
    'specs/functional/channels/messaging/inline_markdown_images.spec.ts',
    'specs/functional/channels/messaging/jumbo_emoji.spec.ts',
    'specs/functional/channels/messaging/link_preview_removal.spec.ts',
    'specs/functional/channels/messaging/message_deleted_on_reply.spec.ts',
    'specs/functional/channels/messaging/message_delivery_and_links.spec.ts',
    'specs/functional/channels/messaging/message_reply_too_long.spec.ts',
    'specs/functional/channels/messaging/paste_without_formatting.spec.ts',
    'specs/functional/channels/messaging/permalinks.spec.ts',
    'specs/functional/channels/messaging/post_textbox_height.spec.ts',
    'specs/functional/channels/messaging/reaction_toggle.spec.ts',
    'specs/functional/channels/messaging/system_message_status.spec.ts',
    'specs/functional/channels/mobile_logs_command.spec.ts',
    'specs/functional/channels/notifications/channel_mentions.spec.ts',
    'specs/functional/channels/notifications/channel_wide_mentions.spec.ts',
    'specs/functional/channels/notifications/desktop_notification_content.spec.ts',
    'specs/functional/channels/notifications/desktop_notification_navigation.spec.ts',
    'specs/functional/channels/notifications/desktop_notification_settings.spec.ts',
    'specs/functional/channels/notifications/reply_notifications.spec.ts',
    'specs/functional/channels/notifications/silent_notification.spec.ts',
    'specs/functional/channels/post_dot_menu/post_dot_menu_mobile.spec.ts',
    'specs/functional/channels/post_list/initial_scroll_read.spec.ts',
    'specs/functional/channels/post_list/initial_scroll_unread.spec.ts',
    'specs/functional/channels/post_list/permalink_scroll.spec.ts',
    'specs/functional/channels/post_list/post_height.spec.ts',
    'specs/functional/channels/post_textbox/channel_autocomplete_slow_search.spec.ts',
    'specs/functional/channels/post_textbox/channel_autocomplete_sorting.spec.ts',
    'specs/functional/channels/scheduled_messages/mobile_schedule_message_menu.spec.ts',
    'specs/functional/channels/scheduled_messages/scheduled_messages.spec.ts',
    'specs/functional/channels/search/cross_team_search.spec.ts',
    'specs/functional/channels/search/find_channels.spec.ts',
    'specs/functional/channels/search/find_channels_korean.spec.ts',
    'specs/functional/channels/search/mobile_rhs_focus.spec.ts',
    'specs/functional/channels/search/search_box_clear_button.spec.ts',
    'specs/functional/channels/search/search_box_korean.spec.ts',
    'specs/functional/channels/search/search_box_suggestions.spec.ts',
    'specs/functional/channels/search/search_cleared_term.spec.ts',
    'specs/functional/channels/search/search_date_filter.spec.ts',
    'specs/functional/channels/search/search_date_filter_combinations.spec.ts',
    'specs/functional/channels/search/search_date_filter_picker_keyboard.spec.ts',
    'specs/functional/channels/search/search_date_filter_scopes.spec.ts',
    'specs/functional/channels/search/search_date_filter_timezone_edit.spec.ts',
    'specs/functional/channels/search/search_from_user.spec.ts',
    'specs/functional/channels/search/search_hashtag.spec.ts',
    'specs/functional/channels/search/search_highlighting.spec.ts',
    'specs/functional/channels/search/search_in_channel_autocomplete.spec.ts',
    'specs/functional/channels/search/search_in_direct_message.spec.ts',
    'specs/functional/channels/search/search_input_help_navigation.spec.ts',
    'specs/functional/channels/search/search_options_after_clear.spec.ts',
    'specs/functional/channels/search/search_popout.spec.ts',
    'specs/functional/channels/search/search_result_actions_navigation.spec.ts',
    'specs/functional/channels/search/search_result_display_refresh_scroll.spec.ts',
    'specs/functional/channels/search/search_result_reply.spec.ts',
    'specs/functional/channels/settings/display/clock_display.spec.ts',
    'specs/functional/channels/settings/notifications/highlight_without_notification.spec.ts',
    'specs/functional/channels/shared_channel_configuration/shared_channel_configuration.spec.ts',
    'specs/functional/channels/sidebar_left/channel_hover_highlight.spec.ts',
    'specs/functional/channels/sidebar_left/dm_gm_profiles_on_load.spec.ts',
    'specs/functional/channels/sidebar_left/move_channel_to_category.spec.ts',
    'specs/functional/channels/sidebar_right/channel_members_profile_popover.spec.ts',
    'specs/functional/channels/sidebar_right/page_up_down_scroll.spec.ts',
    'specs/functional/channels/team_settings/invite_people_autocomplete.spec.ts',
    'specs/functional/channels/team_settings/invite_user_to_closed_team.spec.ts',
    'specs/functional/channels/team_settings/team_members_modal_membership.spec.ts',
    'specs/functional/channels/team_settings/team_members_modal_roles.spec.ts',
    'specs/functional/channels/team_settings/team_settings_access.spec.ts',
    'specs/functional/channels/team_settings/team_settings_info.spec.ts',
    'specs/functional/channels/team_settings/team_settings_unsaved_changes.spec.ts',
    'specs/functional/channels/threads/thread_footer_avatar.spec.ts',
    'specs/functional/channels/threads/threads_list.spec.ts',
    'specs/functional/channels/threads/threads_view.spec.ts',
    'specs/functional/channels/unreads_filter/unreads_filter.spec.ts',
    'specs/functional/channels/wysiwyg_editor/autocomplete.spec.ts',
    'specs/functional/channels/wysiwyg_editor/composing.spec.ts',
    'specs/functional/channels/wysiwyg_editor/formatting_bar.spec.ts',
    'specs/functional/channels/wysiwyg_editor/gating.spec.ts',
    'specs/functional/channels/wysiwyg_editor/markdown.spec.ts',
    'specs/functional/channels/wysiwyg_editor/paste.spec.ts',
    'specs/functional/channels/wysiwyg_editor/rhs.spec.ts',
    'specs/visual/channels/intro_channel.spec.ts',
    'specs/visual/channels/settings_dialog/settings_dialog.spec.ts',
];

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
    'specs/accessibility/channels/add_people_to_channel_dialog.spec.ts',
    'specs/accessibility/channels/invite_people_dialog.spec.ts',
    'specs/accessibility/channels/team_menu.spec.ts',
    'specs/functional/channels/notifications/channel_mentions.spec.ts',
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

    // every spec: hand-written selectors and fixed sleeps are warnings, the to-do list for moving specs onto the
    // generated page objects; the specs already moved are held to errors below
    {
        files: ['specs/**/*.ts'],
        rules: {
            '@mattermost/e2e-no-literal-locators': 'warn',
            '@mattermost/e2e-no-wait-for-timeout': 'warn',

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
        files: GENERATED_API_SPECS,
        rules: {
            '@mattermost/e2e-no-literal-locators': 'error',
            '@mattermost/e2e-no-wait-for-timeout': 'error',
        },
    },
    {
        files: ['lib/src/ui/generated/**/*.ts'], // page objects locate and act; specs assert
        rules: {
            '@mattermost/e2e-no-expect-in-page-objects': 'warn',
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

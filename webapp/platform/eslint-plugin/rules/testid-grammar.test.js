// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- messages and cases quote template-literal syntax */

import {RuleTester} from 'eslint';

import grammar from './testid-grammar.js';
import noUnscopedData from './testid-no-unscoped-data.js';

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: {ecmaFeatures: {jsx: true}},
    },
});

ruleTester.run('testid-grammar', grammar, {
    valid: [
        {code: "<button data-testid='channel_header.menu.leave_channel--menuitem'/>"},
        {code: '<a data-testid={`lhs.channel_list.channel:${channel.name}--link`}/>'},
        {code: "<div data-testid='channel_settings_modal.configuration'/>"},
        {code: '<button data-testid={`${testId}--button`}/>'},
        {code: '<button data-testid={`${testId}.close--button`}/>'},
        {code: "<Button testId='channel_settings_modal.save_panel.save'/>"},
        {code: "const p = {'data-testid': 'invite_modal.people.clear--button'};"},
        {code: '<button data-testid={id}/>'},
        {code: "<span data-testid='lhs.channel_list.channel.unread_badge--text'/>"},
        {code: "<div data-testid='channel_settings_modal'/>"},
    ],
    invalid: [
        {code: "<button data-testid='SendMessageButton'/>", errors: [{message: /lower_snake_case/}]},
        {code: "<button data-testid='post_textbox--button'/>", errors: [{message: /needs a scope/}]},
        {code: "<input data-testid='a.name--input'/>", errors: [{message: /unknown role/}]},
        {code: '<span data-testid={`team-badge-${team.id}`}/>', errors: [{message: /only fill the key/}]},
        {code: '<span data-testid={`a.${kind}.item--text`}/>', errors: [{message: /only fill the key/}]},
        {code: "<Button testId='a.save--button'/>", errors: [{message: /path only/}]},
        {code: "const p = {'data-testid': 'invite-modal-people-clear'};", errors: [{message: /lower_snake_case/}]},
        {code: '<button data-testid={`${prefix}_close--button`}/>', errors: [{message: /continues its prefix/}]},
    ],
});

ruleTester.run('testid-no-unscoped-data', noUnscopedData, {
    valid: [
        {code: "<button data-testid='a.b--button'/>"},
        {code: '<button data-testid={props.testId}/>'},
        {code: '<button data-testid={dataTestId}/>'},
        {code: '<form data-testid={testIdScope}/>'},
        {code: "<button data-testid={rootId ? undefined : 'center.post_create'}/>"},
        {code: '<a data-testid={`lhs.channel:${channel.name}--link`}/>'},
    ],
    invalid: [
        {code: '<div data-testid={setting.key}/>', errors: 1},
        {code: '<div data-testid={channel.name}/>', errors: 1},
        {code: '<div data-testid={`${a}${b}`}/>', errors: 1},
    ],
});

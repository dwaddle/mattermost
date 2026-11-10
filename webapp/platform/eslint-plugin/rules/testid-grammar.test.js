// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- messages and cases quote template-literal syntax */

import assert from 'node:assert/strict';
import {test} from 'node:test';

import tsParser from '@typescript-eslint/parser';
import {RuleTester} from 'eslint';

import grammar, {grammarError, MESSAGES, problemMessage} from './testid-grammar.js';
import noUnscopedData from './testid-no-unscoped-data.js';

const ruleTester = new RuleTester({
    languageOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: {ecmaFeatures: {jsx: true}},
    },
});

const tsTester = new RuleTester({
    languageOptions: {
        parser: tsParser,
        ecmaVersion: 2022,
        sourceType: 'module',
        parserOptions: {ecmaFeatures: {jsx: true}},
    },
});

const HELPERS = "import {part, keyed, withRole, pluginSlotTestId, pluginSlotPath} from '@mattermost/shared/utils/test_id';\n";

ruleTester.run('testid-grammar', grammar, {
    valid: [
        {code: "<button data-testid='channel_header.menu.leave_channel--menuitem'/>"},
        {code: '<a data-testid={`lhs.channel_list.channel:${channel.name}--link`}/>'},
        {code: "<div data-testid='channel_settings_modal.configuration'/>"},
        {code: '<button data-testid={`${testId}--button`}/>'},
        {code: '<button data-testid={`${testId}.close--button`}/>'},
        {code: '<button data-testid={`${props.testIdScope}.close--button`}/>'},
        {code: "<Button testId='channel_settings_modal.save_panel.save'/>"},
        {code: "const p = {'data-testid': 'invite_modal.people.clear--button'};"},
        {code: '<button data-testid={id}/>'},
        {code: "<span data-testid='lhs.channel_list.channel.unread_badge--text'/>"},
        {code: "<div data-testid='channel_settings_modal'/>"},

        // every branch that can render follows the grammar
        {code: '<button data-testid={testId ? `${testId}.close--button` : undefined}/>'},
        {code: "<button data-testid={open ? 'a.menu.open--button' : 'a.menu.closed--button'}/>"},
        {code: '<button data-testid={testId && `${testId}.close--button`}/>'},
        {code: "<button data-testid={props.dataTestId || 'a.menu--button'}/>"},
        {code: "<button data-testid={props.dataTestId ?? 'a.menu--button'}/>"},
        {code: '<button data-testid={`a.menu.${open ? "open" : "closed"}--button`}/>'},

        // props by option: dataTestId and *TestId may carry a role, testId and *TestIdScope may not
        {code: "<Menu menuButton={{dataTestId: 'a.menu--button'}}/>"},
        {code: "<Picker menuTestId='a.picker.menu'/>"},
        {code: "<Picker listTestIdScope='a.picker.list'/>"},
        {code: "const tabs = [{testId: 'invite_modal.as.member'}];"},
        {code: 'const {testId} = props;'},
        {code: "<Item fooTestId='Legacy-Id'/>", options: [{props: {'data-testid': 'full'}}]},

        // composed prefixes come from testid props, scopes and same-file consts that follow the grammar
        {code: "const ROW = 'admin.users.row'; const x = <tr data-testid={`${ROW}:${user.id}`}/>;"},
        {code: 'const HINT_TOAST_TESTID = `${scope}.hint`; const x = <div data-testid={`${HINT_TOAST_TESTID}--status`}/>;'},
        {code: 'const menu = testIdScope ? `${testIdScope}.actions_menu` : undefined; const x = <b data-testid={`${menu}.plugin:${id}--menuitem`}/>;'},
        {code: '<b data-testid={`${this.testIdScope()}.auto_add_all--checkbox`}/>'},
        {code: "const option = isUser ? `user:${u.id}` : 'email'; const x = <b data-testid={`${scope}.${option}--option`}/>;"},
        {code: '<b data-testid={`${props.testIdScope ?? "admin.list"}.row:${id}`}/>'},

        // the testid helpers
        {code: HELPERS + "<span data-testid={part(postTestIdScope, 'only_visible_to_you', 'text')}/>"},
        {code: HELPERS + "<i data-testid={part(testId, 'value_menu.multi_option', {key: name}, 'menuitemcheckbox')}/>"},
        {code: HELPERS + "<List testIdScope={part(props.testIdScope, 'top_pager')}/>"},
        {code: HELPERS + "<b data-testid={keyed(testIdScope, testKey, 'button')}/>"},
        {code: HELPERS + "<b data-testid={withRole(testId, 'text')}/>"},
        {code: HELPERS + "<b data-testid={pluginSlotTestId('app_bar_button', plugin.id)}/>"},
        {code: HELPERS + "<b testId={pluginSlotPath('post_menu_item', plugin.id, testIdScope)}/>"},
        {code: HELPERS + "<b data-testid={part(testId, 'row', {key: id}, open ? 'button' : 'link')}/>"},

        // a function that happens to be called part() isn't the helper
        {code: "const part = (a, b) => a + b; part(x, 'Not.Checked');"},
    ],
    invalid: [
        {code: "<button data-testid='SendMessageButton'/>", errors: [{message: /lower_snake_case/}]},
        {code: "<button data-testid='post_textbox--button'/>", errors: [{message: /needs a scope/}]},
        {code: "<input data-testid='a.name--input'/>", errors: [{message: /unknown role/}]},
        {code: '<span data-testid={`team-badge-${team.id}`}/>', errors: [{message: /only fill the key/}]},
        {code: '<span data-testid={`a.${kind}.item--text`}/>', errors: [{message: /only fill the key/}]},
        {code: "<Button testId='a.save--button'/>", errors: [{message: /path only/}]},
        {code: "const p = {'data-testid': 'invite-modal-people-clear'};", errors: [{message: /lower_snake_case/}]},
        {code: '<button data-testid={`${testId}_close--button`}/>', errors: [{message: /continues its prefix/}]},

        // the review's six: a ternary's legacy branch, "+", dataTestId, an object property named testId, a prefix
        // that isn't a testid, and a role in a path-only prop
        {code: "<button data-testid={testId ? `${testId}--button` : 'dataGrid-row'}/>", errors: [{message: /"dataGrid-row" is not a lower_snake_case word/}]},
        {code: "<button data-testid={'a.row:' + id + '--button'}/>", errors: [{message: /built with "\+"/}]},
        {code: "<Menu menuButton={{dataTestId: 'channelHeaderDropdownButton'}}/>", errors: [{message: /lower_snake_case/}]},
        {code: "const options = [{testId: 'inviteMembersLink', label}];", errors: [{message: /"inviteMembersLink" is not a lower_snake_case word/}]},
        {code: '<button data-testid={`${prefix}--button`}/>', errors: [{message: /starts from a testid prop or scope/}]},
        {code: '<button data-testid={`${a}.close--button`}/>', errors: [{message: /not `a`/}]},
        {code: "<Picker listTestIdScope='a.picker.list--listbox'/>", errors: [{message: /path only/}]},

        // every branch, through casts and fallbacks
        {code: "<b data-testid={x ? 'a.b--button' : y ? 'Bad' : undefined}/>", errors: [{message: /"Bad"/}]},
        {code: "<b data-testid={props.dataTestId || 'legacy-id'}/>", errors: [{message: /"legacy-id"/}]},
        {code: "<b data-testid={ready && 'a.Bad--text'}/>", errors: [{message: /"Bad"/}]},
        {code: '<b data-testid={`a.menu.${open ? "Open" : "closed"}--button`}/>', errors: [{message: /"Open"/}]},
        {code: "const ID = 'legacyId'; const x = <b data-testid={ID}/>;", errors: [{message: /from const ID/}]},
        {code: "<b menuTestId='a.menu--widget'/>", errors: [{message: /unknown role/}]},
        {code: "<b data-testid='a.b--button'/>", options: [{props: {'data-testid': 'path'}}], errors: [{message: /path only/}]},

        // the testid helpers' arguments
        {code: HELPERS + "part(scope, 'Bad.word');", errors: [{message: /"Bad" is not a lower_snake_case word/}]},
        {code: HELPERS + 'part(scope, path);', errors: [{message: /path as a string literal/}]},
        {code: HELPERS + "part(scope, 'row', {key: 'fixed'});", errors: [{message: /key is a literal/}]},
        {code: HELPERS + "part(scope, 'row', {key: 3}, 'button');", errors: [{message: /key is a literal/}]},
        {code: HELPERS + "part(scope, 'row', 'widget');", errors: [{message: /unknown role "widget"/}]},
        {code: HELPERS + "part(scope, 'row', {key: id}, role);", errors: [{message: /role as a string literal/}]},
        {code: HELPERS + "keyed(testId, 'x');", errors: [{message: /key is a literal/}]},
        {code: HELPERS + "withRole(testId, 'input');", errors: [{message: /unknown role/}]},
        {code: HELPERS + 'pluginSlotTestId(slot, id);', errors: [{message: /slot as a string literal/}]},
        {code: HELPERS + "<Button testId={part(testId, 'save', 'button')}/>", errors: [{message: /part\(\): a testId prop is the path only/}]},
        {code: HELPERS + "<Button testId={withRole(testId, 'button')}/>", errors: [{message: /withRole\(\): a testId prop is the path only/}]},
    ],
});

tsTester.run('testid-grammar (TypeScript)', grammar, {
    valid: [
        {code: 'const row = `${testId}.attribute` as const; const x = <b data-testid={`${row}.edit--button`}/>;'},
        {code: 'const rowTestId = testId ? (`${testId}.row` as const) : undefined; const x = <b data-testid={`${rowTestId}:${id}`}/>;'},
        {code: 'const x = <b data-testid={testId as TestId}/>;'},
        {code: '<b data-testid={`${testId!}.close--button`}/>'},
    ],
    invalid: [
        {code: "const x = <b data-testid={(cond ? 'a.b' : 'Legacy') as string}/>;", errors: [{message: /"Legacy"/}]},
        {code: 'const row = `${testId}.row:${id}` as const; const x = <b data-testid={`${row}.edit--button`}/>;', errors: [{message: /a key may not contain/}]},
    ],
});

ruleTester.run('testid-no-unscoped-data', noUnscopedData, {
    valid: [
        {code: "<button data-testid='a.b--button'/>"},
        {code: '<button data-testid={props.testId}/>'},
        {code: '<button data-testid={dataTestId}/>'},
        {code: '<form data-testid={testIdScope}/>'},
        {code: '<form data-testid={HINT_TOAST_TESTID}/>'},
        {code: "<button data-testid={rootId ? undefined : 'center.post_create'}/>"},
        {code: '<a data-testid={`lhs.channel:${channel.name}--link`}/>'},
        {code: '<a data-testid={ready && `lhs.channel:${channel.name}--link`}/>'},
        {code: "const ID = 'a.b'; const x = <b data-testid={ID}/>;"},
        {code: HELPERS + "<b data-testid={part(testId, 'close', 'button')}/>"},
        {code: '<b testId={props.testIdScope}/>'},
    ],
    invalid: [
        {code: '<div data-testid={setting.key}/>', errors: 1},
        {code: '<div data-testid={channel.name}/>', errors: 1},
        {code: '<div data-testid={`${a}${b}`}/>', errors: 1},
        {code: '<div data-testid={props.id}/>', errors: 1},
        {code: "<div data-testid={testId ? 'a.b' : setting.key}/>", errors: 1},
        {code: '<div data-testid={props.testId || option.value}/>', errors: 1},
        {code: '<Item dataTestId={item.name}/>', errors: 1},
        {code: 'const o = {testId: tab.name};', errors: 1},
        {code: '<b data-testid={makeId(x)}/>', errors: 1},
    ],
});

// S19: every kind of grammar problem has a message, and a kind added later still gets one
test('every TestIdProblem kind has a message', () => {
    const samples = {
        unknown_role: 'a.b--input',
        dashes_before_role: 'a.b--c--button',
        empty_key: 'a.b:--button',
        key_characters: 'a.b:x.y--button',
        data_outside_key: 'a.\u0000.b',
        composed_without_dot: '\u0001_b--button',
        word: 'a.Bad',
        unscoped: 'name--button',
    };
    assert.deepEqual(Object.keys(samples).sort(), Object.keys(MESSAGES).sort());
    for (const [kind, text] of Object.entries(samples)) {
        const error = grammarError(text);
        assert.ok(error, `${kind}: ${text} should break the grammar`);
        assert.equal(error, MESSAGES[kind]({problem: kind, role: 'input', word: 'Bad'}), kind);
    }
    assert.equal(problemMessage({problem: 'something_new'}), 'breaks the testid grammar (something_new)');
});

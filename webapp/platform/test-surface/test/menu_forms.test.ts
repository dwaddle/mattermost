// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {element, scanFixture} from './helpers.ts';

const out = () => scanFixture('menu_forms');
const opens = (t: string) => (element(out(), t).opens ?? []).map((o) => `${o.kind}:${o.target}${o.scope ? '@' + o.scope : ''}`);

test('menu forms: a trigger testid passed whole (`menuButton.dataTestId`) opens its menu', () => {
    assert.deepEqual(opens('forms.open_data_menu--button'), ['menu:dataMenu@forms.data_menu']);
});

test('menu forms: a trigger testid built from a path plus the role (`withRole(menuButton.testId, …)`) opens its menu', () => {
    assert.deepEqual(opens('forms.open_role_menu--button'), ['menu:roleMenu@forms.role_menu']);
});

test('menu forms: either form through a local value of a destructured `menuButton` opens its menu', () => {
    assert.deepEqual(opens('forms.open_old_menu--button'), ['menu:oldMenu@forms.old_menu']);
    assert.deepEqual(opens('forms.open_new_menu--button'), ['menu:newMenu@forms.new_menu']);
});

test('menu forms: a component taking `menu` whose button testid comes from another prop opens nothing', () => {
    assert.deepEqual(opens('forms.plain--button'), []);
});

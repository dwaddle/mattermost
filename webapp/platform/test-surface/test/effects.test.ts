// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {element, matchSnapshot, scanFixture} from './helpers.ts';

import {meForm} from '../src/routes.ts';

const out = () => scanFixture('effects');
const ops = (t: string) => element(out(), t).effects?.ops ?? [];

test('effects: manifest snapshot', () => {
    matchSnapshot('effects', 'expected.json', out().manifest);
});

test('effects: client routes evaluate helpers and match OpenAPI, exact and literal-for-param (`me` as its own operation)', () => {
    const byId = new Map(out().manifest.operations.map((o) => [o.opId, o]));
    assert.deepEqual(byId.get('PatchChannel'), {opId: 'PatchChannel', verb: 'PUT', path: '/api/v4/channels/{channel_id}/patch', body: 'Channel', bodyImports: {Channel: '@mattermost/types/channels'}, inSpec: true});

    // the client calls `/users/me` for GET /users/{user_id}: the current user's form is an operation of its own, with
    // the literal path, so a wait for GetUser (another user) doesn't take it
    assert.equal(byId.get('GetUserMe')?.path, '/api/v4/users/me');
    assert.equal(byId.get('GetUserMe')?.body, 'UserProfile');
    assert.equal(byId.get('GetUserMe')?.inSpec, true);
    assert.ok(!byId.get('GetUser')?.path.endsWith('/me'));
    assert.equal(byId.get('RequestJoinChannel')?.inSpec, false);
});

test('effects: connect + bindActionCreators -> thunk -> Client4; catch blocks and logError are skipped', () => {
    assert.deepEqual(ops('effects.panel.save--button'), ['PatchChannel']);
});

test('effects: useCallback, IIFE and factory handlers', () => {
    assert.deepEqual(ops('effects.me.action--button'), ['GetUserMe']);
    assert.deepEqual(ops('effects.join.action--button'), ['RequestJoinChannel']);
    assert.deepEqual(ops('effects.panel.iife--button'), ['GetUserMe']);
});

test('effects: a parent callback with no static source is delegated', () => {
    const e = element(out(), 'effects.panel.done--button').effects;
    assert.deepEqual(e?.ops, []);
    assert.equal(e?.delegated.length, 1);
});

test('effects: a call through data is unknown', () => {
    assert.equal(element(out(), 'effects.panel.dynamic--button').effects?.unknown, true);
});

test('effects: a submit button fires its form onSubmit; type=button does not', () => {
    assert.deepEqual(ops('effects.form.submit--button'), ['PatchChannel']);
    assert.equal(element(out(), 'effects.form.cancel--button').effects, undefined);
});

test('effects: a local handler calling a prop callback takes only its instance\'s callback', () => {
    assert.deepEqual(ops('effects.me_dialog.confirm.action--button'), ['GetUserMe']);
    assert.deepEqual(ops('effects.patch_dialog.confirm.action--button'), ['PatchChannel']);
});

test('effects: a testid written by a render helper inside a component takes only its instance\'s callback', () => {
    assert.deepEqual(ops('effects.helper_me.value--textbox'), ['GetUserMe']);
    assert.deepEqual(ops('effects.helper_patch.value--textbox'), ['PatchChannel']);
});

test('effects: an element under a prop condition is not emitted for an instance that omits the prop', () => {
    assert.ok(!out().manifest.elements.some((e) => e.template === 'effects.info_dialog.confirm.action--button'));
});

test('effects: a button that opens a modal through openModal does not fire the modal\'s callbacks', () => {
    assert.equal(element(out(), 'effects.hooks.delete--button').effects, undefined);
    assert.deepEqual(element(out(), 'effects.hooks.delete--button').opens?.map((o) => o.target), ['ConfirmDialogRedux']);
});

test('effects: a shared dialog\'s confirm fires only the callback its opener passed, through a wrapper', () => {
    assert.deepEqual(ops('effects.delete_hook_modal.confirm--button'), ['PatchChannel']);
    assert.deepEqual(ops('effects.leave_modal.confirm--button'), ['GetUserMe']);
});

test('effects: a modal opened with a testid in its dialogProps is named by that opener', () => {
    assert.equal(element(out(), 'effects.hooks.delete--button').opens?.[0].scope, 'effects.delete_hook_modal');
    assert.equal(element(out(), 'effects.leave--button').opens?.[0].scope, 'effects.leave_modal');
});

test('effects: each opener of a shared modal records the requests its own callbacks send', () => {
    assert.deepEqual(element(out(), 'effects.channels.row.delete--button').opens?.[0].dialogOps, ['PatchChannel']);
    assert.deepEqual(element(out(), 'effects.me_rows.row.delete--button').opens?.[0].dialogOps, ['GetUserMe']);
    assert.deepEqual(ops('effects.delete_row_modal.confirm--button'), ['GetUserMe', 'PatchChannel']);
});

test('effects: a modal whose root container sits under another scope is named by that container', () => {
    assert.equal(element(out(), 'effects.graph.grant--button').opens?.[0].scope, 'effects.graph.grant_modal');
});

test('effects: a callback passed down inside an actions object, through a pass-through and a styled() wrapper', () => {
    assert.deepEqual(ops('effects.about.name.edit--button'), ['PatchChannel']);
});

test('effects: a click handler a hook returns from a `let` assigned on one branch', () => {
    assert.deepEqual(element(out(), 'effects.file--link').opens?.map((o) => o.target), ['FilePreview']);
});

test('effects: a handler on an animation inside the clicked element is part of the click', () => {
    assert.deepEqual(ops('effects.reaction--button'), ['PatchChannel']);
});

test('effects: a client method that returns ClientResponse<T> has the body type T', () => {
    assert.deepEqual(ops('effects.restore--button'), ['RestoreChannel']);
    assert.equal(out().manifest.operations.find((o) => o.opId === 'RestoreChannel')?.body, 'Channel');
});

test('effects: a prop passed through a render helper\'s spread parameter reaches the connected action', () => {
    assert.deepEqual(ops('effects.console.save--button'), ['PatchChannel']);
});

test('effects: a branch on a boolean parameter the call leaves false (its default) isn\'t taken', () => {
    assert.equal(element(out(), 'effects.flags.name--textbox').effects, undefined);
    assert.deepEqual(ops('effects.flags.apply--button'), ['PatchChannel']);
});

test('effects: a result a cycle cut short is not reused: each end of a cycle fires both requests', () => {
    assert.deepEqual(ops('effects.cycle.ping--button'), ['GetUserMe', 'PatchChannel']);
    assert.deepEqual(ops('effects.cycle.pong--button'), ['GetUserMe', 'PatchChannel']);
});

test('effects: a call through data that returns nothing is unknown, unless it is a known harmless method', () => {
    assert.equal(element(out(), 'effects.registry.action--button').effects?.unknown, true);
    assert.equal(element(out(), 'effects.registry.focus--button').effects, undefined);
});

test('effects: meForm puts `me` where the client hard-codes it for a placeholder, and only there', () => {
    assert.equal(meForm('/api/v4/users/{user_id}/status/custom', '/api/v4/users/me/status/custom'), '/api/v4/users/me/status/custom');
    assert.equal(meForm('/api/v4/users/{user_id}/teams/{team_id}/channels', '/api/v4/users/me/teams/{teamId}/channels'), '/api/v4/users/me/teams/{team_id}/channels');
    assert.equal(meForm('/api/v4/users/{user_id}', '/api/v4/users/{userId}'), null);
    assert.equal(meForm('/api/v4/users/{user_id}', '/api/v4/users/me/patch'), null);
});

test('effects: effects.declared adds a request the scan can\'t see, by testid; a stale entry or an unknown operation is reported', () => {
    assert.deepEqual(ops('effects.file--link'), ['PostLog']);
    assert.deepEqual(ops('effects.graph.grant--button'), ['GetUser']);

    // `*.` covers the template under any scope
    assert.ok(ops('effects.channels.row.delete--button').includes('PostLog'));
    assert.ok(ops('effects.me_rows.row.delete--button').includes('PostLog'));
    const byId = new Map(out().manifest.operations.map((o) => [o.opId, o]));
    assert.equal(byId.get('PostLog')?.verb, 'POST');
    assert.deepEqual(byId.get('GetUser'), {opId: 'GetUser', verb: 'GET', path: '/api/v4/users/{user_id}', body: null, inSpec: true});
    const ds = out().diagnostics;
    assert.ok(ds.some((d) => d.rule === 'allow' && d.severity === 'warning' && d.message.includes('"effects.gone--button"')));
    assert.ok(ds.some((d) => d.rule === 'input' && d.severity === 'error' && d.message.includes('NoSuchOp')));
});

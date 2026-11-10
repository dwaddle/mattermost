// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {element, matchSnapshot, scanFixture} from './helpers.ts';

import {roleSuffixFor, runChecks, slotMatches} from '../src/checks.ts';

const out = () => scanFixture('checks');
const diags = (rule: string) => out().diagnostics.filter((d) => d.rule === rule).map((d) => `${d.severity} ${d.at} ${d.message}`);

test('checks: diagnostics snapshot', () => {
    matchSnapshot('checks', 'expected.json', out().manifest.diagnostics);
});

test('checks: duplicates: exclusive branches are fine with the same role, not with different roles; concurrent and cross-file are errors', () => {
    const d = diags('duplicates');
    assert.ok(d.some((x) => x.includes('checks.panel.go--button') && x.includes('different roles')), d.join('\n'));
    assert.ok(d.some((x) => x.includes('checks.panel.twice--text') && x.includes('both can render together')), d.join('\n'));
    assert.ok(d.some((x) => x.includes('checks.shared.label--text') && x.includes('src/b.tsx')), d.join('\n'));
    assert.ok(d.some((x) => x.includes('checks.panel.ok--button') && x.includes('different roles')), d.join('\n'));
    assert.ok(d.every((x) => x.startsWith('error')));
    assert.ok(!d.some((x) => x.includes('checks.thumb.icon--text')), 'guards that contradict (`!compact`, `archived && compact`) are exclusive');
    assert.ok(!d.some((x) => x.includes('"checks.intro"')), 'render helpers called from different arms of a return chain are exclusive');
    assert.ok(d.some((x) => x.includes('checks.pair.item--text') && x.includes('both can render together')), 'render helpers that both run are not');
});

test('checks: role fit', () => {
    const d = diags('role-fit');
    assert.ok(d.some((x) => x.includes('checks.panel.plain') && x.includes('no role suffix')), d.join('\n'));
    assert.ok(d.some((x) => x.includes('checks.panel.ok--button') && x.includes('<span> with no ARIA role')), d.join('\n'));
    assert.ok(!d.some((x) => x.includes('checks.panel.content')), 'a landmark is a container: no suffix');
    assert.ok(!d.some((x) => x.includes('checks.editor')), 'an editor is a textbox; a contentEditable={false} part of it is not');
});

test('checks: a testid spread in only when its scope is set is not "undefined"', () => {
    assert.ok(!diags('undefined').some((x) => x.includes('guarded')), diags('undefined').join('\n'));
});

test('checks: a testid forwarded to a component the scan can\'t see into is one element, not a duplicate', () => {
    assert.ok(!diags('duplicates').some((x) => x.includes('checks.icon_row.')), diags('duplicates').join('\n'));
});

test('checks: interactive element without a role', () => {
    assert.ok(diags('aria').some((x) => x.includes('checks.panel.clickable')));
});

test('checks: undefined, unscoped, grammar', () => {
    assert.ok(diags('undefined').some((x) => x.includes('checks.panel.item_undefined--text')));
    assert.ok(diags('unscoped').length >= 1);
    const g = out().diagnostics.find((x) => x.message.includes('LegacyName'));
    assert.equal(g?.rule, 'grammar');
    assert.match(g?.fix ?? '', /legacy_name/);
});

test('checks: a bare word is a scope root on a menu, not on a control', () => {
    const d = diags('unscoped');
    assert.ok(!d.some((x) => x.includes('"checks_popup"')), d.join('\n'));
    assert.ok(d.some((x) => x.includes('"checks_control"')), d.join('\n'));
});

test('checks: a scope with two or more value fields is a form', () => {
    assert.deepEqual(element(out(), 'checks.form.name--textbox').form, {scope: 'checks.form', field: 'name', valueType: 'string'});
    assert.deepEqual(element(out(), 'checks.form.agree--checkbox').form, {scope: 'checks.form', field: 'agree', valueType: 'boolean'});
    assert.deepEqual(element(out(), 'checks.form.notify--switch').form, {scope: 'checks.form', field: 'notify', valueType: 'boolean'});
});

test('checks: the plugin slot contract and the rendered slots agree both ways', () => {
    const d = diags('plugin-slots');
    assert.equal(d.length, 3, d.join('\n'));
    assert.ok(d.some((x) => x.includes('"gone"') && x.includes('no longer renders')), d.join('\n'));
    assert.ok(d.some((x) => x.includes('"unkeyed"') && x.includes('must be keyed by pluginTestKey')), d.join('\n'));
    assert.ok(d.some((x) => x.includes('checks.plugins.extra:{key}--button') && x.includes("isn't in the published plugin slot contract")), d.join('\n'));
    assert.ok(d.every((x) => x.startsWith('error')));
    assert.deepEqual(out().manifest.elements.find((e) => e.template === 'checks.plugins.action:{key}--button')?.key, {kind: 'plugin', type: 'PluginKey'});
});

test('checks: a reviewed allow entry turns that error into a warning with its reason; a stale entry is reported', () => {
    const base = {strictScopes: [], strictPaths: ['src/'], strictKeys: false, configAt: 'test-surface.config.json'};
    const ds = runChecks(out().result, {...base, allow: [{rule: 'aria', template: 'checks.panel.clickable', reason: 'reviewed'}, {rule: 'aria', template: 'checks.gone', reason: 'old'}]});
    const d = ds.find((x) => x.rule === 'aria' && x.message.includes('checks.panel.clickable'));
    assert.equal(d?.severity, 'warning');
    assert.match(d!.message, /Allowed: reviewed$/);
    assert.ok(ds.some((x) => x.rule === 'allow' && x.message.includes('"checks.gone"')));
});

test('checks: an allow entry for a keyed template covers its per-value diagnostics', () => {
    const r = out().result;
    const keyed = {rule: 'duplicates' as const, severity: 'error' as const, at: 'src/x.tsx:1', message: '"checks.section:{key}=email" is also used by src/y.tsx:2.'};
    const result = {...r, sites: [], emissions: [], manifest: {...r.manifest, elements: [], pluginSlots: [], diagnostics: [keyed]}};
    const ds = runChecks(result, {strictScopes: [], strictPaths: [], strictKeys: false, configAt: 'test-surface.config.json', allow: [{rule: 'duplicates', template: 'checks.section:{key}', reason: 'exclusive'}]});
    assert.equal(ds.find((d) => d.rule === 'duplicates')?.severity, 'warning');
    assert.ok(!ds.some((d) => d.rule === 'allow'), JSON.stringify(ds));
});

test('checks: an allow entry starting with `*.` covers the template under any scope', () => {
    const r = out().result;
    const at = (scope: string) => ({rule: 'aria' as const, severity: 'error' as const, at: 'src/x.tsx:1', message: `<a> with testid "${scope}.file.remove--button" handles input but has no ARIA role.`});
    const result = {...r, sites: [], emissions: [], manifest: {...r.manifest, elements: [], pluginSlots: [], diagnostics: [at('center.post_create.file_previews'), at('rhs.post_create.file_previews'), {...at('other'), message: '<a> with testid "x.file.remove--buttons" handles input.'}]}};
    const ds = runChecks(result, {strictScopes: [], strictPaths: [], strictKeys: false, configAt: 'test-surface.config.json', allow: [{rule: 'aria', template: '*.file_previews.file.remove--button', reason: 'reviewed'}]});
    assert.deepEqual(ds.filter((d) => d.rule === 'aria').map((d) => d.severity), ['warning', 'warning', 'error']);
});

test('checks: a testid written in markup text is a site; one in a selector string is not', () => {
    const el = element(out(), 'checks.markup.highlight--text');
    assert.equal(el.aria.role, null);
    assert.equal(el.component.at, 'src/format.ts:3');
    assert.ok(!out().manifest.elements.some((e) => e.template.includes('not_a_site')));
    const keyed = element(out(), 'checks.markup.mention:{key}--link');
    assert.equal(keyed.aria.role, 'link', 'a keyed testid in a template with substitutions');
    assert.ok(!out().diagnostics.some((d) => d.at.startsWith('src/format.ts') && d.severity === 'error'), out().diagnostics.filter((d) => d.at.startsWith('src/format.ts')).map((d) => d.message).join('\n'));
});

test('checks: a sibling testid that renders nothing at a usage does not swallow the usage\'s own testid', () => {
    const el = element(out(), 'checks.form.search--textbox');
    assert.equal(el.aria.role, 'textbox');
});

test('checks: a plugin slot template starting with `*.` matches it under any scope', () => {
    assert.ok(slotMatches('*.file_card.menu.plugin:{key}--button', 'center.post_list.post.attachments.file_card.menu.plugin:{key}--button'));
    assert.ok(!slotMatches('*.file_card.menu.plugin:{key}--button', 'center.file_card.menu.public_link--button'));
    assert.ok(slotMatches('lhs.team_menu.plugin:{key}--menuitem', 'lhs.team_menu.plugin:{key}--menuitem'));
});

test('checks: a template past the value cap is reported (an error under strict paths), not silently cut', () => {
    const d = diags('truncated');
    assert.equal(d.length, 1, d.join('\n'));
    assert.match(d[0], /^error src\/cap\.tsx:\d+ "checks\.cap\.cell:r01_c01--text" can take more than 256 values/);
    assert.equal(out().result.stats.truncatedTestIdSites, 1);
});

test('checks: the suffix a role-fit fix suggests is a testid role, --text for read-only content, or none', () => {
    assert.equal(roleSuffixFor('switch'), 'switch');
    assert.equal(roleSuffixFor('heading'), 'text');
    assert.equal(roleSuffixFor('treeitem'), null);
    assert.equal(roleSuffixFor(null), null);
});

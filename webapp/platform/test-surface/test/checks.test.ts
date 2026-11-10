// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {element, matchSnapshot, scanFixture} from './helpers.ts';

import {roleSuffixFor, runChecks, slotMatches} from '../src/checks.ts';
import type {AllowEntry} from '../src/config.ts';
import type {Diagnostic} from '../src/manifest_types.ts';
import {formatDiagnostic} from '../src/report.ts';

const out = () => scanFixture('checks');
const diags = (rule: string) => out().diagnostics.filter((d) => d.rule === rule).map((d) => `${d.severity} ${d.at} ${d.message}`);

test('checks: diagnostics snapshot', () => {
    matchSnapshot('checks', 'expected.json', out().diagnostics);
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
    const d = ds.find((x) => x.rule === 'aria' && x.template === 'checks.panel.clickable');
    assert.equal(d?.severity, 'warning');
    assert.deepEqual(d?.waived, {by: 'allow', reason: 'reviewed'});
    assert.match(formatDiagnostic(d!), /handles input but has no ARIA role\. Allowed: reviewed\n/);
    assert.ok(ds.some((x) => x.rule === 'allow' && x.message.includes('"checks.gone"')));
});

test('checks: a strict exception keeps its path at warnings with the reason; an entry with nothing to report is reported', () => {
    const base = {strictScopes: [], strictPaths: ['src/'], strictKeys: false, configAt: 'test-surface.config.json'};
    const strict = runChecks(out().result, base).filter((d) => d.severity === 'error' && d.at.startsWith('src/'));
    assert.ok(strict.length, 'the fixture has strict errors');
    const file = strict[0].at.replace(/(:\d+)+$/, '');
    const ds = runChecks(out().result, {...base, strictExceptions: [{path: file, reason: 'reviewed'}, {path: 'src/gone.tsx', reason: 'old'}]});

    // a duplicate stays an error while its other site is strict
    const here = ds.filter((d) => d.at.startsWith(file) && d.rule !== 'duplicates');
    assert.ok(here.length && here.every((d) => d.severity === 'warning' && d.waived?.reason === 'reviewed'), here.map((d) => d.message).join('\n'));
    assert.equal(ds.filter((d) => d.severity === 'error' && !d.at.startsWith(file)).length, strict.filter((d) => !d.at.startsWith(file)).length);
    assert.ok(ds.some((d) => d.rule === 'strict-exceptions' && d.message.includes('"src/gone.tsx"')));
    assert.ok(!ds.some((d) => d.rule === 'strict-exceptions' && d.message.includes(`"${file}"`)));
});

test('checks: a strict exception also covers what a testid value brings from it into another file', () => {
    const base = {strictScopes: [], strictPaths: ['src/'], strictKeys: false, configAt: 'test-surface.config.json'};
    const viaB = (ds: ReturnType<typeof runChecks>) => ds.filter((d) => !d.at.startsWith('src/b.tsx') && d.message.includes('(via src/b.tsx'));
    assert.ok(viaB(runChecks(out().result, base)).some((d) => d.severity === 'error'), 'the fixture has errors in a.tsx from values that come through b.tsx');
    const excepted = viaB(runChecks(out().result, {...base, strictExceptions: [{path: 'src/b.tsx', reason: 'reviewed'}]}));
    assert.ok(excepted.length && excepted.every((d) => d.severity === 'warning' && d.waived?.reason === 'reviewed'), excepted.map((d) => d.message).join('\n'));
});

const checked = (diagnostics: Diagnostic[], allow: AllowEntry[]) => {
    const r = out().result;
    const result = {...r, sites: [], emissions: [], diagnostics, manifest: {...r.manifest, elements: [], pluginSlots: []}};
    return runChecks(result, {strictScopes: [], strictPaths: [], strictKeys: false, configAt: 'test-surface.config.json', allow});
};

test('checks: an allow entry for a keyed template covers its per-value diagnostics', () => {
    const keyed: Diagnostic = {rule: 'duplicates', severity: 'error', at: 'src/x.tsx:1', message: '"checks.section:{key}=email" is also used by src/y.tsx:2.', template: 'checks.section:{key}', key: 'email'};
    const ds = checked([keyed], [{rule: 'duplicates', template: 'checks.section:{key}', reason: 'exclusive'}]);
    assert.equal(ds.find((d) => d.rule === 'duplicates')?.severity, 'warning');
    assert.ok(!ds.some((d) => d.rule === 'allow'), JSON.stringify(ds));
});

test('checks: an allow entry starting with `*.` covers the template under any scope', () => {
    const at = (template: string): Diagnostic => ({rule: 'aria', severity: 'error', at: 'src/x.tsx:1', message: `<a> with testid "${template}" handles input but has no ARIA role.`, template});
    const ds = checked([at('center.post_create.file_previews.file.remove--button'), at('rhs.post_create.file_previews.file.remove--button'), at('x.file.remove--buttons')], [{rule: 'aria', template: '*.file_previews.file.remove--button', reason: 'reviewed'}]);
    assert.deepEqual(ds.filter((d) => d.rule === 'aria').map((d) => d.severity), ['warning', 'warning', 'error']);
});

test('checks: an allow entry matches the diagnostic\'s rule and template, whatever its message says', () => {
    const reworded: Diagnostic = {rule: 'aria', severity: 'error', at: 'src/x.tsx:1', message: 'This clickable element needs a role.', template: 'checks.panel.clickable'};
    const elsewhere: Diagnostic = {rule: 'aria', severity: 'error', at: 'src/x.tsx:2', message: 'Unlike "checks.panel.clickable", this one needs a role.', template: 'checks.panel.other'};
    const ds = checked([reworded, elsewhere], [{rule: 'aria', template: 'checks.panel.clickable', reason: 'reviewed'}]);
    assert.deepEqual(ds.filter((d) => d.rule === 'aria').map((d) => `${d.template} ${d.severity}`), ['checks.panel.clickable warning', 'checks.panel.other error']);
});

test('checks: diagnostics about a testid carry its template, key and usage chain as fields', () => {
    const d = out().diagnostics.find((x) => x.rule === 'duplicates' && x.template === 'checks.panel.twice--text');
    assert.equal(d?.template, 'checks.panel.twice--text');
    assert.ok(out().diagnostics.filter((x) => x.rule !== 'allow' && x.rule !== 'plugin-slots').every((x) => x.template !== undefined || x.rule === 'unresolved' || x.rule === 'unscoped' || x.rule === 'pages' || x.rule === 'input'));
});

test('checks: a testid written in markup text is a site; one in a selector string is not', () => {
    const el = element(out(), 'checks.markup.highlight--text');
    assert.equal(el.aria.role, null);
    assert.equal(el.component.at, 'src/format.ts#highlight');
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
    assert.match(d[0], /^error src\/cap\.tsx:\d+:\d+ "checks\.cap\.cell:r01_c01--text" can take more than 256 values/);
    assert.equal(out().result.stats.truncatedTestIdSites, 1);
});

test('checks: the suffix a role-fit fix suggests is a testid role, --text for read-only content, or none', () => {
    assert.equal(roleSuffixFor('switch'), 'switch');
    assert.equal(roleSuffixFor('heading'), 'text');
    assert.equal(roleSuffixFor('treeitem'), null);
    assert.equal(roleSuffixFor(null), null);
});

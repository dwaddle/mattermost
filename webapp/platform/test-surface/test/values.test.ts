// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {element, exact, matchSnapshot, scanFixture} from './helpers.ts';

const out = () => scanFixture('values');

test('values: manifest snapshot', () => {
    matchSnapshot('values', 'expected.json', out().manifest);
});

test('values: props path with destructuring default, at each usage', () => {
    assert.deepEqual(exact(out(), 'values.leaf.given--button').instances.map((i) => i.via), [['src/app.tsx:21:13']]);
    assert.deepEqual(element(out(), 'values.leaf.given--button').instances.map((i) => i.via), [['src/app.tsx#App']]);
    element(out(), 'values.leaf.default--button');
});

test('values: spreads of local objects and rest props', () => {
    assert.deepEqual(exact(out(), 'values.spread.local--button').instances[0].via, ['src/app.tsx:23:13']);
    assert.deepEqual(exact(out(), 'values.wrapper.inner--button').instances[0].via, ['src/leaf.tsx:15:12', 'src/app.tsx:24:13']);
    assert.deepEqual(element(out(), 'values.wrapper.inner--button').instances[0].via, ['src/leaf.tsx#Wrapper', 'src/app.tsx#App']);
});

test('values: props.a.b through an object literal, this.props in an arrow class property', () => {
    element(out(), 'values.deep.main--text');
    element(out(), 'values.panel.close--button');
});

test('values: useMemo, let reassignment, namespace constants, helper returns, method params', () => {
    for (const t of ['values.memo.item--text', 'values.let.first--text', 'values.let.second--text', 'values.panel.save--button', 'values.helper.go--button', 'values.builder.a--text', 'values.builder.b--text']) {
        element(out(), t);
    }
});

test('values: keys from a fixed list, an entity field and a number', () => {
    const tab = element(out(), 'values.tabs.tab:{key}--link');
    assert.equal(tab.key?.kind, 'set');
    assert.deepEqual(tab.key?.values, ['info', 'members']);
    assert.equal(tab.key?.set, 'ValuesTab');
    const ch = element(out(), 'values.channels.channel:{key}--link');
    assert.deepEqual({kind: ch.key?.kind, entity: ch.key?.entity, field: ch.key?.field, type: ch.key?.type}, {kind: 'entity', entity: 'Channel', field: 'name', type: "Pick<Channel, 'name'>"});
    assert.equal(element(out(), 'values.rows.row:{key}--text').key?.kind, 'number');
    const file = element(out(), 'values.previews.file:{key}');
    assert.deepEqual({kind: file.key?.kind, entity: file.key?.entity, module: file.key?.module, type: file.key?.type}, {kind: 'entity', entity: 'FileInfo', module: '@mattermost/types/files', type: "Pick<FileInfo, 'id'>"});
    const mixed = element(out(), 'values.mixed.channel:{key}--link');
    assert.deepEqual({kind: mixed.key?.kind, entity: mixed.key?.entity}, {kind: 'entity', entity: 'Channel'});
    assert.ok(mixed.instances.every((i) => i.via.length), 'keeps the usage chain');
});

test('values: runtime data outside the key is a grammar diagnostic', () => {
    const d = out().diagnostics.find((x) => x.message.includes('values.channel.{key}'));
    assert.equal(d?.rule, 'grammar');
});

test('values: `a ?? b` takes the fallback only for instances where `a` is missing', () => {
    element(out(), 'values.fallback.given--text');
    element(out(), 'values.fallback.from_id--text');
    assert.ok(!out().manifest.elements.some((e) => e.template === 'legacy_id'));
});

test('values: React.createElement, tags held in variables, and components passed as props', () => {
    const t = out().manifest.elements.map((e) => e.template);
    assert.ok(t.includes('values.dynamic.created--text'), t.join('\n'));
    assert.ok(t.includes('values.dynamic.editor.plain--textbox'), t.join('\n'));
    assert.ok(t.includes('values.dynamic.editor.rich--textbox'), t.join('\n'));
    assert.ok(t.includes('values.dynamic.slot--text'), t.join('\n'));
});

test('values: a component set on a typed definition and rendered through a lookup table gets its prop defaults', () => {
    const panel = element(out(), 'values.defined.panel:{key}--text');
    assert.deepEqual(exact(out(), 'values.defined.panel:{key}--text').instances.map((i) => i.via), [['src/dynamic.tsx:241:16']]);
    assert.deepEqual(panel.instances.map((i) => i.via), [['src/dynamic.tsx#DefinitionRenderer']]);
    assert.deepEqual(panel.key?.values, ['only']);
});

test('values: a prop connect() visibly does not supply is missing where the usage omits it', () => {
    const t = out().manifest.elements.map((e) => e.template);
    assert.ok(t.includes('values.connected_a.plain'), t.join('\n'));
    assert.ok(!t.includes('values.connected_a.with_extra'), t.join('\n'));
    assert.ok(t.includes('values.connected_b.with_extra'), t.join('\n'));
});

test('values: a key read from an entity found in a list keeps the entity type', () => {
    assert.equal(element(out(), 'values.found.channel:{key}--link').key?.type, "Pick<Channel, 'name'>");
});

test('values: a condition narrows its reference in the branch it guards (no "undefined" testid)', () => {
    const t = out().manifest.elements.map((e) => e.template);
    assert.ok(t.includes('values.narrow.plugin:{key}--button'), t.join('\n'));
    assert.ok(!t.some((x) => x.startsWith('undefined')), t.filter((x) => x.startsWith('undefined')).join('\n'));
    assert.ok(t.includes('values.narrow.section:{key}'), t.join('\n'));
    assert.ok(!t.some((x) => x.startsWith('values.narrow.section:undefined')), t.join('\n'));
});

test('values: ternaries on one condition combine arm by arm (`!c` is the other arm)', () => {
    const t = out().manifest.elements.map((e) => e.template).filter((x) => x.startsWith('values.paired.'));
    assert.deepEqual(t.sort(), ['values.paired.a_y--text', 'values.paired.b_x--text', 'values.paired.draft:{key}--link', 'values.paired.scheduled:{key}--link']);
    assert.deepEqual(element(out(), 'values.paired.scheduled:{key}--link').key?.values, ['sched']);
    assert.deepEqual(element(out(), 'values.paired.draft:{key}--link').key?.values, ['drft']);
});

test('values: a scope threaded through six components resolves (no depth cut-off gap)', () => {
    element(out(), 'values.chain.a.b.c.d.e.leaf--text');
    assert.ok(!out().manifest.elements.some((e) => e.template.endsWith('.leaf--text') && e.template.startsWith('{key}')));
});

test('values: a path into a helper\'s parameter reads each call\'s argument', () => {
    const e = element(out(), 'values.sections.option:{key}--radio');
    assert.deepEqual({kind: e.key?.kind, values: e.key?.values}, {kind: 'set', values: ['auto', 'compact', 'full', 'off', 'on']});
});

test('values: a field destructured from a fixed list\'s items in map() is that set', () => {
    const e = element(out(), 'values.choices.choice:{key}--radio');
    assert.deepEqual({kind: e.key?.kind, values: e.key?.values}, {kind: 'set', values: ['no', 'yes']});
});

test('values: `a && b ? t : f` takes t only where both sides can hold', () => {
    const t = out().manifest.elements.map((e) => e.template).filter((x) => x.startsWith('values.keyed.'));
    assert.deepEqual(t.sort(), ['values.keyed.item:{key}', 'values.keyed.plain']);
});

test('values: a constant reached through a default-exported object of constants', () => {
    element(out(), 'values.defaults.mute--checkbox');
});

test('values: a flag spread through from a component with no static usage can be off (a gap is not truthy)', () => {
    // `<OptionView {...data}/>` in a react-select Option: isSingleValue is unknown there, so both arms render
    assert.deepEqual(exact(out(), 'values.picker.option:{key}').instances.map((i) => i.via), [['src/option_view.tsx:20:9']]);
    assert.deepEqual(exact(out(), 'values.picker.selected').instances.map((i) => i.via), [['src/option_view.tsx:20:9'], ['src/option_view.tsx:30:9']]);

    // the committed manifest names the component each usage is in
    assert.deepEqual(element(out(), 'values.picker.selected').instances.map((i) => i.via), [['src/option_view.tsx#Option'], ['src/option_view.tsx#SingleValue']]);
});

test('values: `a || fallback` keys: the empty member of a set takes the fallback', () => {
    const e = element(out(), 'values.clear.option:{key}--button');
    assert.deepEqual({kind: e.key?.kind, values: e.key?.values}, {kind: 'set', values: ['day', 'hour', 'none']});
});

test('values: a key made with settingTestKey() is a config setting path, or a page\'s own literal setting id', () => {
    // the page's own ids come from literals and from the definitions a renderer reads `setting.key` from; a config
    // path (`ServiceSettings.SiteURL`, a member of AdminConfig) is left to AdminSettingPath; an id made of a literal
    // and runtime data is any id of that shape
    assert.deepEqual(element(out(), 'values.setting:{key}').key, {
        kind: 'setting',

        // eslint-disable-next-line no-template-curly-in-string
        type: 'AdminSettingPath | "EnableGitLab" | "GitLabSettings.Url" | "LdapSettings.TestConnection" | "bannerEnabled" | "openidType" | `custom_attribute-${string}`',
        values: ['EnableGitLab', 'GitLabSettings.Url', 'LdapSettings.TestConnection', 'bannerEnabled', 'openidType'],
    });
});

test('values: rows pushed into an empty list are rows too, when another usage passes a literal list', () => {
    assert.ok(out().manifest.elements.some((e) => e.template === 'values.pushed_grid.row:{key}'));
    assert.ok(out().manifest.elements.some((e) => e.template === 'values.fixed_grid.row:{key}'));
});

test('values: a recursive component handing its own scope back to itself adds no unscoped template', () => {
    element(out(), 'values.tree.action:{key}--button');
    assert.deepEqual(out().manifest.elements.map((e) => e.template).filter((t) => t.startsWith('{key}')), []);
});

test('values: a component that renders itself through another one unrolls once to the concrete inner scope', () => {
    element(out(), 'values.message.text--text');
    element(out(), 'values.message.quote.post.text--text');
});

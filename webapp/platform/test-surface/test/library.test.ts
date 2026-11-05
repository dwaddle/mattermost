// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {element, scanFixture} from './helpers.ts';

const out = () => scanFixture('library');
const templates = () => out().manifest.elements.map((e) => e.template);

test('library: a usage with testId renders the parts the library publishes', () => {
    for (const t of ['library.settings_modal--dialog', 'library.settings_modal.back--button', 'library.settings_modal.close--button', 'library.settings_modal.tabs', 'library.settings_modal.tabs.tab:{key}--tab']) {
        assert.ok(templates().includes(t), `${t} in\n${templates().join('\n')}`);
    }
    assert.equal(element(out(), 'library.settings_modal.close--button').aria.role, 'button');
    assert.equal(element(out(), 'library.settings_modal--dialog').aria.role, 'dialog');
    assert.deepEqual(element(out(), 'library.settings_modal.tabs.tab:{key}--tab').key?.kind, 'string');
});

test('library: parts gated on a prop follow the usage (IconButton toggled)', () => {
    assert.ok(templates().includes('library.settings_modal.pin--togglebutton'));
    assert.ok(!templates().includes('library.settings_modal.pin--button'));
    assert.ok(templates().includes('library.settings_modal.edit--button'));
    assert.ok(!templates().includes('library.settings_modal.edit--togglebutton'));
});

test('library: an explicit data-testid wins over the derived root, and lands with the published role', () => {
    assert.ok(!templates().includes('library.settings_modal.derived--button'));
    assert.equal(element(out(), 'library.settings_modal.explicit--button').aria.role, 'button');
});

test('library: a part takes only the callbacks its click calls; the root takes none of those', () => {
    const opens = (t: string) => (element(out(), t).opens ?? []).map((o) => o.target).sort();
    assert.deepEqual(opens('library.settings_modal.back--button'), ["'/back'"]);
    assert.deepEqual(opens('library.settings_modal.close--button'), ["'/closed'"]);
    assert.deepEqual(opens('library.settings_modal--dialog'), []);
    assert.deepEqual(opens('library.settings_modal.tabs.tab:{key}--tab'), ["'/tab'"]);
});

test('library: no diagnostics for well-formed part usages', () => {
    assert.deepEqual(out().diagnostics.filter((d) => d.severity === 'error'), []);
});

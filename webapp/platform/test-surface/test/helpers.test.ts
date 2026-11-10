// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {scanFixture} from './helpers.ts';

const out = () => scanFixture('helpers');
const templates = () => out().manifest.elements.map((e) => e.template).sort();

test('helpers: part(), keyed() and the plugin slot helpers are read as templates from their literal arguments', () => {
    assert.deepEqual(templates(), [
        'app_bar.plugin:{key}--button',
        'global_header.product_menu.plugin:{key}--menuitem',
        'helpers.cards.card',
        'helpers.cards.card.close--button',
        'helpers.cards.card.tag:{key}--text',
        'helpers.panel.body',
        'helpers.panel.list.row:{key}--text',
        'helpers.panel.save--button',
        'helpers.panel:{key}--link',
        'helpers.post.actions_menu.plugin:{key}--button',
    ]);
});

test('helpers: a usage without a scope renders no testid, and no id appears without its role or key', () => {
    assert.ok(!templates().some((t) => t.includes('undefined') || t.startsWith('.') || t === 'helpers.panel.save' || t === 'helpers.panel.list.row--text'), templates().join('\n'));
});

test('helpers: a plugin slot\'s key is the plugin key, and the slot is in the published contract', () => {
    const slot = out().manifest.elements.find((e) => e.template === 'app_bar.plugin:{key}--button');
    assert.deepEqual(slot?.key, {kind: 'plugin', type: 'PluginKey'});
    assert.deepEqual(out().diagnostics.filter((d) => d.rule === 'plugin-slots').map((d) => d.message), []);
});

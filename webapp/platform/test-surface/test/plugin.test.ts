// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {FIXTURES, scanFixture} from './helpers.ts';

import {runChecks} from '../src/checks.ts';
import {loadConfig} from '../src/config.ts';
import {generate} from '../src/generate/index.ts';

const config = () => loadConfig(path.join(FIXTURES, 'plugin', 'test-surface.config.json'));
const diagnostics = () => runChecks(scanFixture('plugin').result, {...config().checks, plugin: config().plugin});

test('plugin: the key comes from plugin.json; registry calls list the host slots they fill', () => {
    const plugin = scanFixture('plugin').manifest.plugin!;
    assert.equal(plugin.key, 'com_example_demo');
    assert.deepEqual(plugin.slotsUsed.map((u) => `${u.method}:${u.slots.join(',')}`), ['registerChannelHeaderMenuAction:channel_header_menu_item', 'registerUserSettings:user_settings_tab']);
});

test('plugin: a testid outside plugins.<key> is a plugin-scope error in strict paths', () => {
    const scope = diagnostics().filter((d) => d.rule === 'plugin-scope');
    assert.deepEqual(scope.map((d) => [d.severity, d.message]), [['error', '"widget.stray--text" is outside the plugin\'s scope "plugins.com_example_demo".']]);
});

test('plugin: a slot a supported host doesn\'t render is a plugin-compat error naming the host', () => {
    const compat = diagnostics().filter((d) => d.rule === 'plugin-compat');
    assert.deepEqual(compat.map((d) => d.message), ['registerUserSettings() fills the "user_settings_tab" slot, which host 11.0 doesn\'t render.']);
});

test('plugin: generate writes a package that registers the plugin with app.plugins and imports the published runtime', async () => {
    const c = config();
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'test-surface-plugin-'));
    c.output.generated = out;
    const result = await generate(scanFixture('plugin').manifest, c);
    assert.deepEqual(result.diagnostics.filter((d) => d.severity === 'error'), []);
    assert.deepEqual(fs.readdirSync(out).sort(), ['app-map.json', 'com_example_demo.ts', 'index.ts']);
    const index = fs.readFileSync(path.join(out, 'index.ts'), 'utf8');
    assert.match(index, /registerPluginSurface\('comExampleDemo', \(page\) => new ComExampleDemo\(page\)\);/);
    assert.match(index, /interface Plugins \{\s+comExampleDemo: ComExampleDemo;/);
    assert.match(index, /interface PluginKeys \{\s+com_example_demo: true;/);
    const classes = fs.readFileSync(path.join(out, 'com_example_demo.ts'), 'utf8');
    assert.match(classes, /from '@mattermost\/playwright-lib';/);
    assert.match(classes, /export class ComExampleDemo extends Scope \{\s+constructor\(page: Page, scope = 'plugins\.com_example_demo'/);
    assert.match(classes, /export class ComExampleDemoWidget extends Scope/);
    assert.match(classes, /async clickLeaveButton\(\)/);
    assert.ok(!classes.includes('stray'));
});

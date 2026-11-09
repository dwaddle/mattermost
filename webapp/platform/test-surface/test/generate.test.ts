// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {test} from 'node:test';

import {FIXTURES, matchSnapshot, scanFixture} from './helpers.ts';

import {loadConfig} from '../src/config.ts';
import {generate} from '../src/generate/index.ts';
import {buildModel} from '../src/generate/model.ts';
import {splitAtKey} from '../src/generate/names.ts';
import type {Element} from '../src/manifest_types.ts';

async function generateFixture(name: string) {
    const config = loadConfig(path.join(FIXTURES, name, 'test-surface.config.json'));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'test-surface-gen-'));
    config.output.generated = out;
    config.i18n = null;
    const result = await generate(scanFixture(name).manifest, config);
    const read = (f: string) => fs.readFileSync(path.join(out, f), 'utf8');
    return {result, read, files: fs.readdirSync(out).sort()};
}

test('generate: one file per top-level scope, plus api, sets, app, index and the app map', async () => {
    const {files, result} = await generateFixture('ui');
    assert.deepEqual(files, ['add_menu.ts', 'api.ts', 'app-map.json', 'app.ts', 'banner.ts', 'bar.ts', 'field_menu.ts', 'footer.ts', 'header.ts', 'index.ts', 'info_popover.ts', 'lazy_modal.ts', 'leave_modal.ts', 'left.ts', 'mention_popover.ts', 'menu_modal.ts', 'note_modal.ts', 'pages.ts', 'right.ts', 'role_menu.ts', 'save_bar.ts', 'sets.ts', 'settings_modal.ts', 'shared.ts', 'side.ts', 'sort_menu.ts', 'static_items.ts', 'team_picker.ts', 'tip.ts', 'toolbar.ts', 'twin.ts']);
    assert.deepEqual(result.diagnostics.filter((d) => d.severity === 'error'), []);
});

test('generate: the runtime is imported from @mattermost/playwright-lib, or by a relative path from its source', async () => {
    const {read} = await generateFixture('ui');
    assert.match(read('header.ts'), /import \{Scope, drivers\} from '@mattermost\/playwright-lib';/);

    const config = loadConfig(path.join(FIXTURES, 'ui', 'test-surface.config.json'));
    const lib = fs.mkdtempSync(path.join(os.tmpdir(), 'test-surface-lib-'));
    config.output.generated = path.join(lib, 'src', 'ui', 'generated');
    config.output.runtime = path.join(lib, 'src', 'aria');
    config.i18n = null;
    await generate(scanFixture('ui').manifest, config);
    const read2 = (f: string) => fs.readFileSync(path.join(config.output.generated!, f), 'utf8');
    assert.match(read2('header.ts'), /import \{Scope, drivers\} from '\.\.\/\.\.\/aria';/);
    assert.match(read2('api.ts'), /import \{effect\} from '\.\.\/\.\.\/aria';/);
    assert.match(read2('pages.ts'), /import \{buildPath(, keyOf)?\} from '\.\.\/\.\.\/aria';/);
});

test('generate: a click that shows a store-gated panel returns its page object', async () => {
    const {read} = await generateFixture('ui');
    assert.match(read('toolbar.ts'), /async clickInfoButton\(\): Promise<SideInfo> \{\n\s+await this\.infoButton\.click\(\);\n\s+return new SideInfo\(this\.page, 'side\.info'\);/);
});

test('generate: classes per scope, drivers per role, verbs, and return types for what an action opens', async () => {
    const {read} = await generateFixture('ui');
    const header = read('header.ts');
    matchSnapshot('ui', 'generated_header.ts.snap', header);
    assert.match(header, /export class HeaderMenu extends Scope/);
    assert.match(header, /async clickSettingsMenuItem\(\): Promise<SettingsModal> \{/);
    assert.match(header, /return new SettingsModal\(this\.page, 'settings_modal'\);/);
    assert.match(header, /async clickOpenMenuButton\(\): Promise<HeaderMenu>/);

    // the menu as a modal in mobile view is the menu's other form: the menu stays the return, and the doc names it
    assert.match(header, /In mobile view the menu opens as MenuModal \(`menu_modal`\)\. \*\/\n {4}async clickOpenMenuButton\(\): Promise<HeaderMenu>/);
    assert.match(header, /Renders only when canManage\(state, channelId\)\./);

    // a click that can open either of two dialogs returns a page object for each; the test takes its case's
    assert.match(header, /async clickEitherButton\(\): Promise<\{leaveModal: LeaveModal; settingsModal: SettingsModal\}>/);

    // an option can be selected (react-select and listbox options), not just read
    assert.match(header, /get currentChannelOption\(\) \{\n {8}return drivers\.option\(/);
    const banner = read('banner.ts');
    assert.match(banner, /async setLeaveToggleButton\(on: boolean\): Promise<void>/);
});

test('generate: a shared class returns the menu it opens under its own scope, at every mount', async () => {
    const {read} = await generateFixture('ui');
    const shared = read('shared.ts');

    // `left.picker` and `right.picker` each open their own menu: the opener can't name the first mount's
    assert.match(shared, /async clickOpenMenuButton\(\): Promise<PickerMenu> \{\n\s+await this\.openMenuButton\.click\(\);\n\s+return new PickerMenu\(this\.page, `\$\{this\.scope\}\.menu`\);/);
});

test('generate: a shared part keyed by a different set at each mount takes any of their keys', async () => {
    const {read} = await generateFixture('ui');
    const shared = read('shared.ts');

    // `left.actions` lists archive and mute, `right.actions` pin: one class serves both, so its key is either set's
    assert.match(shared, /action\(action: LeftAction \| RightAction\) \{/);
    assert.match(shared, /get pinMenuItem\(\) \{\n\s+return this\.action\('pin'\);/);

    // its own button opens it: the click returns the menu at the mount it was clicked in, not the first mount's
    assert.match(shared, /async clickOpenButton\(\): Promise<Actions> \{\n\s+await this\.openButton\.click\(\);\n\s+return new Actions\(this\.page, this\.scope\);/);
});

test('generate: a shared class mounted under different owners is named after the component that renders it', async () => {
    const {files, read} = await generateFixture('ui');
    assert.ok(files.includes('shared.ts'), files.join(', '));
    const shared = read('shared.ts');
    assert.match(shared, /Rendered at `banner\.url`, `footer\.token`[^\n]*\nexport class CopyIcon extends Scope/);
    assert.doesNotMatch(shared, /export class (TokenRow|UrlRow) /);
});

test('generate: effects become branded Api entries on the element metadata', async () => {
    const config = loadConfig(path.join(FIXTURES, 'effects', 'test-surface.config.json'));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'test-surface-gen-'));
    config.output.generated = out;
    await generate(scanFixture('effects').manifest, config);
    const api = fs.readFileSync(path.join(out, 'api.ts'), 'utf8');
    assert.match(api, /PatchChannel: effect<Channel>\(\)\(\{op: 'PatchChannel', method: 'PUT', path: '\/api\/v4\/channels\/\{channel_id\}\/patch'\}\)/);
    assert.match(api, /RequestJoinChannel: effect<unknown>\(\)\(.*\), \/\/ not in the OpenAPI spec/);
    const panel = fs.readFileSync(path.join(out, 'effects.ts'), 'utf8');
    assert.match(panel, /effects: \[Api\.PatchChannel\], unknownEffects: false/);
});

test('generate: a shared modal opened with different callbacks gets a type per opener', async () => {
    const config = loadConfig(path.join(FIXTURES, 'effects', 'test-surface.config.json'));
    const out = fs.mkdtempSync(path.join(os.tmpdir(), 'test-surface-gen-'));
    config.output.generated = out;
    await generate(scanFixture('effects').manifest, config);
    const code = fs.readFileSync(path.join(out, 'effects.ts'), 'utf8');

    // the three confirmations share a class; opened some other way, its confirm can send either request:
    // an array, so settle needs `wait`
    assert.match(code, /effects: \[Api\.GetUser, Api\.PatchChannel\] as ReadonlyArray<typeof Api\.GetUser \| typeof Api\.PatchChannel>/);

    // an opener returns its variant, whose confirm sends only that opener's request
    assert.match(code, /export class ConfirmDialogForGetUser extends ConfirmDialog \{\n\s+\/\*\*[^\n]*\*\/\n\s+override get confirmButton\(\) \{\n[^\n]*effects: \[Api\.GetUser\],/);
    assert.match(code, /async clickLeaveButton\(\): Promise<ConfirmDialogForGetUser>/);
    assert.match(code, /async clickDeleteButton\(\): Promise<ConfirmDialogForPatchChannel>/);

    // one row class serves both lists, whose links pass different callbacks: its method returns the modal itself
    assert.match(code, /export class EffectsChannelsRow [^]*?async clickDeleteButton\(\): Promise<ConfirmDialog>/);
});

test('generate: output is byte-identical across runs', async () => {
    const a = await generateFixture('values');
    const b = await generateFixture('values');
    for (const f of a.files) {
        assert.equal(a.read(f), b.read(f), f);
    }
});

test('generate: pages with typed params, entity keys, defaults for fixed sets, and App getters', async () => {
    const {read, result} = await generateFixture('ui');
    assert.deepEqual(result.diagnostics.filter((d) => d.severity === 'error'), []);
    const pages = read('pages.ts');
    assert.match(pages, /team: Pick<Team, 'name'> \| string;/);
    assert.match(pages, /path\?: 'channels' \| 'messages';/);
    assert.match(pages, /channel: Pick<Channel, 'name'> \| string;/);
    assert.match(pages, /identifier: keyOf\(params\.channel, 'name'\)/);
    assert.match(pages, /path: params\.path \?\? 'channels'/);
    assert.match(pages, /static path\(params: HelpPageParams = \{\}\): string/);

    // goto waits for the page's ready scope (pageReady); a page without one returns on the load event
    assert.match(pages, /waits until `header.label` or `banner.url` shows\. \*\/\n {4}async goto\(params: ChannelsPageParams\): Promise<void> \{\n {8}await this\.page\.goto\(ChannelsPage\.path\(params\)\);\n {8}await this\.page\.getByTestId\('header\.label'\)\.or\(this\.page\.getByTestId\('banner\.url'\)\)\.waitFor\(\);\n {4}\}/);
    assert.match(pages, /no `pageReady` element is configured\)\. \*\/\n {4}async goto\(params: HelpPageParams = \{\}\): Promise<void> \{\n {8}await this\.page\.goto\(HelpPage\.path\(params\)\);\n {4}\}/);
    assert.match(read('app.ts'), /get channelsPage\(\): ChannelsPage \{\n {8}return new ChannelsPage\(this\.page\);/);
});

test('generate: a keyed item gets its collection and its keys in document order', async () => {
    const {read} = await generateFixture('values');
    const values = read('values.ts');
    assert.match(values, /get channelItems\(\): Locator \{\n {8}return this\.byTestIdPattern\(`\$\{this\.scope\}\.channel:`, '--link'\);/);
    assert.match(values, /channelKeys\(\): Promise<string\[\]> \{\n {8}return this\.keysOf\(`\$\{this\.scope\}\.channel:`, '--link'\);/);
});

test('generate: a combobox\'s options are found from the page; a listbox\'s options within the list', async () => {
    const {read} = await generateFixture('popups');
    const popups = read('popups.ts');
    assert.match(popups, /this\.byTestId\(`\$\{this\.scope\}\.choice:\$\{choice\}--option`, true\)/);
    assert.match(popups, /choiceKeys\(\): Promise<string\[\]> \{\n {8}return this\.keysOf\(`\$\{this\.scope\}\.choice:`, '--option', true\);/);
    assert.match(popups, /this\.byTestId\(`\$\{this\.scope\}\.item:\$\{item\}--option`\)/);
    assert.match(popups, /itemKeys\(\): Promise<string\[\]> \{\n {8}return this\.keysOf\(`\$\{this\.scope\}\.item:`, '--option'\);/);
});

test('generate: two testids that produce the same member name are a collisions error, not a rename', async () => {
    const {result, read} = await generateFixture('values');
    const d = result.diagnostics.filter((x) => x.rule === 'collisions');
    assert.equal(d.length, 1, JSON.stringify(result.diagnostics));
    assert.equal(d[0].severity, 'error');
    assert.match(d[0].message, /ValuesColliding\.saveButton is generated for both/);
    assert.doesNotMatch(read('values.ts'), /saveButton2|saveButton_/);
});

test('generate: a library component used with testId gets page objects for its published parts, with no per-feature code', async () => {
    const {read, files} = await generateFixture('library');
    assert.ok(files.includes('library.ts'), files.join(', '));
    const lib = read('library.ts');
    assert.match(lib, /export class LibrarySettingsModal extends Scope/);
    assert.match(lib, /get closeButton\(\)/);
    assert.match(lib, /async clickCloseButton\(\)/);
    assert.match(lib, /get pinToggleButton\(\)/);
    assert.match(lib, /tab\(tab: string\)/);
});

test('generate: a repeated item with read-only parts reads them as a typed row', async () => {
    const {read} = await generateFixture('values');
    const values = read('values.ts');
    assert.match(values, /export type ValuesChannelsChannelRow = \{\n {4}draft: string \| null;\n {4}unreadCount: string \| null;\n\};/);
    assert.match(values, /async read\(\): Promise<ValuesChannelsChannelRow> \{/);
    assert.match(values, /draft: await this\.draftText\.textIfPresent\(\),/);
});

test('generate: a class never takes the name of a fixed set (or entity) that sets.ts exports', () => {
    const el = (template: string, key?: Element['key']): Element => ({
        template,
        grammar: true,
        scope: template.split(':')[0].split('.').slice(0, -1),
        name: template.split(':')[0].split('.').pop()!.split('--')[0],
        role: template.includes('--') ? template.split('--')[1] : null,
        component: {name: 'X', at: 'src/x.tsx:1'},
        instances: [{via: []}],
        aria: {role: null, native: false, state: []},
        ...(key ? {key} : {}),
    });
    const model = buildModel([
        el('settings.section:{key}', {kind: 'set', set: 'SettingsSection', type: 'SettingsSection'}),
        el('settings.section.edit--button'),
    ], {reservedNames: ['SettingsSection']});
    const names = model.classes.map((c) => c.name);
    assert.ok(!names.includes('SettingsSection'), names.join(', '));
    assert.ok(names.includes('SettingsSectionItem'), names.join(', '));
});

test('generate: a setting-keyed item takes the config path (or a page\'s own setting id) and builds its key at runtime', async () => {
    const {read} = await generateFixture('values');
    const values = read('values.ts');
    assert.match(values, /setting\(\s*setting:\s*\|?\s*AdminSettingPath[\s|'"A-Za-z.]*['"]bannerEnabled['"]/);
    assert.match(values, /['"]GitLabSettings\.Url['"]/);
    assert.doesNotMatch(values, /['"]ServiceSettings\.SiteURL['"]/);
    assert.match(values, /\.setting:\$\{settingTestKey\(setting\)\}/);
});

test('generate: shapes of one component share a class; colliding names get their area, else their component', () => {
    const el = (template: string, at: string, component = 'SavePanel'): Element => {
        const words = template.replace(/--[a-z]+$/, '').split('.');
        return {
            template,
            grammar: true,
            scope: words.slice(0, -1),
            name: words[words.length - 1],
            role: template.includes('--') ? template.split('--')[1] : null,
            component: {name: component, at},
            instances: [{via: []}],
            aria: {role: null, native: false, state: []},
        };
    };

    // each page has its own title, so the pages themselves are distinct classes
    const panel = (scope: string, cancel: boolean) => [
        el(`${scope}.title--text`, `src/${scope}.tsx:1`, 'Page'),
        el(`${scope}.save_panel`, 'src/save_panel.tsx:10'),
        el(`${scope}.save_panel.save--button`, 'src/save_panel.tsx:20'),
        ...(cancel ? [el(`${scope}.save_panel.cancel--link`, 'src/save_panel.tsx:30')] : []),
    ];
    const elements = [

        // one component, two shapes (some pages give it a Cancel link)
        ...panel('admin.team', true),
        ...panel('admin.channel', true),
        ...panel('admin.board', false),
        ...panel('admin.role', false),

        // another component under the same word, in another area
        el('settings.team.title--text', 'src/settings.team.tsx:1', 'Page'),
        el('settings.channel.title--text', 'src/settings.channel.tsx:1', 'Page'),
        el('settings.team.save_panel', 'src/settings_panel.tsx:5', 'SettingsPanel'),
        el('settings.team.save_panel.close--button', 'src/settings_panel.tsx:9', 'SettingsPanel'),
        el('settings.channel.save_panel', 'src/settings_panel.tsx:5', 'SettingsPanel'),
        el('settings.channel.save_panel.close--button', 'src/settings_panel.tsx:9', 'SettingsPanel'),
    ];
    const names = new Map(buildModel(elements).classes.map((c) => [c.name, c.mounts.map((m) => m.path.join('.')).sort()]));
    assert.deepEqual(names.get('AdminSavePanel'), ['admin.board.save_panel', 'admin.channel.save_panel', 'admin.role.save_panel', 'admin.team.save_panel'], [...names.keys()].join(', '));
    assert.deepEqual(names.get('SettingsSavePanel'), ['settings.channel.save_panel', 'settings.team.save_panel']);
    assert.ok(![...names.keys()].some((n) => (/\d$/).test(n)), 'no numbered names');
});

test('generate: a composite key (a nested item\'s `<parent>-<child>`) is one key the caller passes whole', () => {
    assert.deepEqual(splitAtKey('admin.permissions.group:{key}-playbook_private-{key}'), ['admin.permissions.group:', '']);
    assert.deepEqual(splitAtKey('admin.permissions.row:{key}-{key}--button'), ['admin.permissions.row:', '--button']);
    assert.deepEqual(splitAtKey('lhs.channel_list.channel:{key}--link'), ['lhs.channel_list.channel:', '--link']);
});

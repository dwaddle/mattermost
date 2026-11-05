// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import path from 'node:path';
import {test} from 'node:test';

import {element, FIXTURES, matchSnapshot, scanFixture} from './helpers.ts';

import {scanProject} from '../src/cli.ts';
import {loadConfig} from '../src/config.ts';

const out = () => scanFixture('ui');

// the menu-as-modal every menu trigger opens in mobile view (`menuForm`) has its own test
const opens = (t: string) => (element(out(), t).opens ?? []).filter((o) => !o.menuForm).map((o) => `${o.kind}:${o.target}${o.scope ? '@' + o.scope : ''}`);

test('ui: manifest snapshot', () => {
    matchSnapshot('ui', 'expected.json', out().manifest);
});

test('ui: openModal with an inline descriptor and with one built elsewhere', () => {
    assert.deepEqual(opens('header.menu.settings--menuitem'), ['modal:SettingsModal@settings_modal']);
    assert.deepEqual(opens('header.menu.leave--menuitem'), ['modal:LeaveModal@leave_modal']);
});

test('ui: ToggleModalButton dialogType, through React.lazy', () => {
    assert.deepEqual(opens('header.lazy--button'), ['modal:LazyModalImpl@lazy_modal']);
    assert.deepEqual(opens('header.settings--button'), ['modal:SettingsModal@settings_modal'], 'dialogType on the usage of a component whose own button has the testid');
    assert.deepEqual(opens('header.either--button').sort(), ['modal:LeaveModal@leave_modal', 'modal:SettingsModal@settings_modal'], 'a local `const x = c ? A : B` opens either');
});

test('ui: menu trigger opens the menu whose items it contains', () => {
    assert.deepEqual(opens('header.open_menu--button'), ['menu:headerMenu@header.menu']);
});

test('ui: the modal a menu component opens itself (the menu in mobile view) is the menu\'s other form', () => {
    const forms = (t: string) => (element(out(), t).opens ?? []).filter((o) => o.menuForm).map((o) => `${o.kind}:${o.target}@${o.scope}`);
    assert.deepEqual(forms('header.open_menu--button'), ['modal:MenuModal@menu_modal']);

    // a modal opened by anything but a menu's trigger is a destination
    assert.deepEqual(forms('header.lazy--button'), []);
});

test('ui: a menu whose items are not under its trigger takes the items\' scope, not a stray child\'s', () => {
    assert.deepEqual(opens('bar.header.open_menu--button'), ['menu:barMenu@bar.menu']);
});

test('ui: local-state popover (useState) and modal (this.setState)', () => {
    assert.deepEqual(opens('header.info--button'), ['popover:InfoPopover@info_popover']);
    assert.deepEqual(opens('banner.leave--togglebutton'), ['modal:LeaveModal@leave_modal']);
});

test('ui: local state that an if statement turns into a modal (if (this.state.x) { modal = <C/>; })', () => {
    assert.deepEqual(opens('footer.leave--button'), ['modal:LeaveModal@leave_modal']);
});

test('ui: navigation', () => {
    assert.deepEqual(opens('header.help--link'), ["page:'/help'"]);
});

const pagesOf = (t: string) => (element(out(), t).opens ?? []).filter((o) => o.kind === 'page').map((o) => o.page ?? null);

test('ui: navigation goes to the page whose route its target fits', () => {
    assert.deepEqual(pagesOf('header.help--link'), ['HelpPage']);
});

test('ui: a router Link navigates to its `to`, through a link component\'s props too', () => {
    assert.deepEqual(pagesOf('header.home--link'), ['ChannelsPage']);
    assert.deepEqual(pagesOf('header.faq--link'), ['HelpPage']);
    assert.deepEqual(pagesOf('header.off_topic--link'), ['ChannelsPage']);
});

test('ui: a navigation on one branch of the handler is conditional, and the click returns no page', () => {
    const nav = element(out(), 'header.guide--button').opens?.find((o) => o.kind === 'page');
    assert.equal(nav?.page, 'HelpPage');
    assert.equal(nav?.conditional, true);
    assert.equal(element(out(), 'header.help--link').opens?.[0].conditional, undefined);
});

test('ui: a navigation whose target is unknown names no page', () => {
    assert.deepEqual(pagesOf('header.external--link'), [null]);
});

test('ui: component testids land on the element the component spreads its props onto', () => {
    assert.equal(element(out(), 'header.menu.leave--menuitem').aria.role, 'menuitem');
    assert.equal(element(out(), 'header.menu.mute--menuitem').aria.role, 'menuitemcheckbox');
    assert.equal(element(out(), 'header.lazy--button').aria.role, 'button');
    assert.equal(element(out(), 'banner.leave--togglebutton').aria.role, 'togglebutton');
});

test('ui: render conditions: &&, ternary arms, early return, useSelector explained, usage-level', () => {
    const settings = element(out(), 'header.menu.settings--menuitem').renderedWhen!;
    assert.ok(settings.some((c) => c.expr === 'canAccess' && c.explained === 'canManage(state, channelId)' && c.kind === 'permission'), JSON.stringify(settings));
    assert.ok(settings.some((c) => c.expr === 'channelId' && c.kind === 'prop'), JSON.stringify(settings));
    const info = element(out(), 'header.info--button').renderedWhen!.map((c) => c.expr);
    assert.ok(info.includes('isMobile'));
    const help = element(out(), 'header.help--link').renderedWhen!.map((c) => c.expr);
    assert.ok(help.includes('!isMobile'));
    const popover = element(out(), 'info_popover.body--text').renderedWhen!.map((c) => c.expr);
    assert.ok(popover.includes('showInfo'), JSON.stringify(popover));
});

test('ui: opened components list the scopes they render', () => {
    const c = out().manifest.components.find((x) => x.name === 'SettingsModal');
    assert.deepEqual(c?.scopes, ['settings_modal']);
});

test('ui: a component testId prop composes with the role the component appends; a passed data-testid flows through', () => {
    assert.equal(element(out(), 'footer.save--button').aria.role, 'button');
    assert.equal(element(out(), 'footer.cancel--button').aria.role, 'button');
    assert.ok(!out().result.sites.some((s) => s.kind === 'component' && s.at.includes('modals.tsx') && !s.forwarded));
});

test('ui: pages from the route table, through a route wrapper, constants and render props', () => {
    const pages = out().manifest.pages.map((p) => ({class: p.class, path: p.path, params: p.params, scopes: p.scopes}));
    assert.deepEqual(pages, [
        {
            class: 'ChannelsPage',
            path: '/:team/:path(channels|messages)/:identifier/:postid?',
            params: [
                {name: 'team', as: 'team', optional: false, entity: {type: 'Team', field: 'name', module: '@mattermost/types/teams'}},
                {name: 'path', as: 'path', optional: false, values: ['channels', 'messages']},
                {name: 'identifier', as: 'channel', optional: false, entity: {type: 'Channel', field: 'name', module: '@mattermost/types/channels'}},
                {name: 'postid', as: 'postid', optional: true},
            ],
            scopes: ['banner', 'header', 'header.menu', 'info_popover', 'leave_modal'],
        },
        {class: 'HelpPage', path: '/help/:page?', params: [{name: 'page', as: 'page', optional: true}], scopes: ['footer']},
    ]);
});

test('ui: a page\'s ready elements come from pageReady; a scope prefix or another page\'s element is an error', () => {
    assert.deepEqual(out().manifest.pages.map((p) => [p.class, p.ready]), [['ChannelsPage', ['header.label', 'banner.url']], ['HelpPage', undefined]]);

    const config = loadConfig(path.join(FIXTURES, 'ui', 'test-surface.config.json'));
    config.pageReady = {HelpPage: ['header'], NoSuchPage: ['footer']};
    const {manifest} = scanProject(config);
    assert.deepEqual(manifest.diagnostics.filter((d) => d.rule === 'pages').map((d) => d.message), [
        'pageReady for HelpPage names `header`, which the page doesn\'t render as an element.',
        'pageReady names NoSuchPage, which isn\'t a page.',
    ]);
    assert.equal(manifest.pages.find((p) => p.class === 'HelpPage')?.ready, undefined);
});

test('ui: a class component reached through another class\'s static, behind a HOC, keeps its usage\'s testid', () => {
    assert.deepEqual(element(out(), 'static_items.more--button').instances.map((i) => i.via), [['src/statics.tsx:31']]);
});

test('ui: a menu whose items are held in variables still binds its trigger to their scope', () => {
    assert.deepEqual(opens('header.open_add_menu--button'), ['menu:addMenu@add_menu']);
});

test('ui: a menu whose items are held in variables and picked by a condition binds its trigger to their scope', () => {
    assert.deepEqual(opens('header.open_role_menu--button'), ['menu:roleMenu@role_menu']);
});

test('ui: a menu whose items are pushed onto an array binds its trigger to their scope', () => {
    assert.deepEqual(opens('header.open_sort_menu--button'), ['menu:sortMenu@sort_menu']);
});

test('ui: a menu whose items come from a render helper passed to map binds its trigger to their scope', () => {
    assert.deepEqual(opens('header.open_field_menu--button'), ['menu:fieldMenu@field_menu']);
});

test('ui: a handler that shows one of two places of the same dialog opens both, each with its own scope', () => {
    assert.deepEqual(opens('save_bar.save--button').sort(), ['modal:ConfirmModal@save_bar.confirm_modal', 'modal:ConfirmModal@save_bar.refused_modal']);
});

test('ui: one trigger on two menus labelled alike opens both, each with its scope', () => {
    assert.deepEqual(opens('twin.edit--button').sort(), ['menu:menu@twin.compact_menu', 'menu:menu@twin.full_menu']);
});

test('ui: a styled-components tag has the role of the element it renders', () => {
    assert.equal(element(out(), 'header.close--button').aria.role, 'button');
    assert.ok(!out().diagnostics.some((d) => d.message.includes('header.close--button')));
});

test('ui: styled(StyledTag) keeps the inner element; styled(Component) passes the usage props to the component', () => {
    assert.equal(element(out(), 'header.big_close--button').aria.role, 'button');
    assert.deepEqual(element(out(), 'header.note').instances.map((i) => i.via), [['src/menu.tsx:175']]);
    assert.ok(!out().diagnostics.some((d) => d.message.includes('big_close') || d.message.includes('header.note')), JSON.stringify(out().diagnostics.filter((d) => d.at.includes('menu.tsx'))));
});

test('ui: an opened modal is named by its own scope, not a nested component\'s more frequent one', () => {
    assert.deepEqual(opens('footer.note--button'), ['modal:NoteModal@note_modal']);
});

test('ui: a styled tag rendered `as` another element takes that element\'s role for each usage', () => {
    assert.equal(element(out(), 'header.pick--button').aria.role, 'button');
    assert.equal(element(out(), 'header.label').aria.role, null);
    assert.ok(!out().diagnostics.some((d) => d.message.includes('header.pick--button') || d.message.includes('header.label')), JSON.stringify(out().diagnostics.filter((d) => d.message.includes('header.'))));
});

test('ui: menu items produced by a render helper bind the trigger to their scope', () => {
    assert.deepEqual(opens('team_picker.open_menu--button'), ['menu:teamPickerMenu@team_picker.menu']);
});

test('ui: an element rendered at several sites keeps only the conditions every site shares', () => {
    const close = element(out(), 'header.dismiss--button').renderedWhen!.map((c) => c.expr);
    assert.deepEqual(close, ['open'], JSON.stringify(close));
});

test('ui: an early return on a prop (with a default) decides which element each instance renders', () => {
    const templates = out().manifest.elements.map((e) => e.template).filter((t) => t.startsWith('header.follow'));
    assert.deepEqual(templates.sort(), ['header.follow--button', 'header.follow_icon--togglebutton']);
});

test('ui: props spread through createElement(component || \'input\') land on an input', () => {
    const e = element(out(), 'header.search--textbox');
    assert.deepEqual({role: e.aria.role, native: e.aria.native}, {role: 'textbox', native: true});
    assert.ok(!out().diagnostics.some((d) => d.rule === 'aria' && d.message.includes('header.search--textbox')));
});

test('ui: a testid passed through forwardRef, memo and createElement(inputComponent) lands on the input, beside another testid prop of the same usage', () => {
    assert.equal(element(out(), 'header.status--textbox').aria.role, 'textbox');
    assert.equal(element(out(), 'header.status_clear--button').aria.role, 'button');
});

test('ui: a click that dispatches a constant shows the panel a render condition compares to it', () => {
    assert.deepEqual(opens('toolbar.info--button'), ['panel:InfoPanel@side.info']);
});

test('ui: a constant only tested for membership shows nothing', () => {
    assert.deepEqual(opens('toolbar.files--button'), []);
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import {drivers} from '../src/aria/drivers';

import {button, CreatePost, json, metaOf, page, serve, UploadFile} from './serve';

test.describe('commit and submit', () => {
    test('an element with no effects commits only a named request', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST'})"), (route) => json(route, {id: 'u'}));
        const none = drivers.button(p.getByTestId('x.save--button'), metaOf('x.save--button', 'button', []));
        // @ts-expect-error no effects
        await expect(none.commit()).rejects.toThrow(/fires no known request/);
        expect(await none.commit({wait: CreatePost, unlisted: true})).toEqual({id: 'u'});
    });

    test('commit() clicks and returns the declared save', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST'})"), (route) => json(route, {id: 'c1'}));
        const post = await button(p, [CreatePost]).commit();
        expect(post.id).toBe('c1');
    });

    test('commit() takes `wait` when the element can fire several requests', async ({page: p}) => {
        await serve(
            p,
            page("fetch('/api/v4/files', {method: 'POST'}).then(() => fetch('/api/v4/posts', {method: 'POST'}))"),
            (route, path) => json(route, {id: path}),
        );
        const el = drivers.button(
            p.getByTestId('x.save--button'),
            metaOf('x.save--button', 'button', [UploadFile, CreatePost]),
        );
        expect(await el.commit({wait: CreatePost})).toEqual({id: '/api/v4/posts'});
    });

    test('submit() presses a key in a textbox and returns the save', async ({page: p}) => {
        await serve(
            p,
            "<input data-testid=\"x.message--textbox\" onkeydown=\"if (event.key === 'Enter') fetch('/api/v4/posts', {method: 'POST', body: this.value})\">",
            (route) => json(route, {id: route.request().postData() ?? ''}),
        );
        const textbox = drivers.textbox(
            p.getByTestId('x.message--textbox'),
            metaOf('x.message--textbox', 'textbox', [CreatePost]),
        );
        await textbox.fill('hello');
        expect(await textbox.submit()).toEqual({id: 'hello'});
    });
});

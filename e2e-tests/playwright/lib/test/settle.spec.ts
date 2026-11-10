// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import http from 'node:http';
import type {AddressInfo} from 'node:net';

import {expect, test} from '@playwright/test';

import {drivers} from '../src/aria/drivers';
import {effect, hasMeForm, pathPattern} from '../src/aria/effects';
import {settle, settleAll, SettleError} from '../src/aria/settle';
import {testConfig} from '../src/test_config';

import {
    button,
    CreatePost,
    GetChannel,
    GetMe,
    GetUser,
    json,
    metaOf,
    page,
    serve,
    sleep,
    UploadFile,
    type Body,
} from './serve';

test.describe('settle', () => {
    test('returns the body of the request the action fires', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST'})"), (route) => json(route, {id: 'p1'}));
        const post = await settle(button(p, [CreatePost]), (b) => b.click());
        expect(post).toEqual({id: 'p1'});
    });

    test('ignores a matching request already in flight when the action starts', async ({page: p}) => {
        let releaseOld!: () => void;
        const oldHeld = new Promise<void>((resolve) => {
            releaseOld = resolve;
        });
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST', body: 'new'})"), async (route) => {
            if (route.request().postData() === 'old') {
                await oldHeld;
                await json(route, {id: 'old'});
                return;
            }
            // the old request's response arrives first, after the action's request was issued
            releaseOld();
            await sleep(300);
            await json(route, {id: 'new'});
        });
        const inFlight = p.waitForRequest('**/api/v4/posts');
        await p.evaluate(() => {
            fetch('/api/v4/posts', {method: 'POST', body: 'old'}).catch(() => undefined);
        });
        await inFlight;

        const post = await settle(button(p, [CreatePost]), (b) => b.click());
        expect(post).toEqual({id: 'new'});
    });

    test('follows a redirect to the final response', async ({page: p}) => {
        // a real server: the browser follows a redirect itself, and `page.route` doesn't see the hops
        const server = http.createServer((req, res) => {
            if (req.url === '/') {
                res.writeHead(200, {'content-type': 'text/html'}).end(page("fetch('/api/v4/channels/abc')"));
            } else if (req.url === '/api/v4/channels/abc') {
                res.writeHead(302, {location: '/api/v4/moved/abc'}).end();
            } else {
                res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({id: 'abc'}));
            }
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            await p.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
            const el = drivers.button(
                p.getByTestId('x.save--button'),
                metaOf('x.save--button', 'button', [GetChannel]),
            );
            expect(await settle(el, (b) => b.click(), {timeout: 5_000})).toEqual({id: 'abc'});
        } finally {
            server.close();
        }
    });

    test('takes the retry when a request fails at the network level', async ({page: p}) => {
        let calls = 0;
        await serve(
            p,
            page(
                "(async () => { try { await fetch('/api/v4/posts', {method: 'POST'}); } catch { await fetch('/api/v4/posts', {method: 'POST'}); } })()",
            ),
            async (route) => {
                calls++;
                if (calls === 1) {
                    await route.abort('connectionreset');
                } else {
                    await json(route, {id: 'retry'});
                }
            },
        );
        expect(await settle(button(p, [CreatePost]), (b) => b.click())).toEqual({id: 'retry'});
        expect(calls).toBe(2);
    });

    test('fails at once on an HTTP error, with the status, body and element', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST'})"), (route) =>
            json(route, {id: 'api.post.bad', message: 'bad post'}, 400),
        );
        const started = Date.now();
        const error = await settle(button(p, [CreatePost]), (b) => b.click(), {timeout: 10_000}).catch((e) => e);
        expect(error).toBeInstanceOf(SettleError);
        expect(error.message).toContain('POST /api/v4/posts returned 400');
        expect(error.message).toContain('bad post');
        expect(error.message).toContain('"x.save--button" (test/fixture.tsx#x)');
        expect(Date.now() - started).toBeLessThan(5_000);
    });

    test('accepts the expected status of a negative test', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST'})"), (route) => json(route, {id: 'no'}, 403));
        expect(await settle(button(p, [CreatePost]), (b) => b.click(), {status: 403})).toEqual({id: 'no'});
    });

    test('a {user_id} placeholder skips /users/me when the element declares the /me form', async ({page: p}) => {
        expect(pathPattern('/api/v4/users/{user_id}', {}, {notMe: true}).test('/api/v4/users/me')).toBe(false);
        expect(pathPattern('/api/v4/users/{user_id}/teams', {}, {notMe: true}).test('/api/v4/users/me/teams')).toBe(
            false,
        );
        expect(pathPattern('/api/v4/users/{user_id}', {}, {notMe: true}).test('/api/v4/users/meadow')).toBe(true);
        expect(pathPattern('/api/v4/users/me').test('/api/v4/users/me')).toBe(true);
        expect(hasMeForm(GetUser, [GetUser, GetMe])).toBe(true);
        expect(hasMeForm(GetUser, [GetUser])).toBe(false);
        expect(hasMeForm(GetChannel, [GetMe])).toBe(false);

        await serve(
            p,
            page(
                "fetch('/api/v4/users/me').then(() => new Promise((r) => setTimeout(r, 200))).then(() => fetch('/api/v4/users/u1'))",
            ),
            (route, path) => json(route, {id: path.split('/').pop()}),
        );
        const el = drivers.button(
            p.getByTestId('x.save--button'),
            metaOf('x.save--button', 'button', [GetMe, GetUser]),
        );
        expect(await settle(el, (b) => b.click(), {wait: GetUser})).toEqual({id: 'u1'});
        expect(await settle(el, (b) => b.click(), {wait: GetMe})).toEqual({id: 'me'});
    });

    test('a placeholder still matches me while the element declares only the template', async ({page: p}) => {
        // the generator doesn't emit the /me form yet: an element whose handler calls /users/me declares GetUser
        await serve(p, page("fetch('/api/v4/users/me', {method: 'PUT'})"), (route, path) =>
            json(route, {id: path.split('/').pop()}),
        );
        const UpdateUser = effect<Body>()({op: 'UpdateUser', method: 'PUT', path: '/api/v4/users/{user_id}'});
        const el = drivers.button(p.getByTestId('x.save--button'), metaOf('x.save--button', 'button', [UpdateUser]));
        expect(await settle(el, (b) => b.click())).toEqual({id: 'me'});
    });

    test('params bind placeholders to one entity', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/channels/a').then(() => fetch('/api/v4/channels/b'))"), (route, path) =>
            json(route, {id: path.split('/').pop()}),
        );
        const el = drivers.button(p.getByTestId('x.save--button'), metaOf('x.save--button', 'button', [GetChannel]));
        expect(await settle(el, (b) => b.click(), {params: {channel_id: 'b'}})).toEqual({id: 'b'});
        expect(pathPattern('/api/v4/channels/{channel_id}', {channel_id: 'a.b'}).test('/api/v4/channels/aXb')).toBe(
            false,
        );
    });

    test('matches the app path under a subpath', async ({page: p}) => {
        expect(testConfig.withoutSubpath('/api/v4/posts')).toBe('/api/v4/posts');
        const baseURL = testConfig.baseURL;
        testConfig.baseURL = 'http://lib.test/sp';
        try {
            expect(testConfig.withoutSubpath('/sp/api/v4/posts')).toBe('/api/v4/posts');
            expect(testConfig.withoutSubpath('/sp')).toBe('/');
            expect(testConfig.withoutSubpath('/spx/api')).toBe('/spx/api');
            expect(testConfig.withoutSubpath('/api/v4/posts')).toBe('/api/v4/posts');

            await serve(
                p,
                page("fetch('/sp/api/v4/posts', {method: 'POST'})"),
                (route) => json(route, {id: 'sp'}),
                '/sp',
            );
            expect(await settle(button(p, [CreatePost]), (b) => b.click())).toEqual({id: 'sp'});
        } finally {
            testConfig.baseURL = baseURL;
        }
    });

    test('the timeout starts when the action returns', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST'})"), (route) => json(route, {id: 'late'}));
        const post = await settle(
            button(p, [CreatePost]),
            async (b) => {
                await sleep(1_500);
                await b.click();
            },
            {timeout: 1_000},
        );
        expect(post).toEqual({id: 'late'});
    });

    test('a timeout lists the API requests the page issued', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/other', {method: 'POST'})"));
        const error = await settle(button(p, [CreatePost]), (b) => b.click(), {timeout: 500}).catch((e) => e);
        expect(error).toBeInstanceOf(SettleError);
        expect(error.message).toContain('no POST /api/v4/posts (CreatePost) within 500 ms');
        expect(error.message).toContain('API requests the page issued: POST /api/v4/other');
        expect(error.message).toContain('(test/fixture.tsx#x)');
    });

    test('an element with no effects fails, unless the request is named', async ({page: p}) => {
        await serve(p, page("fetch('/api/v4/posts', {method: 'POST'})"), (route) => json(route, {id: 'u'}));
        const none = drivers.button(p.getByTestId('x.save--button'), metaOf('x.save--button', 'button', []));
        // @ts-expect-error no effects
        await expect(settle(none, (b) => b.click())).rejects.toThrow(/fires no known request/);
        expect(await settle(none, (b) => b.click(), {wait: CreatePost, unlisted: true})).toEqual({id: 'u'});
    });

    test('settleAll waits for one request per item', async ({page: p}) => {
        let n = 0;
        await serve(
            p,
            page("fetch('/api/v4/files', {method: 'POST'}); fetch('/api/v4/files', {method: 'POST'});"),
            async (route) => {
                const id = `f${++n}`;
                await sleep(id === 'f1' ? 200 : 0);
                await json(route, {id});
            },
        );
        const attach = drivers.button(
            p.getByTestId('x.save--button'),
            metaOf('x.save--button', 'button', [UploadFile]),
        );
        const files = await settleAll(attach, (b) => b.click(), {count: 2});
        expect(files.map((f) => f.id).sort()).toEqual(['f1', 'f2']);
    });
});

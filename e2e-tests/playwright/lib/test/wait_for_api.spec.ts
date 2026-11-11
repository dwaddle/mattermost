// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import http from 'node:http';
import type {AddressInfo} from 'node:net';

import {expect, test, type Page} from '@playwright/test';

import {SettleError, waitForApiIn} from '../src/aria/settle';
import {waitForApi} from '../src/settle';
import {testConfig} from '../src/test_config';
import {Api} from '../src/ui/generated/api';

import {GetChannel, GetMe, GetUser, json, serve, sleep} from './serve';

/** The page fetching on its own (a websocket event, a view loading), not through an action of the test. */
function pageFetches(p: Page, ...urls: string[]) {
    return p.evaluate(async (list) => {
        for (const url of list) {
            await fetch(url).catch(() => undefined);
        }
    }, urls);
}

/** The page's `request` listeners (Playwright's page is an event emitter; its type doesn't list the method). */
function requestListeners(p: Page): number {
    return (p as unknown as {listenerCount(event: string): number}).listenerCount('request');
}

test.describe('waitForApi', () => {
    test('returns the body of a response the page fetches on its own, started before and awaited after', async ({
        page: p,
    }) => {
        await serve(p, '', (route, path) => json(route, {id: path.split('/').pop()}));
        const channel = waitForApiIn(p, GetChannel);
        await pageFetches(p, '/api/v4/channels/c1');

        // the response is long in when the test awaits it: started before, it can't be missed
        await sleep(200);
        expect(await channel).toEqual({id: 'c1'});
    });

    test('ignores a matching request already in flight when it is called', async ({page: p}) => {
        let releaseOld!: () => void;
        const oldHeld = new Promise<void>((resolve) => {
            releaseOld = resolve;
        });
        await serve(p, '', async (route, path) => {
            if (path.endsWith('/old')) {
                await oldHeld;
            }
            await json(route, {id: path.split('/').pop()});
        });
        const inFlight = p.waitForRequest('**/api/v4/channels/old');
        pageFetches(p, '/api/v4/channels/old').catch(() => undefined);
        await inFlight;

        const channel = waitForApiIn(p, GetChannel);
        releaseOld();
        await pageFetches(p, '/api/v4/channels/new');
        expect(await channel).toEqual({id: 'new'});
    });

    test('params bind placeholders to one entity', async ({page: p}) => {
        await serve(p, '', (route, path) => json(route, {id: path.split('/').pop()}));
        const b = waitForApiIn(p, GetChannel, {params: {channel_id: 'b'}});
        await pageFetches(p, '/api/v4/channels/a', '/api/v4/channels/b');
        expect(await b).toEqual({id: 'b'});
    });

    test('a predicate skips responses until one holds, and a timeout says how many it skipped', async ({page: p}) => {
        let n = 0;
        await serve(p, '', (route) => json(route, {id: `v${++n}`}));
        const third = waitForApiIn(p, GetChannel, {predicate: (body) => body.id === 'v3'});
        await pageFetches(p, '/api/v4/channels/c', '/api/v4/channels/c', '/api/v4/channels/c');
        expect(await third).toEqual({id: 'v3'});

        const never = waitForApiIn(p, GetChannel, {predicate: (body) => body.id === 'none', timeout: 500});
        await pageFetches(p, '/api/v4/channels/c', '/api/v4/channels/c');
        const error = await never.catch((e) => e);
        expect(error).toBeInstanceOf(SettleError);
        expect(error.message).toContain(
            "no GET /api/v4/channels/{channel_id} (GetChannel) that satisfies the predicate (2 others didn't) within 500 ms",
        );
    });

    test('a {user_id} placeholder skips /users/me when the /me form is declared', async ({page: p}) => {
        await serve(p, '', (route, path) => json(route, {id: path.split('/').pop()}));
        const other = waitForApiIn(p, GetUser, {}, [GetUser, GetMe]);
        await pageFetches(p, '/api/v4/users/me', '/api/v4/users/u1');
        expect(await other).toEqual({id: 'u1'});

        // with only the template declared, a placeholder still matches me
        const any = waitForApiIn(p, GetUser);
        await pageFetches(p, '/api/v4/users/me');
        expect(await any).toEqual({id: 'me'});

        // the lib's waitForApi declares the generated Api: `GetChannelMemberMe` is the /me form of `GetChannelMember`
        const member = waitForApi(p, Api.GetChannelMember);
        await pageFetches(p, '/api/v4/channels/c/members/me', '/api/v4/channels/c/members/u2');
        expect(await member).toEqual({id: 'u2'});
    });

    test('follows a redirect to the final response', async ({page: p}) => {
        // a real server: the browser follows a redirect itself, and `page.route` doesn't see the hops
        const server = http.createServer((req, res) => {
            if (req.url === '/') {
                res.writeHead(200, {'content-type': 'text/html'}).end('<!doctype html><html><body></body></html>');
            } else if (req.url === '/api/v4/channels/abc') {
                res.writeHead(302, {location: '/api/v4/moved/abc'}).end();
            } else {
                res.writeHead(200, {'content-type': 'application/json'}).end(JSON.stringify({id: 'abc'}));
            }
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        try {
            await p.goto(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`);
            const channel = waitForApiIn(p, GetChannel, {timeout: 5_000});
            await pageFetches(p, '/api/v4/channels/abc');
            expect(await channel).toEqual({id: 'abc'});
        } finally {
            server.close();
        }
    });

    test('takes the retry when a request fails at the network level', async ({page: p}) => {
        let calls = 0;
        await serve(p, '', async (route) => {
            calls++;
            if (calls === 1) {
                await route.abort('connectionreset');
            } else {
                await json(route, {id: 'retry'});
            }
        });
        const channel = waitForApiIn(p, GetChannel);
        await pageFetches(p, '/api/v4/channels/c', '/api/v4/channels/c');
        expect(await channel).toEqual({id: 'retry'});
        expect(calls).toBe(2);
    });

    test('fails at once on an HTTP error, with the status and body; `status` expects one', async ({page: p}) => {
        await serve(p, '', (route) => json(route, {id: 'api.channel.missing', message: 'no such channel'}, 404));
        const started = Date.now();
        const failing = waitForApiIn(p, GetChannel, {timeout: 10_000});
        await pageFetches(p, '/api/v4/channels/c');
        const error = await failing.catch((e) => e);
        expect(error).toBeInstanceOf(SettleError);
        expect(error.message).toContain('waitForApi: GET /api/v4/channels/c returned 404');
        expect(error.message).toContain('no such channel');
        expect(Date.now() - started).toBeLessThan(5_000);

        const expected = waitForApiIn(p, GetChannel, {status: 404});
        await pageFetches(p, '/api/v4/channels/c');
        expect(await expected).toEqual({id: 'api.channel.missing', message: 'no such channel'});
    });

    test('a timeout counts from the call and lists the last API requests the page issued', async ({page: p}) => {
        await serve(p, '');
        const missing = waitForApiIn(p, GetChannel, {timeout: 500});
        await pageFetches(p, ...['a', 'b', 'c', 'd', 'e', 'f', 'g'].map((x) => `/api/v4/other/${x}`));
        const error = await missing.catch((e) => e);
        expect(error).toBeInstanceOf(SettleError);
        expect(error.message).toContain('waitForApi: no GET /api/v4/channels/{channel_id} (GetChannel) within 500 ms');
        expect(error.message).toContain(
            'The last API requests the page issued: GET /api/v4/other/c, GET /api/v4/other/d, GET /api/v4/other/e, GET /api/v4/other/f, GET /api/v4/other/g (after 2 earlier).',
        );
    });

    test('stops listening once it resolves, and matches the app path under a subpath', async ({page: p}) => {
        const baseURL = testConfig.baseURL;
        testConfig.baseURL = 'http://lib.test/sp';
        try {
            await serve(p, '', (route) => json(route, {id: 'sp'}), '/sp');
            const before = requestListeners(p);
            const channel = waitForApiIn(p, GetChannel);
            expect(requestListeners(p)).toBe(before + 1);
            await pageFetches(p, '/sp/api/v4/channels/c');
            expect(await channel).toEqual({id: 'sp'});
            expect(requestListeners(p)).toBe(before);
        } finally {
            testConfig.baseURL = baseURL;
        }
    });
});

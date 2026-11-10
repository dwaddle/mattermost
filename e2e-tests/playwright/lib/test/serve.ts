// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page, Route} from '@playwright/test';

import {drivers} from '../src/aria/drivers';
import {effect, type Meta} from '../src/aria/effects';

/** The origin the test pages are served from (never reaches the network: `page.route` answers every request). */
export const ORIGIN = 'http://lib.test';

export type ApiHandler = (route: Route, path: string) => Promise<void> | void;

/**
 * Serves `html` at `ORIGIN + base + '/'` and answers its API requests with `api` (by default 200 `{}`). Requests to
 * other paths get a 404.
 */
export async function serve(page: Page, html: string, api: ApiHandler = (route) => json(route, {}), base = '') {
    await page.route(`${ORIGIN}/**`, async (route) => {
        const path = new URL(route.request().url()).pathname;
        if (path === `${base}/`) {
            await route.fulfill({contentType: 'text/html', body: `<!doctype html><html><body>${html}</body></html>`});
        } else if (path.includes('/api/')) {
            await api(route, path);
        } else {
            await route.fulfill({status: 404, body: ''});
        }
    });
    await page.goto(`${ORIGIN}${base}/`);
}

export function json(route: Route, body: unknown, status = 200) {
    return route.fulfill({status, contentType: 'application/json', body: JSON.stringify(body)});
}

/** Metadata for a hand-made element, like the generator writes. */
export function metaOf<const E extends Meta['effects'], const U extends boolean = false>(
    testId: string,
    role: string | null,
    effects: E,
    unknownEffects?: U,
) {
    return {
        testId,
        role,
        effects,
        unknownEffects: (unknownEffects ?? false) as U,
        source: `test/fixture.tsx#${testId.split('.')[0]}`,
    } as const;
}

export function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export type Body = {id: string};
export const CreatePost = effect<Body>()({op: 'CreatePost', method: 'POST', path: '/api/v4/posts'});
export const GetUser = effect<Body>()({op: 'GetUser', method: 'GET', path: '/api/v4/users/{user_id}'});
export const GetChannel = effect<Body>()({op: 'GetChannel', method: 'GET', path: '/api/v4/channels/{channel_id}'});
export const UploadFile = effect<Body>()({op: 'UploadFile', method: 'POST', path: '/api/v4/files'});

/** A button whose click runs `onclick` (page JS), declaring `effects`. */
export function button<const E extends ReadonlyArray<typeof CreatePost>>(page: Page, effects: E) {
    return drivers.button(page.getByTestId('x.save--button'), metaOf('x.save--button', 'button', effects));
}

/** A page with one button, `x.save--button`, whose click runs `onclick`. */
export function page(onclick: string) {
    return `<button data-testid="x.save--button" onclick="${onclick.replace(/"/g, '&quot;')}">Save</button>`;
}

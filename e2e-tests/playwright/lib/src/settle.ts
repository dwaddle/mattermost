// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Response} from '@playwright/test';

import {type BodyOf, type Effect, type Meta, pathPattern} from './aria/effects';

type AnyEffect = Effect<unknown, string>;
type WithMeta<M> = {readonly locator: {page(): import('@playwright/test').Page}; readonly meta: M};

/** An element whose action fires exactly one known request. */
type Single = WithMeta<Meta<readonly [AnyEffect], false>>;

/** An element whose action can fire several requests: the test says which one it waits for. */
type Multi = WithMeta<Meta<readonly [AnyEffect, AnyEffect, ...AnyEffect[]], false>>;

/** An element whose handler calls through data: its requests aren't all known, so `wait` names one. */
type Unknown = WithMeta<Meta<readonly AnyEffect[], true>>;

/** A shared modal's element whose requests depend on the opener (opened some other way): `wait` names one. */
type Known = WithMeta<Meta<readonly AnyEffect[], false>>;

export type SettleOptions = {
    /** Expect this status instead of a 2xx (negative tests). */
    status?: number;
    timeout?: number;
};

export class SettleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SettleError';
    }
}

/**
 * The framework's "wait until done": starts waiting for the element's API request, performs the action,
 * and returns the response body, typed from the operation. It waits for the server to finish the request,
 * not for the UI to re-render (Mattermost updates many views over the websocket afterwards); assert UI
 * state with the retrying matchers.
 *
 *   await settle(settings.savePanel.saveButton, (b) => b.click());                     // one effect (`wait` optional)
 *   await settle(composer.sendButton, (b) => b.click(), {wait: Api.CreatePost});        // several
 *
 * Elements with no effects don't compile here: use a matcher instead.
 */
export function settle<El extends Single>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts?: SettleOptions & {wait?: El['meta']['effects'][0]},
): Promise<BodyOf<El['meta']['effects'][0]>>;
export function settle<El extends Multi, W extends El['meta']['effects'][number]>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & {wait: W},
): Promise<BodyOf<W>>;
export function settle<El extends Unknown, W extends AnyEffect>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & {wait: W},
): Promise<BodyOf<W>>;
export function settle<El extends Known, W extends El['meta']['effects'][number]>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & {wait: W},
): Promise<BodyOf<W>>;
export async function settle(
    el: WithMeta<Meta>,
    act: (el: any) => Promise<unknown>,
    opts: SettleOptions & {wait?: AnyEffect} = {},
): Promise<unknown> {
    const page = el.locator.page();
    const expected = opts.wait ? [opts.wait] : el.meta.effects;
    if (!expected.length) {
        throw new SettleError(
            `settle: "${el.meta.testId}" fires no known request (${el.meta.source}); assert with a matcher instead.`,
        );
    }
    const patterns = expected.map((op) => ({op, method: op.method.toUpperCase(), re: pathPattern(op.path)}));
    const matches = (res: Response) => {
        const req = res.request();
        const url = new URL(res.url());
        return patterns.some((p) => p.method === req.method() && p.re.test(url.pathname));
    };
    const timeout = opts.timeout ?? 30_000;
    const waiting = page.waitForResponse(matches, {timeout});

    // a failed action must not leave the response wait rejecting unobserved
    waiting.catch(() => undefined);
    await act(el);

    let res: Response;
    try {
        res = await waiting;
    } catch {
        const ops = patterns.map((p) => `${p.method} ${p.op.path} (${p.op.op})`).join(' or ');
        throw new SettleError(
            `settle: no ${ops} after acting on "${el.meta.testId}" within ${timeout} ms (element emitted at ${el.meta.source}).`,
        );
    }
    const ok = opts.status === undefined ? res.ok() : res.status() === opts.status;
    if (!ok) {
        const body = await res.text().catch(() => '');
        throw new SettleError(
            `settle: ${res.request().method()} ${new URL(res.url()).pathname} returned ${res.status()}${opts.status ? `, expected ${opts.status}` : ''} after acting on "${el.meta.testId}" (${el.meta.source}). ${body.slice(0, 300)}`,
        );
    }
    const text = await res.text();
    return text ? JSON.parse(text) : undefined;
}

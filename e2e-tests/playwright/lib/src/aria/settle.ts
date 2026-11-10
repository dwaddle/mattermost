// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page, Request, Response} from '@playwright/test';

import {testConfig} from '../test_config';

import {type BodyOf, type Effect, type Meta, type PathParamsOf, pathPattern} from './effects';

type AnyEffect = Effect<unknown, string, string>;
type WithMeta<M> = {readonly locator: {page(): Page}; readonly meta: M};

/** An element whose action fires exactly one known request. */
export type Single = WithMeta<Meta<readonly [AnyEffect], false>>;

/** An element whose action can fire several requests: the test says which one it waits for. */
export type Multi = WithMeta<Meta<readonly [AnyEffect, AnyEffect, ...AnyEffect[]], false>>;

/** An element whose handler calls through data: its requests aren't all known, so `wait` names one. */
export type Unknown = WithMeta<Meta<readonly AnyEffect[], true>>;

/** A shared modal's element whose requests depend on the opener (opened some other way): `wait` names one. */
export type Known = WithMeta<Meta<readonly AnyEffect[], false>>;

/** Any element with metadata. */
export type Element = WithMeta<Meta>;

/** The first (only) effect of a single-effect element. */
export type EffectOf<El extends Single> = El['meta']['effects'][0];

export type SettleOptions = {
    /** Expect this status instead of a 2xx (negative tests). */
    status?: number;

    /** How long to wait for the request and its response, counted from when the action returns (default 30 s). */
    timeout?: number;
};

/**
 * Which request to wait for. `params` binds the operation's path placeholders, so only the request for that entity
 * matches: `{wait: Api.GetChannel, params: {channel_id: channel.id}}`. Mutations aren't fired by the websocket, so
 * waiting for "the next POST/PUT/PATCH/DELETE after the action" is exact; a GET can also be fired by a websocket
 * event during the action, so a GET wait without `params` is best-effort.
 */
export type WaitFor<W> = {wait: W; params?: PathParamsOf<W>};

/**
 * The escape for a request the element's metadata doesn't list (the scanner missed it, so file it): any operation,
 * on any element, spelled out so it can be found. `{wait: Api.CreateJob, unlisted: true}`.
 */
export type Unlisted<W> = WaitFor<W> & {unlisted: true};

export class SettleError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SettleError';
    }
}

/**
 * The framework's "wait until done": performs the action and waits for the API request it causes, returning the
 * response body, typed from the operation. It waits for the server to finish the request, not for the UI to
 * re-render (Mattermost updates many views over the websocket afterwards); assert UI state with the retrying matchers.
 *
 *   await settle(settings.savePanel.saveButton, (b) => b.click());                     // one effect (`wait` optional)
 *   await settle(composer.sendButton, (b) => b.click(), {wait: Api.CreatePost});        // several
 *
 * Only requests the page issues after the action starts count (one already in flight is someone else's), redirects
 * are followed to the final response, a request that fails at the network level gives way to a retry, and an HTTP
 * error fails at once with its body. The timeout starts when the action returns, so a click that waits for its
 * element doesn't use it up. Requests are matched on the app path, so this works under a subpath.
 *
 * Elements with no effects don't compile here: use a matcher, or name the request with `unlisted: true`.
 */
export function settle<El extends Single>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts?: SettleOptions & {wait?: EffectOf<El>; params?: PathParamsOf<EffectOf<El>>},
): Promise<BodyOf<EffectOf<El>>>;
export function settle<El extends Multi, W extends El['meta']['effects'][number]>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & WaitFor<W>,
): Promise<BodyOf<W>>;
export function settle<El extends Unknown, W extends AnyEffect>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & WaitFor<W>,
): Promise<BodyOf<W>>;
export function settle<El extends Known, W extends El['meta']['effects'][number]>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & WaitFor<W>,
): Promise<BodyOf<W>>;
export function settle<El extends Element, W extends AnyEffect>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & Unlisted<W>,
): Promise<BodyOf<W>>;
export async function settle(el: Element, act: (el: any) => Promise<unknown>, opts: AnyOptions = {}): Promise<unknown> {
    const [body] = await settleCore(el, act, opts, 1);
    return body;
}

/**
 * `settle` for an action that fires one request per item (Mattermost uploads each file on its own): waits for
 * `count` successful requests and returns their bodies in the order they were issued.
 *
 *   const chooser = page.waitForEvent('filechooser');
 *   const files = await settleAll(composer.attachButton, async (b) => { await b.click(); await (await chooser).setFiles(paths); },
 *       {wait: Api.UploadFile, count: paths.length});
 */
export function settleAll<El extends Single>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & {count: number; wait?: EffectOf<El>; params?: PathParamsOf<EffectOf<El>>},
): Promise<Array<BodyOf<EffectOf<El>>>>;
export function settleAll<El extends Multi, W extends El['meta']['effects'][number]>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & WaitFor<W> & {count: number},
): Promise<Array<BodyOf<W>>>;
export function settleAll<El extends Unknown, W extends AnyEffect>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & WaitFor<W> & {count: number},
): Promise<Array<BodyOf<W>>>;
export function settleAll<El extends Known, W extends El['meta']['effects'][number]>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & WaitFor<W> & {count: number},
): Promise<Array<BodyOf<W>>>;
export function settleAll<El extends Element, W extends AnyEffect>(
    el: El,
    act: (el: El) => Promise<unknown>,
    opts: SettleOptions & Unlisted<W> & {count: number},
): Promise<Array<BodyOf<W>>>;
export function settleAll(
    el: Element,
    act: (el: any) => Promise<unknown>,
    opts: AnyOptions & {count: number},
): Promise<unknown[]> {
    return settleCore(el, act, opts, opts.count);
}

/** The options any overload passes (the implementation's view). */
export type AnyOptions = SettleOptions & {
    wait?: AnyEffect;
    params?: Record<string, string | undefined>;
    unlisted?: true;
};

/** The app path of a request URL (without the server's subpath). */
function appPath(url: string): string {
    return testConfig.withoutSubpath(new URL(url).pathname);
}

/** Where an element comes from, for failure messages. */
export function describeElement(meta: Pick<Meta, 'testId' | 'source'>): string {
    return `"${meta.testId}" (${meta.source})`;
}

const TIMED_OUT = Symbol('timed out');

/** `p`, or TIMED_OUT once the deadline passes. */
async function beforeDeadline<T>(p: Promise<T>, deadline: number): Promise<T | typeof TIMED_OUT> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<typeof TIMED_OUT>((resolve) => {
        timer = setTimeout(() => resolve(TIMED_OUT), Math.max(0, deadline - Date.now()));
    });
    try {
        return await Promise.race([p, timeout]);
    } finally {
        clearTimeout(timer);
    }
}

/** The response a request ends with, following redirects; null when it failed at the network level. */
async function finalResponse(req: Request): Promise<Response | null> {
    let current = req;
    for (;;) {
        const res = await current.response();
        if (!res || res.status() < 300 || res.status() >= 400) {
            return res;
        }
        const next = current.redirectedTo();
        if (!next) {
            return res;
        }
        current = next;
    }
}

async function settleCore(el: Element, act: (el: any) => Promise<unknown>, opts: AnyOptions, count: number) {
    const page = el.locator.page();
    const expected = opts.wait ? [opts.wait] : el.meta.effects;
    if (!expected.length) {
        throw new SettleError(
            `settle: ${describeElement(el.meta)} fires no known request; assert with a matcher instead, or name the request with {wait, unlisted: true}.`,
        );
    }
    const patterns = expected.map((op) => ({
        op,
        method: op.method.toUpperCase(),
        re: pathPattern(op.path, opts.params),
    }));
    const wanted = patterns.map((p) => `${p.method} ${p.op.path} (${p.op.op})`).join(' or ');
    const timeout = opts.timeout ?? 30_000;

    // registered before the action: a request issued earlier (in flight when it starts) is never a candidate
    const candidates: Request[] = [];
    const issued: Request[] = [];
    let arrived = signal();
    const onRequest = (req: Request) => {
        // a redirect hop: followed from the request that started it
        if (req.redirectedFrom()) {
            return;
        }
        const path = appPath(req.url());
        if (path.startsWith('/api/')) {
            issued.push(req);
        }
        if (patterns.some((p) => p.method === req.method() && p.re.test(path))) {
            candidates.push(req);
            arrived.resolve();
            arrived = signal();
        }
    };
    page.on('request', onRequest);
    try {
        await act(el);

        // the clock starts once the action has returned (a click auto-waits for its element first)
        const deadline = Date.now() + timeout;
        const bodies: unknown[] = [];
        const failed: Request[] = [];
        for (let i = 0; bodies.length < count; i++) {
            while (i >= candidates.length) {
                if ((await beforeDeadline(arrived.promise, deadline)) === TIMED_OUT) {
                    throw new SettleError(
                        `settle: ${bodies.length ? `${bodies.length} of ${count} ` : 'no '}${wanted} within ${timeout} ms after acting on ${describeElement(el.meta)}.` +
                            seenRequests(issued, failed),
                    );
                }
            }
            const req = candidates[i];
            const res = await beforeDeadline(finalResponse(req), deadline);
            if (res === TIMED_OUT) {
                throw new SettleError(
                    `settle: ${req.method()} ${appPath(req.url())} (${wanted}) had no response within ${timeout} ms after acting on ${describeElement(el.meta)}.`,
                );
            }
            if (!res) {
                // failed at the network level (aborted, connection reset): the app may retry, so wait for the next one
                failed.push(req);
                continue;
            }
            bodies.push(await bodyOf(res, el, opts));
        }
        return bodies;
    } finally {
        page.off('request', onRequest);
    }
}

async function bodyOf(res: Response, el: Element, opts: AnyOptions): Promise<unknown> {
    const ok = opts.status === undefined ? res.ok() : res.status() === opts.status;
    const text = await res.text().catch(() => '');
    if (!ok) {
        throw new SettleError(
            `settle: ${res.request().method()} ${appPath(res.url())} returned ${res.status()}${opts.status ? `, expected ${opts.status}` : ''} after acting on ${describeElement(el.meta)}. ${text.slice(0, 300)}`,
        );
    }
    if (!text) {
        return undefined;
    }
    try {
        return JSON.parse(text);
    } catch {
        return text;
    }
}

function seenRequests(issued: Request[], failed: Request[]): string {
    const lines = issued
        .slice(0, 5)
        .map((r) => `${r.method()} ${appPath(r.url())}${failed.includes(r) ? ' (failed)' : ''}`);
    if (!lines.length) {
        return ' The page issued no API request.';
    }
    const more = issued.length > lines.length ? ` (and ${issued.length - lines.length} more)` : '';
    return ` API requests the page issued: ${lines.join(', ')}${more}.`;
}

function signal(): {promise: Promise<void>; resolve: () => void} {
    let resolve!: () => void;
    const promise = new Promise<void>((r) => {
        resolve = r;
    });
    return {promise, resolve};
}

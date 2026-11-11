// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator, Page} from '@playwright/test';

import {Driver} from './drivers';
import {formatMessage, type Message, type ParamsOf} from './msg';

/**
 * Base of every generated page-object class. A scope is a testid prefix (`channel_settings_modal`,
 * `center.post_create`); its elements are located by full testid inside `root` (the page, or the
 * element of a repeated item). A class generated for a component that renders at several roots
 * takes the scope as a constructor argument, so one class serves every mount.
 */
export class Scope {
    readonly page: Page;
    readonly scope: string;
    readonly root: Locator;

    constructor(page: Page, scope: string, root?: Locator) {
        this.page = page;
        this.scope = scope;
        this.root = root ?? page.locator(':root');
    }

    /**
     * The class's scope rendered inside another element: `generated.Markdown.within(post)` for a component with its
     * own top-level scope (`markdown`) that other components render. Only for classes with a default scope (their
     * constructor's `scope` is optional), so the scope string is never typed by hand.
     */
    static within<T extends Scope>(
        this: new (page: Page, scope?: string, root?: Locator) => T,
        root: Scope | Driver | Locator,
    ): T {
        const locator = root instanceof Scope || root instanceof Driver ? root.locator : root;
        return new this(locator.page(), undefined, locator);
    }

    /** The scope's own container element, when it renders one. */
    get container(): Locator {
        return this.root.getByTestId(this.scope);
    }

    /**
     * The element this scope is: its container, or (for a repeated item) the item's element. Matchers take
     * scopes too: `await expect(app.center.postList).toContainMessage(Msg…)`.
     */
    get locator(): Locator {
        return this.container;
    }

    /**
     * An element by full testid inside the scope. `popup` is for content a popup renders in a portal, outside the
     * scope's element (a combobox's or listbox's options): it's found from the page, as only one popup is open at a time.
     */
    protected byTestId(testId: string, popup = false): Locator {
        return (popup ? this.page.locator(':root') : this.root).getByTestId(testId);
    }

    /**
     * Every element of a repeated item: `scope.name:<key>--role`, or `scope.name:<key>` when it has no role.
     * Matched exactly: a key has no `.`, `:` or `--`, so a longer testid that shares the prefix (a nested
     * item, another role) is not counted. (CSS `[data-testid$=""]` matches nothing, hence not a selector.)
     */
    protected byTestIdPattern(prefix: string, suffix: string, popup = false): Locator {
        return (popup ? this.page.locator(':root') : this.root).getByTestId(
            new RegExp(`^${escapeRegExp(prefix)}(?:(?!--)[^.:])+${escapeRegExp(suffix)}$`),
        );
    }

    /** The keys of every element of a repeated item, in document order (for asserting what a list shows, and in what order). */
    protected async keysOf(prefix: string, suffix: string, popup = false): Promise<string[]> {
        const ids = await this.byTestIdPattern(prefix, suffix, popup).evaluateAll((els) =>
            els.map((el) => el.getAttribute('data-testid') ?? ''),
        );
        return ids.map((id) => id.slice(prefix.length, id.length - suffix.length));
    }

    /**
     * A repeated item as a list: `get posts(): KeyedList<string, PostItem> { return this.keyedList(`${this.scope}.post:`, '', (id) => this.post({id})); }`.
     */
    protected keyedList<K extends string, Item>(
        prefix: string,
        suffix: string,
        itemOf: (key: K) => Item,
        popup = false,
    ): KeyedList<K, Item> {
        return new KeyedList(this.byTestIdPattern(prefix, suffix, popup), itemOf, `${prefix}{key}${suffix}`);
    }
}

/** What to find an item by: its text (a substring or a pattern), a catalog message, or an element inside it. */
export type ContentFilter<M extends Message<any> = Message<any>> = {
    text?: string | RegExp;
    message?: M;
    values?: ParamsOf<M>;
    has?: Locator;
};

/**
 * The items of a repeated testid (`scope.name:{key}`), by key. Keys come from the testids (a key has no `.`, `:` or
 * `--`), in document order. Matchers retry over it: `await expect(list.posts).toHaveKeys([a.id, b.id])`,
 * `toContainKeys`, `toHaveKeyCount`.
 */
export class KeyedList<K extends string = string, Item = Locator> {
    /**
     * @param locator every item's element (a testid pattern locator)
     * @param itemOf the page object for a key
     * @param label the testid pattern, for failure messages (`center.post_list.post:{key}`)
     */
    constructor(
        readonly locator: Locator,
        private readonly itemOf: (key: K) => Item,
        readonly label: string = String(locator),
    ) {}

    /** The item with this key (doesn't wait for it). */
    item(key: K): Item {
        return this.itemOf(key);
    }

    /** The keys of the items shown now, in document order (doesn't wait: assert with the list matchers). */
    async keys(): Promise<K[]> {
        const ids = await this.locator.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? ''));
        return ids.map((id) => keyOfTestId(id) as K);
    }

    /** The last item, once the list shows at least one (the newest post in a channel). */
    async last(opts: {timeout?: number} = {}): Promise<Item> {
        const keys = await this.waitForKeys((k) => k.length > 0, 'at least one item', opts.timeout);
        return this.itemOf(keys[keys.length - 1]);
    }

    /** The first item, once the list shows at least one. */
    async first(opts: {timeout?: number} = {}): Promise<Item> {
        const keys = await this.waitForKeys((k) => k.length > 0, 'at least one item', opts.timeout);
        return this.itemOf(keys[0]);
    }

    /** The key of the one item matching `filter`; waits until exactly one matches. */
    async keyWith<M extends Message<any>>(filter: ContentFilter<M>, opts: {timeout?: number} = {}): Promise<K> {
        const matching = this.locator.filter(filterOf(filter));
        const deadline = Date.now() + (opts.timeout ?? DEFAULT_TIMEOUT);
        let ids: string[] = [];
        for (;;) {
            ids = await matching.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid') ?? ''));
            if (ids.length === 1) {
                return keyOfTestId(ids[0]) as K;
            }
            if (Date.now() > deadline) {
                break;
            }
            await sleep(100);
        }
        const keys = ids.map(keyOfTestId);
        throw new Error(
            `${this.label}: expected exactly one item with ${describeFilter(filter)}, found ${ids.length}${keys.length ? ` (${keys.join(', ')})` : ''}; the list has ${(await this.keys()).length} items`,
        );
    }

    /** The one item matching `filter` (its text, a catalog message, or an element inside it); waits until exactly one matches. */
    async itemWith<M extends Message<any>>(filter: ContentFilter<M>, opts: {timeout?: number} = {}): Promise<Item> {
        return this.itemOf(await this.keyWith(filter, opts));
    }

    private async waitForKeys(ok: (keys: K[]) => boolean, what: string, timeout = DEFAULT_TIMEOUT): Promise<K[]> {
        const deadline = Date.now() + timeout;
        for (;;) {
            const keys = await this.keys();
            if (ok(keys)) {
                return keys;
            }
            if (Date.now() > deadline) {
                throw new Error(`${this.label}: expected ${what} within ${timeout} ms, found ${keys.length}`);
            }
            await sleep(100);
        }
    }
}

const DEFAULT_TIMEOUT = 10_000;

/** The key of a keyed testid: `center.post_list.post:abc` / `…item:abc--button` -> `abc`. */
export function keyOfTestId(testId: string): string {
    return /:((?:(?!--)[^.:])+)(?:--[a-z]+)?$/.exec(testId)?.[1] ?? testId;
}

/** The key of a keyed element found some other way (a list item filtered by its text): `center.post_list.post:abc` -> `abc`. */
export async function keyOfElement(element: Locator): Promise<string> {
    const testId = await element.getAttribute('data-testid');
    if (!testId) {
        throw new Error(`${String(element)} has no testid to read a key from`);
    }
    return keyOfTestId(testId);
}

/**
 * A CSS selector for a generated element, for the APIs that take selectors rather than locators (axe's `include()`,
 * scripts that run in the page): a driver or a scope by its testid, or every item of a keyed list, optionally only the
 * items rendered as `tag` (`testIdSelector(app.settings.sectionList, {tag: 'section'})`).
 */
export function testIdSelector(
    target: {meta: {testId: string}} | Scope | KeyedList<string, unknown>,
    opts: {tag?: string} = {},
): string {
    const tag = opts.tag ?? '';
    if (target instanceof KeyedList) {
        const [prefix, suffix] = target.label.split('{key}');
        if (suffix === undefined) {
            throw new Error(`${target.label} is not a keyed testid pattern`);
        }
        return `${tag}[data-testid^="${prefix}"]${suffix ? `[data-testid$="${suffix}"]` : ''}`;
    }
    return `${tag}[data-testid="${target instanceof Scope ? target.scope : target.meta.testId}"]`;
}

function filterOf(filter: ContentFilter): {hasText?: string | RegExp; has?: Locator} {
    const hasText = filter.message ? formatMessage(filter.message, filter.values) : filter.text;
    return {...(hasText === undefined ? {} : {hasText}), ...(filter.has ? {has: filter.has} : {})};
}

function describeFilter(filter: ContentFilter): string {
    if (filter.message) {
        return `message ${filter.message.id} ("${formatMessage(filter.message, filter.values)}")`;
    }
    if (filter.text !== undefined) {
        return `text ${typeof filter.text === 'string' ? `"${filter.text}"` : String(filter.text)}`;
    }
    return filter.has ? `an element ${String(filter.has)}` : 'no filter';
}

function sleep(ms: number) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

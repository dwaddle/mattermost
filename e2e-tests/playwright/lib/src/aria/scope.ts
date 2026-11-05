// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator, Page} from '@playwright/test';

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
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

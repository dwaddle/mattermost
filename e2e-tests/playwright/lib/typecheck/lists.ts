// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for scopes and keyed lists (`npm run tsc` in lib): `Scope.within` takes only classes with a
// default scope, and the list matchers and finders are typed. Each `@ts-expect-error` must be an error.

import type {Locator, Page} from '@playwright/test';

import {expect, generated, lastPost, postWith, type KeyedList} from '../src';
import {msg, Scope} from '../src/aria';

declare const page: Page;

class Markdown extends Scope {
    constructor(page: Page, scope = 'markdown', root?: Locator) {
        super(page, scope, root);
    }
}

export async function scopeTests(list: KeyedList<string, Markdown>) {
    // a class with a default scope, inside another element
    const md: Markdown = Markdown.within(page.locator('x'));
    generated.Admin.within(md);
    // @ts-expect-error a class without a default scope needs its scope spelled out
    Scope.within(md);

    // keyed lists: retrying matchers, find by content
    await expect(list).toHaveKeys(['a', 'b']);
    await expect(list).toHaveKeys(['b', 'a'], {ordered: false});
    await expect(list).toContainKeys(['a']);
    await expect(list).toHaveKeyCount(2);
    const last: Markdown = await list.last();
    const found: Markdown = await list.itemWith({text: 'hello'});

    // the post flows take the generated post lists (`post(post)`, `postItems`)
    const posts = {post: (p: {id: string}) => Markdown.within(page.getByTestId(p.id)), postItems: page.locator('x')};
    const newest: Markdown = await lastPost(posts);
    const byMessage: Markdown = await postWith(posts, {
        message: msg<{name: string}>('x.hello', 'Hello {name}'),
        values: {name: 'a'},
    });
    // @ts-expect-error the message's values are typed
    await postWith(posts, {message: msg<{name: string}>('x.hello', 'Hello {name}'), values: {other: 'a'}});
    return {last, found, newest, byMessage};
}

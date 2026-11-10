// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test, expect as baseExpect, type Locator, type Page} from '@playwright/test';

import {expect} from '../src/aria/matchers';
import {msg} from '../src/aria/msg';
import type {KeyedList} from '../src/aria/scope';
import {Scope, keyOfTestId} from '../src/aria/scope';
import {lastPost, postsOf, postWith} from '../src/flows/posts';

import {serve} from './serve';

/** A generated-like list scope: `list.item:{key}` items, each a scope. */
class Item extends Scope {
    constructor(page: Page, scope = 'list.item', root?: Locator) {
        super(page, scope, root);
    }

    override get locator(): Locator {
        return this.root;
    }
}

class List extends Scope {
    constructor(page: Page, scope = 'list', root?: Locator) {
        super(page, scope, root);
    }

    item(item: {id: string}): Item {
        return new Item(this.page, `${this.scope}.item`, this.byTestId(`${this.scope}.item:${item.id}`));
    }

    get items(): KeyedList<string, Item> {
        return this.keyedList(`${this.scope}.item:`, '', (id) => this.item({id}));
    }

    /** The shape the generator emits today (`post(post)`, `postItems`), for the post flows. */
    post(post: {id: string}): Item {
        return this.item(post);
    }

    get postItems(): Locator {
        return this.byTestIdPattern(`${this.scope}.item:`, '');
    }
}

/** Items a, b now; c after 500 ms. Each item has a nested keyed button, which must not count as an item. */
const listPage = `
<ul data-testid="list">
    <li data-testid="list.item:a">Hello Ann <button data-testid="list.item:a.react:x--button">x</button></li>
    <li data-testid="list.item:b">Bob joined the channel.</li>
</ul>
<script>
    setTimeout(() => {
        const li = document.createElement('li');
        li.dataset.testid = 'list.item:c';
        li.textContent = 'Carol joined the channel.';
        document.querySelector('ul').append(li);
    }, 500);
</script>`;

test.describe('KeyedList', () => {
    test('retrying matchers wait for the list to show the keys', async ({page}) => {
        await serve(page, listPage);
        const list = new List(page);
        await expect(list.items).toHaveKeys(['a', 'b', 'c']);
        await expect(list.items).toHaveKeys(['c', 'b', 'a'], {ordered: false});
        await expect(list.items).toContainKeys(['c']);
        await expect(list.items).toHaveKeyCount(3);
        await expect(list.items).not.toHaveKeyCount(2);
    });

    test('a failing list matcher names the testid pattern and the keys it saw', async ({page}) => {
        await serve(page, listPage);
        const error = await expect(new List(page).items)
            .toHaveKeys(['a', 'z'], {timeout: 300})
            .catch((e) => e);
        baseExpect(error.message).toContain('toHaveKeys: list.item:{key}');
        baseExpect(error.message).toMatch(/keys now: \[a, b(, c)?\]/);
    });

    test('finds items by content, and the last item', async ({page}) => {
        await serve(page, listPage);
        const list = new List(page);
        // a string is a case-insensitive substring (Playwright's hasText): 'Ann' would match "channel" too
        baseExpect(await list.items.keyWith({text: 'Hello Ann'})).toBe('a');
        const carol = await list.items.itemWith({
            message: msg<{name: string}>('x.joined', '{name} joined the channel.'),
            values: {name: 'Carol'},
        });
        await baseExpect(carol.locator).toHaveAttribute('data-testid', 'list.item:c');

        const error = await list.items.keyWith({text: 'joined'}, {timeout: 700}).catch((e) => e);
        baseExpect(error.message).toContain('expected exactly one item with text "joined", found 2 (b, c)');

        await baseExpect.poll(() => list.items.keys()).toHaveLength(3);
        const last = await list.items.last();
        await baseExpect(last.locator).toHaveText('Carol joined the channel.');
    });

    test('the post flows work on the generated list shape', async ({page}) => {
        await serve(page, listPage);
        const list = new List(page);
        const bob = await postWith(list, {text: /^Bob/});
        await baseExpect(bob.locator).toHaveAttribute('data-testid', 'list.item:b');
        await expect(postsOf(list)).toHaveKeyCount(3);
        await baseExpect((await lastPost(list)).locator).toHaveAttribute('data-testid', 'list.item:c');
    });

    test('keys come from testids', () => {
        baseExpect(keyOfTestId('center.post_list.post:abc')).toBe('abc');
        baseExpect(keyOfTestId('lhs.channel:town-square--link')).toBe('town-square');
        baseExpect(keyOfTestId('a.b:k1.c:k2')).toBe('k2');
    });
});

test.describe('Scope.within', () => {
    class Markdown extends Scope {
        constructor(page: Page, scope = 'markdown', root?: Locator) {
            super(page, scope, root);
        }
    }

    test('builds a class with its default scope inside another element', async ({page}) => {
        await serve(
            page,
            `<div data-testid="list.item:a"><div data-testid="markdown">first</div></div>
             <div data-testid="list.item:b"><div data-testid="markdown">second</div></div>`,
        );
        const list = new List(page);
        const md = Markdown.within(list.item({id: 'b'}));
        baseExpect(md.scope).toBe('markdown');
        await baseExpect(md.container).toHaveText('second');
        await baseExpect(Markdown.within(page.getByTestId('list.item:a')).container).toHaveText('first');
    });
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for the drivers (`npm run tsc` in lib): `commit()` on buttons and `submit()` on textboxes are
// typed like `settle`, and the base driver's actions exist on every driver. Each `@ts-expect-error` must be an error.

import type {Page} from '@playwright/test';
import type {Post} from '@mattermost/types/posts';
import type {ServerChannel} from '@mattermost/types/channels';

import {drivers, effect} from '../src/aria';
import {Api} from '../src/ui/generated';

declare const page: Page;
const one = effect<Post>()({op: 'CreatePost', method: 'POST', path: '/api/v4/posts'});
const other = effect<ServerChannel>()({op: 'PatchChannel', method: 'PUT', path: '/api/v4/channels/{channel_id}/patch'});
const meta = {testId: 'a.b--button', role: 'button', source: 'x.tsx#X'} as const;

export async function commitTests() {
    // one effect: commit() waits for it and returns its body
    const single = drivers.button(page.locator('x'), {...meta, effects: [one], unknownEffects: false});
    const post: Post = await single.commit();
    await single.commit({timeout: 5000, status: 403});

    // several: `wait` is required and must be one of them
    const multi = drivers.button(page.locator('x'), {...meta, effects: [one, other], unknownEffects: false});
    const channel: ServerChannel = await multi.commit({wait: other, params: {channel_id: 'abc'}});
    // @ts-expect-error several effects and no `wait`
    await multi.commit();
    // @ts-expect-error `wait` is not one of the element's operations
    await multi.commit({wait: Api.GetUser});
    // @ts-expect-error `params` names a placeholder the path doesn't have
    await multi.commit({wait: other, params: {team_id: 'abc'}});

    // no effects: doesn't compile, unless the request is named as unlisted
    const none = drivers.button(page.locator('x'), {...meta, effects: [], unknownEffects: false});
    // @ts-expect-error no effects
    await none.commit();
    const job: Post = await none.commit({wait: one, unlisted: true});

    // calls through data: any operation, but `wait` is required
    const unknown = drivers.button(page.locator('x'), {...meta, effects: [], unknownEffects: true});
    await unknown.commit({wait: Api.GetUser});
    // @ts-expect-error unknown effects and no `wait`
    await unknown.commit();

    // links and menu items are buttons
    const link = drivers.link(page.locator('x'), {...meta, effects: [one], unknownEffects: false});
    const linked: Post = await link.commit();

    // textboxes submit with a key
    const textbox = drivers.textbox(page.locator('x'), {...meta, effects: [one, other], unknownEffects: false});
    const sent: Post = await textbox.submit('Enter', {wait: one});
    // @ts-expect-error several effects and no `wait`
    await textbox.submit('Enter');
    const plain = drivers.textbox(page.locator('x'), {...meta, effects: [], unknownEffects: false});
    // @ts-expect-error no effects
    await plain.submit();

    // only drivers that act get commit()
    const text = drivers.text(page.locator('x'), {...meta, effects: [one], unknownEffects: false});
    // @ts-expect-error a text has no commit
    await text.commit();

    return {post, channel, job, linked, sent};
}

export async function actionTests() {
    // the base driver's actions, on every driver
    const text = drivers.text(page.locator('x'), {...meta, role: 'text', effects: [], unknownEffects: false});
    await text.hover();
    await text.press('Escape');
    await text.focus();
    await text.blur();

    // a toggle button sets its state; press() presses a key (press(on) is the deprecated setPressed)
    const toggle = drivers.togglebutton(page.locator('x'), {
        ...meta,
        role: 'togglebutton',
        effects: [],
        unknownEffects: false,
    });
    await toggle.setPressed(true);
    await toggle.press('Enter');
    await toggle.press(false);

    const group = drivers.radiogroup(page.locator('x'), {
        ...meta,
        role: 'radiogroup',
        effects: [],
        unknownEffects: false,
    });
    await group.choose('Yes');
    const chosen: boolean = await group.isChosen(/yes/i);
    return chosen;
}

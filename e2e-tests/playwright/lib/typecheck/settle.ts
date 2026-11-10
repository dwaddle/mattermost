// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for `settle` and the generated page objects (`npm run tsc` in lib). Each
// `@ts-expect-error` must be an error; the other calls must compile with the stated types.

import type {Page} from '@playwright/test';
import type {Post} from '@mattermost/types/posts';
import type {UpdateChannelBookmarkResponse} from '@mattermost/types/channel_bookmarks';
import type {ServerChannel} from '@mattermost/types/channels';

import {drivers, effect} from '../src/aria';
import {settle} from '../src/settle';
import {Api, App} from '../src/ui/generated';

declare const page: Page;
const app = new App(page);
const one = effect<Post>()({op: 'CreatePost', method: 'POST', path: '/api/v4/posts'});
const other = effect<ServerChannel>()({op: 'PatchChannel', method: 'PUT', path: '/api/v4/channels/{channel_id}/patch'});
const meta = {testId: 'a.b--button', role: 'button', source: 'x.tsx:1'} as const;

export async function typeTests() {
    // exactly one effect: no option, the body type comes from the operation
    const single = drivers.button(page.locator('x'), {...meta, effects: [one], unknownEffects: false});
    const post: Post = await settle(single, (b) => b.click());

    // several effects: `wait` is required and must be one of them
    const multi = drivers.button(page.locator('x'), {...meta, effects: [one, other], unknownEffects: false});
    const channel: ServerChannel = await settle(multi, (b) => b.click(), {wait: other});
    // @ts-expect-error several effects and no `wait`
    await settle(multi, (b) => b.click());
    // @ts-expect-error `wait` is not one of the element's operations
    await settle(multi, (b) => b.click(), {wait: Api.GetUser});

    // no effects: nothing to wait for, use a matcher instead
    const none = drivers.button(page.locator('x'), {...meta, effects: [], unknownEffects: false});
    // @ts-expect-error no effects
    await settle(none, (b) => b.click());

    // calls through data: any operation, but `wait` is required
    const unknown = drivers.button(page.locator('x'), {...meta, effects: [], unknownEffects: true});
    await settle(unknown, (b) => b.click(), {wait: Api.GetUser});
    // @ts-expect-error unknown effects and no `wait`
    await settle(unknown, (b) => b.click());

    // generated elements carry their effects: the composer's send button fires several requests
    const sent: Post = await settle(app.center.postCreate.sendButton, (b) => b.click(), {wait: Api.CreatePost});
    // @ts-expect-error the send button fires several requests: name the one to wait for
    await settle(app.center.postCreate.sendButton, (b) => b.click());

    // generated return types: opening a menu item returns the page object it opens
    const menu = await app.channelHeader.clickOpenMenuButton();
    const settings = await menu.clickChannelSettingsMenuItem();
    await settings.tabs.configurationTab.select();
    await settings.configuration.fill({joinLeaveMessages: false});
    // @ts-expect-error no such field in the configuration form
    await settings.configuration.fill({joinLeave: false});
    // @ts-expect-error tab keys are typed (a built-in tab or a plugin tab name), not numbers
    settings.tabs.tab(3);

    // a shared modal opened from a known opener fires only that opener's request: Edit opens the bookmark
    // modal whose Save updates, so no `wait`, and waiting for the create doesn't compile
    const edit = await app.bookmarkMenu.clickEditMenuItem();
    const updated: UpdateChannelBookmarkResponse = await settle(edit.confirmButton, (b) => b.click());
    // @ts-expect-error opened from Edit, Save never creates a bookmark
    await settle(edit.confirmButton, (b) => b.click(), {wait: Api.CreateChannelBookmark});

    // opened some other way (no opener): either request, so `wait` names one
    await settle(app.bookmarkModal.confirmButton, (b) => b.click(), {wait: Api.CreateChannelBookmark});
    // @ts-expect-error opened some other way, the modal can create or update: name the one to wait for
    await settle(app.bookmarkModal.confirmButton, (b) => b.click());

    return {post, channel, sent, updated};
}

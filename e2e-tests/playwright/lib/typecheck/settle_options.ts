// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for settle's options and settleAll (`npm run tsc` in lib): typed path `params`, a request named
// as `unlisted`, and one request per item. Each `@ts-expect-error` must be an error.

import type {Page} from '@playwright/test';
import type {ServerChannel} from '@mattermost/types/channels';
import type {FileUploadResponse} from '@mattermost/types/files';
import type {Post} from '@mattermost/types/posts';

import {drivers, effect} from '../src/aria';
import {settle, settleAll} from '../src/settle';

declare const page: Page;
const one = effect<Post>()({op: 'CreatePost', method: 'POST', path: '/api/v4/posts'});
const other = effect<ServerChannel>()({op: 'PatchChannel', method: 'PUT', path: '/api/v4/channels/{channel_id}/patch'});
const upload = effect<FileUploadResponse>()({op: 'UploadFile', method: 'POST', path: '/api/v4/files'});
const meta = {testId: 'a.b--button', role: 'button', source: 'x.tsx#X'} as const;

export async function optionTests() {
    // `params` binds the operation's placeholders, by name
    const multi = drivers.button(page.locator('x'), {...meta, effects: [one, other], unknownEffects: false});
    const channel: ServerChannel = await settle(multi, (b) => b.click(), {wait: other, params: {channel_id: 'abc'}});
    // @ts-expect-error `params` names a placeholder the path doesn't have
    await settle(multi, (b) => b.click(), {wait: other, params: {team_id: 'abc'}});

    // a request the metadata doesn't list: named, on any element
    const none = drivers.button(page.locator('x'), {...meta, effects: [], unknownEffects: false});
    const job: Post = await settle(none, (b) => b.click(), {wait: one, unlisted: true});

    // one request per file
    const attach = drivers.button(page.locator('x'), {...meta, effects: [upload], unknownEffects: false});
    const files: FileUploadResponse[] = await settleAll(attach, (b) => b.click(), {count: 2});
    // @ts-expect-error settleAll needs a count
    await settleAll(attach, (b) => b.click());

    return {channel, job, files};
}

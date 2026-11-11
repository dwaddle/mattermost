// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Compile-time tests for `waitForApi` (`npm run tsc` in lib). Each `@ts-expect-error` must be an error; the other
// calls must compile with the stated types.

import type {Page} from '@playwright/test';
import type {ChannelMembership} from '@mattermost/types/channels';
import type {PaginatedPostList} from '@mattermost/types/posts';

import {waitForApi} from '../src/settle';
import {Api} from '../src/ui/generated';
import {waitForApi as fromIndex} from '../src';

declare const page: Page;

export async function typeTests() {
    // the body type comes from the operation; the handle is a promise started before the trigger
    const pending: Promise<PaginatedPostList> = waitForApi(page, Api.GetPostThread);
    const thread: PaginatedPostList = await pending;

    // params name the operation's placeholders only
    const member: ChannelMembership = await waitForApi(page, Api.GetChannelMember, {
        params: {channel_id: 'c', user_id: 'u'},
    });
    // @ts-expect-error `team_id` is not a placeholder of GetChannelMember
    await waitForApi(page, Api.GetChannelMember, {params: {team_id: 't'}});

    // the predicate sees the typed body
    await waitForApi(page, Api.GetPostThread, {predicate: (body) => body.order.length > 1});
    // @ts-expect-error a PaginatedPostList has no `channel_id`
    await waitForApi(page, Api.GetPostThread, {predicate: (body) => body.channel_id === 'c'});
    // @ts-expect-error the predicate answers yes or no
    await waitForApi(page, Api.GetPostThread, {predicate: (body) => body.order});

    // status and timeout
    await waitForApi(page, Api.GetChannelMember, {status: 404, timeout: 5_000});

    // an operation, not its name
    // @ts-expect-error a string is not an operation
    await waitForApi(page, 'GetPostThread');
    // @ts-expect-error the page comes first
    await waitForApi(Api.GetPostThread);

    // exported from the lib's entry point too
    const again: ChannelMembership = await fromIndex(page, Api.GetChannelMember);

    return {thread, member, again};
}

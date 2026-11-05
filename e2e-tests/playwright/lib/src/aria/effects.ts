// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * An API operation an action can trigger, branded with its response body type. The generated `Api`
 * object holds one per operation the webapp's handlers can reach (from the test-surface manifest).
 */
export interface Effect<Body = unknown, Op extends string = string> {
    readonly op: Op;
    readonly method: string;
    readonly path: string;

    /** Type-level only: the response body. */
    readonly __body?: Body;
}

/** `effect<Channel>()({op: 'PatchChannel', method: 'PUT', path: '/api/v4/channels/{channel_id}/patch'})` */
export const effect =
    <Body>() =>
    <const Op extends string>(e: {op: Op; method: string; path: string}): Effect<Body, Op> =>
        e;

export type BodyOf<F> = F extends Effect<infer B, string> ? B : never;

/** What the generator knows about an element: where it is emitted and which requests acting on it can fire. */
export type Meta<E extends readonly Effect[] = readonly Effect[], U extends boolean = boolean> = {
    readonly testId: string;
    readonly role: string | null;
    readonly effects: E;

    /** Some handler calls through data (registries, plugin hooks): the effects list may be incomplete. */
    readonly unknownEffects: U;

    /** Where the testid is emitted, "channels/src/…/file.tsx:51". */
    readonly source: string;
};

/** `'/api/v4/channels/{channel_id}/patch'` -> a regular expression for request paths. */
export function pathPattern(path: string): RegExp {
    const escaped = path
        .split(/\{[^}]+\}/)
        .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
        .join('[^/]+');
    return new RegExp(`^${escaped}/?$`);
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * An API operation an action can trigger, branded with its response body type. The generated `Api`
 * object holds one per operation the webapp's handlers can reach (from the test-surface manifest).
 */
export interface Effect<Body = unknown, Op extends string = string, Path extends string = string> {
    readonly op: Op;
    readonly method: string;

    /** The OpenAPI path template, `/api/v4/channels/{channel_id}/patch` (a literal type, for `ParamsOfPath`). */
    readonly path: Path;

    /** Type-level only: the response body. */
    readonly __body?: Body;
}

/** `effect<Channel>()({op: 'PatchChannel', method: 'PUT', path: '/api/v4/channels/{channel_id}/patch'})` */
export const effect =
    <Body>() =>
    <const Op extends string, const Path extends string>(e: {
        op: Op;
        method: string;
        path: Path;
    }): Effect<Body, Op, Path> =>
        e;

export type BodyOf<F> = F extends Effect<infer B, string, string> ? B : never;

/** The placeholders of a path template: `'/api/v4/channels/{channel_id}/members/{user_id}'` -> `'channel_id' | 'user_id'`. */
export type PlaceholdersOf<P extends string> = P extends `${string}{${infer Name}}${infer Rest}`
    ? Name | PlaceholdersOf<Rest>
    : never;

/** Values for an effect's path placeholders, to wait for one request only: `{channel_id: channel.id}`. */
export type PathParamsOf<E> =
    E extends Effect<unknown, string, infer P> ? Partial<Record<PlaceholdersOf<P>, string>> : never;

/** What the generator knows about an element: where it is emitted and which requests acting on it can fire. */
export type Meta<E extends readonly Effect[] = readonly Effect[], U extends boolean = boolean> = {
    readonly testId: string;
    readonly role: string | null;
    readonly effects: E;

    /** Some handler calls through data (registries, plugin hooks): the effects list may be incomplete. */
    readonly unknownEffects: U;

    /**
     * Where the testid is emitted: the file and the component that renders it, `channels/src/…/file.tsx#Component`
     * (older generated code: the file and line, `channels/src/…/file.tsx:51`). Failures print it as it is.
     */
    readonly source: string;
};

/**
 * `'/api/v4/channels/{channel_id}/patch'` -> a regular expression for request paths (app paths, without a subpath).
 * A placeholder matches one segment, but not `me`: the client calls `/users/me` for the current user, which is its own
 * operation (`GET /api/v4/users/{user_id}` is another user). `params` binds placeholders to values, so the pattern
 * matches only the request for that entity.
 */
export function pathPattern(path: string, params: Record<string, string | undefined> = {}): RegExp {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const source = path
        .split(/(\{[^}]+\})/)
        .map((part) => {
            const name = /^\{([^}]+)\}$/.exec(part)?.[1];
            if (name === undefined) {
                return escape(part);
            }
            const value = params[name];
            return value === undefined ? '(?!me(?:/|$))[^/]+' : escape(encodeURIComponent(value));
        })
        .join('');
    return new RegExp(`^${source}/?$`);
}

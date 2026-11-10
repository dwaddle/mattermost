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

    /**
     * When the element renders, if only under conditions (`showSearchHintToast`, `isAdmin and canEdit`): failures print
     * it, as a missing element is often a condition that doesn't hold. Optional: generated code may not carry it.
     */
    readonly when?: string;
};

/**
 * `'/api/v4/channels/{channel_id}/patch'` -> a regular expression for request paths (app paths, without a subpath).
 * A placeholder matches one segment. `params` binds placeholders to values, so the pattern matches only the request for
 * that entity. With `notMe`, a placeholder doesn't match `me`: the client calls `/users/me` for the current user, and
 * when that is declared as its own effect (`GET /api/v4/users/me`), waiting for `GET /api/v4/users/{user_id}` means
 * another user (see `hasMeForm`).
 */
export function pathPattern(
    path: string,
    params: Record<string, string | undefined> = {},
    {notMe = false}: {notMe?: boolean} = {},
): RegExp {
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const source = path
        .split(/(\{[^}]+\})/)
        .map((part) => {
            const name = /^\{([^}]+)\}$/.exec(part)?.[1];
            if (name === undefined) {
                return escape(part);
            }
            const value = params[name];
            if (value !== undefined) {
                return escape(encodeURIComponent(value));
            }
            return notMe ? '(?!me(?:/|$))[^/]+' : '[^/]+';
        })
        .join('');
    return new RegExp(`^${source}/?$`);
}

/**
 * Whether `effects` also declares `op`'s `/me` form: the same method and path with `me` for a placeholder
 * (`GET /api/v4/users/me` beside `GET /api/v4/users/{user_id}`). The generator emits that form as its own effect where
 * the client calls `/users/me`; then `op`'s placeholder must not match `me`. Until it does, a placeholder matches `me`
 * too, as before.
 */
export function hasMeForm(
    op: Pick<Effect, 'method' | 'path'>,
    effects: ReadonlyArray<Pick<Effect, 'method' | 'path'>>,
) {
    const segments = op.path.split('/');
    const isPlaceholder = (s: string) => /^\{[^}]+\}$/.test(s);
    return effects.some((e) => {
        const other = e.path.split('/');
        return (
            e.method.toUpperCase() === op.method.toUpperCase() &&
            other.length === segments.length &&
            segments.some((s, i) => isPlaceholder(s) && other[i] === 'me') &&
            segments.every((s, i) => s === other[i] || (isPlaceholder(s) && other[i] === 'me'))
        );
    });
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * The URL path for a route as the router writes it (`/:team/:path(channels|messages)/:identifier/:postid?`):
 * params are URL-encoded; a missing optional param drops its segment; a missing required one throws.
 */
export function buildPath(route: string, values: Record<string, string | undefined>): string {
    const out = route.replace(/\/:(\w+)(?:\([^)]*\))?(\?)?/g, (_, name: string, optional?: string) => {
        const v = values[name];
        if (v === undefined || v === '') {
            if (!optional) {
                throw new Error(`${route}: param "${name}" is required`);
            }
            return '';
        }
        // `@` and `:` are allowed in a path segment (DMs are `/messages/@username`)
        return '/' + encodeURIComponent(v).replace(/%40/g, '@').replace(/%3A/gi, ':');
    });
    return out || '/';
}

/** An entity or its key: `{name: 'town-square'}` or `'town-square'` -> `'town-square'`. */
export function keyOf<T extends object, F extends keyof T>(
    v: Pick<T, F> | string | undefined,
    field: F,
): string | undefined {
    if (v === undefined || typeof v === 'string') {
        return v;
    }
    return String(v[field]);
}

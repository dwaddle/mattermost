// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * A message from the webapp's i18n catalog (generated into `Msg`). Tests never retype English: they
 * format the message the UI renders, with the same values.
 */
export type Message<P extends Record<string, unknown> = Record<string, never>> = {
    readonly id: string;
    readonly defaultMessage: string;

    /** Type-level only: the values the message takes. */
    readonly __params?: P;
};

export const msg = <P extends Record<string, unknown> = Record<string, never>>(
    id: string,
    defaultMessage: string,
): Message<P> => ({
    id,
    defaultMessage,
});

export type ParamsOf<M> = M extends Message<infer P> ? P : never;

/**
 * Formats a message in English (the catalog's default) with the subset of ICU MessageFormat the webapp
 * uses: `{name}`, `{n, number}`, `{n, plural, =0 {…} one {…} other {# …}}`, `{x, select, a {…} other {…}}`,
 * and `<b>rich</b>` tags (their text is kept).
 */
export function formatMessage<M extends Message<any>>(m: M, values?: ParamsOf<M>): string {
    return (
        format(m.defaultMessage, (values ?? {}) as Record<string, unknown>)
            .replace(/<\/?[a-zA-Z0-9_]+>/g, '')
            // markdown emphasis in messages the webapp renders as markdown (`**joined the channel**`)
            .replace(/\*\*([^*]+)\*\*/g, '$1')
            .replace(/__([^_]+)__/g, '$1')
    );
}

function format(pattern: string, values: Record<string, unknown>, pound?: number): string {
    let out = '';
    let i = 0;
    while (i < pattern.length) {
        const c = pattern[i];
        if (c === "'" && pattern[i + 1] === "'") {
            out += "'";
            i += 2;
            continue;
        }
        if (c === '#' && pound !== undefined) {
            out += String(pound);
            i++;
            continue;
        }
        if (c !== '{') {
            out += c;
            i++;
            continue;
        }
        const end = matching(pattern, i);
        out += argument(pattern.slice(i + 1, end), values);
        i = end + 1;
    }
    return out;
}

function matching(s: string, open: number): number {
    let depth = 0;
    for (let i = open; i < s.length; i++) {
        if (s[i] === '{') {
            depth++;
        } else if (s[i] === '}') {
            depth--;
            if (depth === 0) {
                return i;
            }
        }
    }
    return s.length - 1;
}

function argument(body: string, values: Record<string, unknown>): string {
    const [name, kind, ...rest] = splitTop(body);
    const value = values[name.trim()];
    if (!kind) {
        return value === undefined ? `{${name}}` : String(value);
    }
    const k = kind.trim();
    if (k === 'number') {
        return typeof value === 'number' ? value.toLocaleString('en-US') : String(value);
    }
    if (k === 'plural' || k === 'selectordinal' || k === 'select') {
        const cases = parseCases(rest.join(','));
        const n = Number(value);
        if (k === 'select') {
            return format(cases.get(String(value)) ?? cases.get('other') ?? '', values);
        }
        const exact = cases.get(`=${n}`);
        const category = new Intl.PluralRules('en-US', {type: k === 'plural' ? 'cardinal' : 'ordinal'}).select(n);
        return format(exact ?? cases.get(category) ?? cases.get('other') ?? '', values, n);
    }
    return value === undefined ? '' : String(value);
}

/** Splits on commas that aren't inside braces. */
function splitTop(s: string): string[] {
    const parts: string[] = [];
    let depth = 0;
    let start = 0;
    for (let i = 0; i < s.length; i++) {
        if (s[i] === '{') {
            depth++;
        } else if (s[i] === '}') {
            depth--;
        } else if (s[i] === ',' && depth === 0 && parts.length < 2) {
            parts.push(s.slice(start, i));
            start = i + 1;
        }
    }
    parts.push(s.slice(start));
    return parts;
}

function parseCases(s: string): Map<string, string> {
    const cases = new Map<string, string>();
    let i = 0;
    while (i < s.length) {
        while (i < s.length && /\s/.test(s[i])) {
            i++;
        }
        const keyStart = i;
        while (i < s.length && s[i] !== '{' && !/\s/.test(s[i])) {
            i++;
        }
        const key = s.slice(keyStart, i);
        while (i < s.length && s[i] !== '{') {
            i++;
        }
        if (i >= s.length) {
            break;
        }
        const end = matching(s, i);
        cases.set(key, s.slice(i + 1, end));
        i = end + 1;
    }
    return cases;
}

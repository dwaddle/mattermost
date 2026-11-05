// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from './manifest_types.ts';
import {parseRoute, type RouteParam} from './pages.ts';
import type {Value} from './values.ts';

/** A path segment of a navigation target: a literal word, or null where the value isn't known statically. */
type TargetSeg = string | null;

/** A route segment: a literal word, a param, or `'*'` for a segment that mixes text and a param. */
type RouteSeg = string | RouteParam;

const GAP = '\u0000';

/**
 * A navigation target's path as segments: `${teamUrl}/channels/${name}` -> [null, 'channels', null]. A leading
 * unknown value is taken as one segment (a team URL). Query and hash are dropped. Null when nothing about the
 * path is known (a bare variable) or it isn't absolute.
 */
export function targetSegments(v: Value): TargetSeg[] | null {
    let pieces: Array<string | null>;
    if (v.k === 'lit') {
        pieces = [v.s];
    } else if (v.k === 'pat') {
        pieces = v.parts.map((p) => (typeof p === 'string' ? p : null));
    } else {
        return null;
    }
    let text = '';
    for (const p of pieces) {
        if (p === null) {
            text += GAP;
            continue;
        }
        const end = p.search(/[?#]/);
        if (end >= 0) {
            text += p.slice(0, end);
            break;
        }
        text += p;
    }
    if (text.startsWith(GAP)) {
        text = '/' + text;
    }
    if (!text.startsWith('/')) {
        return null;
    }
    const segs = text.split('/').filter(Boolean).map((s) => (s.includes(GAP) ? null : s));
    if (segs.length && segs.every((s) => s === null)) {
        return null;
    }
    return segs;
}

function routeSegments(path: string): RouteSeg[] {
    const {segments} = parseRoute(path);
    const params: RouteParam[] = [];
    const text = segments.map((s) => {
        if (typeof s === 'string') {
            return s;
        }
        params.push(s);
        return `\uE000${params.length - 1}\uE000`;
    }).join('');
    return text.split('/').filter(Boolean).map((s) => {
        const m = (/^\uE000(\d+)\uE000$/).exec(s);
        if (m) {
            return params[Number(m[1])];
        }
        return s.includes('\uE000') ? {name: '*', optional: false} : s;
    });
}

/** How well a target fits a route: the number of literal words matched, or -1 when it can't be that route. */
function fit(target: TargetSeg[], route: RouteSeg[], i = 0, j = 0): number {
    if (j === route.length) {
        return i === target.length ? 0 : -1;
    }
    const r = route[j];
    const skipped = typeof r !== 'string' && r.optional ? fit(target, route, i, j + 1) : -1;
    if (i === target.length) {
        return skipped;
    }
    const t = target[i];
    let here = -1;
    if (t === null) {
        here = 0;
    } else if (typeof r === 'string') {
        here = r === t ? 1 : -1;
    } else if (!r.values || r.values.includes(t)) {
        here = 0;
    }
    const rest = here < 0 ? -1 : fit(target, route, i + 1, j + 1);
    return Math.max(skipped, rest < 0 ? -1 : here + rest);
}

/**
 * The page a navigation goes to: the route every possible value of the target fits best. Null when a value
 * is unknown, fits no route, or fits two pages equally well.
 */
export function pageOf(values: Value[], pages: Page[]): string | null {
    const routes = pages.map((p) => ({cls: p.class, segs: routeSegments(p.path)}));
    let found: string | null = null;
    for (const v of values) {
        const target = targetSegments(v);
        if (!target) {
            return null;
        }
        let best = -1;
        let cls: string | null = null;
        for (const r of routes) {
            const score = fit(target, r.segs);
            if (score > best) {
                best = score;
                cls = r.cls;
            } else if (score === best && score >= 0 && cls !== r.cls) {
                cls = null;
            }
        }
        if (!cls || (found && found !== cls)) {
            return null;
        }
        found = cls;
    }
    return found;
}

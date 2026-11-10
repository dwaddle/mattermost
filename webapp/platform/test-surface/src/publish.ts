// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {cmp} from './compare.ts';
import type {Element, Loc, Manifest, Open, SourceRef} from './manifest_types.ts';

/**
 * The manifest as committed: every exact location (`file:line:column`) becomes the component it is in
 * (`file#Component`), and what then reads alike is one entry (two instances of one usage chain, two opens from one
 * component, a condition at two places). A render condition's place is dropped. Nothing in it moves when a line is
 * added above; the scan keeps the exact places for its own use and for `test-surface where`.
 */
export function publish(internal: Manifest, refOf: (loc: Loc) => SourceRef): Manifest {
    const refs = (locs: Loc[]) => locs.map(refOf);
    const unique = <T>(items: T[]) => [...new Map(items.map((x) => [JSON.stringify(x), x])).values()];
    return {
        ...internal,
        elements: internal.elements.map((e) => publishElement(e, refOf, refs, unique)),
        sets: internal.sets.map((s) => ({...s, source: refOf(s.source)})),
        pages: internal.pages.map((p) => ({...p, component: {...p.component, at: refOf(p.component.at)}})),
        pluginSlots: internal.pluginSlots.map((s) => ({...s, at: refOf(s.at)})),
        ...(internal.plugin ? {plugin: {...internal.plugin, slotsUsed: unique(internal.plugin.slotsUsed.map((u) => ({...u, at: refOf(u.at)})))}} : {}),
        components: unique(internal.components.map((c) => ({...c, at: refOf(c.at)}))),
    };
}

function publishElement(e: Element, refOf: (loc: Loc) => SourceRef, refs: (locs: Loc[]) => SourceRef[], unique: <T>(items: T[]) => T[]): Element {
    const at = refOf(e.component.at);
    const alsoAt = [...new Set(refs(e.alsoAt ?? []))].filter((r) => r !== at);
    const out: Element = {
        ...e,
        component: {...e.component, at},
        instances: unique(e.instances.map((i) => ({...i, via: refs(i.via)}))).sort((a, b) => cmp(a.via.join(','), b.via.join(',')) || cmp((a.keySet ?? []).join(','), (b.keySet ?? []).join(','))),
    };
    if (alsoAt.length) {
        out.alsoAt = alsoAt;
    } else {
        delete out.alsoAt;
    }
    if (e.opens) {
        out.opens = unique(e.opens.map((o): Open => ({...o, at: refOf(o.at)})));
    }
    if (e.effects) {
        out.effects = {...e.effects, delegated: [...new Set(refs(e.effects.delegated))].sort()};
    }
    if (e.renderedWhen) {
        out.renderedWhen = unique(e.renderedWhen.map((c) => ({expr: c.expr, explained: c.explained, kind: c.kind, ...(c.viaLocal ? {viaLocal: c.viaLocal} : {})})));
    }
    return out;
}

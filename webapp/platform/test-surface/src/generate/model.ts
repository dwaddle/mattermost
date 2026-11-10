// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {pascal} from './names.ts';

import {cmp} from '../compare.ts';
import type {Element, Manifest} from '../manifest_types.ts';

/**
 * When a platform component (GenericModal) writes the scope's testid at every mount, but each mount reaches it through
 * the same app component (`ConfirmModal` passing its `testId` on), that app component names the class.
 */
function appWrapper(group: ScopeNode[]): string | undefined {
    const files = new Set<string>();
    for (const m of group) {
        const c = m.container;
        if (!c || !c.component.at.startsWith('platform/')) {
            return undefined;
        }
        for (const i of c.instances) {
            if (i.via.length < 2) {
                return undefined;
            }
            files.add(i.via[0].split('#')[0]);
        }
    }
    if (files.size !== 1) {
        return undefined;
    }
    const base = [...files][0].split('/').pop()!.replace(/\.tsx?$/, '');
    return pascal(base);
}

/** One level of the testid scope tree; each becomes a page-object class (or reuses a shared one). */
export type ScopeNode = {
    path: string[];
    children: Map<string, ScopeNode>;

    /** Elements whose scope is exactly this path (not containers of child scopes). */
    members: Element[];

    /** The element whose testid is this scope itself (no role, no key), when the scope renders one. */
    container?: Element;

    /** For an item scope: the keyed element in the parent (`lhs.channel_list.channel:{key}--link`). */
    item?: Element;

    /** The class this node is emitted as (its own, or a shared one); set for every node once classes are assigned. */
    cls?: ClassModel;
};

export type ClassModel = {
    name: string;

    /** Top-level scope word the class is filed under, or `shared`. */
    file: string;

    /** The node emitted (for a shared class: the first of its mounts). */
    node: ScopeNode;
    shared: boolean;
    mounts: ScopeNode[];
};

export type Model = {
    root: ScopeNode;
    classes: ClassModel[];
    byScope: Map<string, ScopeNode>;
};

const newNode = (path: string[]): ScopeNode => ({path, children: new Map(), members: []});

/**
 * Which elements are generated: those in migrated areas (emitted in, or rendered through, a strict path)
 * and those under `generateScopes`. Legacy testids that merely happen to parse are left out.
 */
export function generated(manifest: Manifest, strictPaths: string[], onlyScopes: string[] | null): Element[] {
    const inScopes = (e: Element) => onlyScopes?.some((s) => e.template === s || e.template.startsWith(s + '.') || e.template.startsWith(s + ':') || e.template.startsWith(s + '--'));
    const migrated = (e: Element) => strictPaths.some((p) => e.component.at.startsWith(p) || e.alsoAt?.some((a) => a.startsWith(p)) || e.instances.some((i) => i.via.some((v) => v.startsWith(p))));
    return manifest.elements.filter((e) => e.grammar && !e.unreachable && ((!strictPaths.length && !onlyScopes) || inScopes(e) || migrated(e)));
}

/**
 * `dropWords`: leading scope words left out of class and file names (a plugin's classes live under
 * `plugins.<key>` but are named from `<key>` on: `ComMattermostCallsWidget`).
 */
export function buildModel(elementsIn: Element[], {dropWords = 0, reservedNames = []}: {dropWords?: number; reservedNames?: string[]} = {}): Model {
    const root = newNode([]);
    const byScope = new Map<string, ScopeNode>([['', root]]);
    const nodeFor = (path: string[]): ScopeNode => {
        let n = root;
        for (let i = 0; i < path.length; i++) {
            const w = path[i];
            let c = n.children.get(w);
            if (!c) {
                c = newNode(path.slice(0, i + 1));
                n.children.set(w, c);
                byScope.set(c.path.join('.'), c);
            }
            n = c;
        }
        return n;
    };
    const elements = [...elementsIn].sort((a, b) => cmp(a.template, b.template));
    for (const e of elements) {
        nodeFor(e.scope).members.push(e);
    }

    // a member that names a child scope is that scope's container (no role) or its repeated item (keyed)
    const attach = (n: ScopeNode) => {
        n.members = n.members.filter((e) => {
            const child = n.children.get(e.name);
            if (!child) {
                return true;
            }
            if (!e.role && !e.key) {
                child.container = e;
                return false;
            }
            if (e.key) {
                child.item = e;
                return false;
            }
            return true;
        });
        for (const c of n.children.values()) {
            attach(c);
        }
    };
    attach(root);

    // entity types the classes import for keys (`Pick<Post, 'id'>`) and the fixed sets `sets.ts` exports: no class may take their names
    const reserved = new Set([...elementsIn.flatMap((e) => [e.key?.entity, e.key?.set].filter((n): n is string => Boolean(n))), ...reservedNames]);
    const classes = assignClasses(root, reserved, dropWords);
    return {root, classes, byScope};
}

/** Structure of a subtree relative to its own path: identical signatures render the same component at different roots. */
function signature(n: ScopeNode): string {
    const rel = (e: Element) => e.template.slice(n.path.join('.').length);
    const parts = [
        n.container ? 'C' : '',
        n.item ? `I${n.item.role}|${n.item.component.at}` : '',
        ...n.members.map((e) => `${rel(e)}|${e.component.at}`),
        ...[...n.children.entries()].map(([w, c]) => `${w}{${signature(c)}}`),
    ];
    return parts.join(';');
}

/** What a scope is made of, one entry per member and child, for comparing shapes. */
function parts(n: ScopeNode): Set<string> {
    const rel = (e: Element) => e.template.slice(n.path.join('.').length);
    return new Set([
        ...n.members.map((e) => `${rel(e)}|${e.component.at}`),
        ...[...n.children.entries()].map(([w, c]) => `${w}{${signature(c)}}`),
    ]);
}

/** The component that renders most of a scope's own parts (the list, not the shared Button inside it). */
function mainOwner(n: ScopeNode): string | undefined {
    const counts = new Map<string, number>();
    n.members.filter((e) => !e.component.at.startsWith('platform/')).forEach((e) => counts.set(e.component.name, (counts.get(e.component.name) ?? 0) + 1));
    return [...counts].sort((a, b) => b[1] - a[1] || cmp(a[0], b[0]))[0]?.[0];
}

function assignClasses(root: ScopeNode, reserved: Set<string>, dropWords: number): ClassModel[] {
    const all: ScopeNode[] = [];
    const walk = (n: ScopeNode) => {
        if (n.path.length) {
            all.push(n);
        }
        [...n.children.values()].forEach(walk);
    };
    walk(root);

    // identical subtrees (same members from the same source sites) share one class
    const groups = new Map<string, ScopeNode[]>();
    for (const n of all) {
        // top-level areas (center, rhs, lhs) are distinct places even when they render the same thing
        if ((!n.members.length && !n.children.size) || n.path.length < 2) {
            continue;
        }
        const sig = signature(n);
        groups.set(sig, [...(groups.get(sig) ?? []), n]);
    }

    // shapes of one component (same last word, same container) whose parts all fit inside one of them, like a
    // save panel some pages give a Cancel link: one class, built from the fullest shape, its extra parts optional
    const byShape = new Map<string, ScopeNode[][]>();
    for (const g of groups.values()) {
        const n = g[0];
        if (n.item) {
            continue;
        }
        const key = `${n.path[n.path.length - 1]}|${n.container?.component.at ?? n.members.map((e) => e.component.at).sort()[0] ?? ''}`;
        byShape.set(key, [...(byShape.get(key) ?? []), g]);
    }
    for (const gs of byShape.values()) {
        if (gs.length < 2) {
            continue;
        }
        const fullest = gs.reduce((a, b) => (parts(b[0]).size > parts(a[0]).size ? b : a));
        const full = parts(fullest[0]);
        const fits = gs.filter((g) => g !== fullest && [...parts(g[0])].every((x) => full.has(x)));
        if (!fits.length) {
            continue;
        }
        for (const g of fits) {
            groups.delete(signature(g[0]));
        }
        groups.set(signature(fullest[0]), [...fullest, ...fits.flat()]);
    }
    const sharedOf = new Map<ScopeNode, ScopeNode[]>();
    for (const g of groups.values()) {
        if (g.length > 1 && !g.some((n) => g.some((m) => m !== n && isAncestor(m, n)))) {
            for (const n of g) {
                sharedOf.set(n, g);
            }
        }
    }

    const named = (n: ScopeNode) => n.path.slice(dropWords);

    // names are assigned twice: the first pass finds the names several classes want; the second gives each of
    // those classes its area as a prefix (`AdminSavePanel`, `SettingsSavePanel`), numbering only what still collides
    const assign = (collided: Set<string>) => {
        const wanted = new Map<string, number>();
        const classes: ClassModel[] = [];
        const used = new Set<string>(['App', 'Api', 'Msg', 'Scope']);
        const unique = (want: string, n: ScopeNode, area: string | null, component?: string, mounts: ScopeNode[] = [n]) => {
            wanted.set(want, (wanted.get(want) ?? 0) + 1);
            let base = reserved.has(want) ? `${want}${n.item ? 'Item' : 'Scope'}` : want;
            if (collided.has(want) && area && !base.startsWith(area)) {
                base = area + base;
            }

            // still taken (two components under one word in one area, or across areas): the rendering component's name,
            // else the path the mounts share (`admin.data_retention` -> `AdminDataRetentionDataGrid`)
            if (used.has(base) && component && (/^[A-Z]/).test(component)) {
                const byComponent = (area && !component.startsWith(area) ? area : '') + component;
                if (!used.has(byComponent)) {
                    base = byComponent;
                }
            }
            if (used.has(base)) {
                const prefix: string[] = [];
                for (let i = 0; mounts.every((m) => m.path.length - 1 > i && m.path[i] === mounts[0].path[i]); i++) {
                    prefix.push(mounts[0].path[i]);
                }
                const byPath = pascal(prefix.join('_')) + base.replace(new RegExp(`^${pascal(prefix[0] ?? '')}`), '');
                if (prefix.length > 1 && !used.has(byPath)) {
                    base = byPath;
                }
            }
            let name = base;
            for (let i = 2; used.has(name); i++) {
                name = `${base}${i}`;
            }
            used.add(name);
            return name;
        };
        const done = new Set<ScopeNode>();
        root.cls = {name: 'App', file: 'app', node: root, shared: false, mounts: [root]};
        for (const n of all) {
            if (done.has(n)) {
                continue;
            }
            const group = sharedOf.get(n);
            if (group) {
                const words = group.map((m) => m.path[m.path.length - 1]);

                // the component that renders the scope at every mount, else the one that renders all its members
                // (`CopyText` at `….token` and `….url`), never one mount's owner standing for the others
                const containers = new Set(group.map((m) => m.container?.component.name));
                const memberOwners = new Set(group[0].members.map((e) => e.component.name));
                let renderedBy: string | undefined;
                if (containers.size === 1 && group[0].container) {
                    renderedBy = appWrapper(group) ?? group[0].container.component.name;
                } else if (memberOwners.size === 1 && !group[0].children.size) {
                    renderedBy = group[0].members[0].component.name;
                }

                // the word most mounts share (`post_create`, though the inline editor is `post_edit.editor`)
                const counts = new Map<string, number>();
                words.forEach((w) => counts.set(w, (counts.get(w) ?? 0) + 1));
                const [common, commonCount] = [...counts].sort((a, b) => b[1] - a[1])[0];
                let base = pascal(common);
                if (commonCount * 2 <= words.length) {
                    base = renderedBy && (/^[A-Z]/).test(renderedBy) ? renderedBy : pascal(named(n).join('_'));

                    // a list of one kind of item mounted in different places (`rhs.thread`, `search.results`): `PostList`
                    const kids = [...group[0].children.entries()];
                    if (!renderedBy && !group[0].members.length && kids.length === 1 && kids[0][1].item) {
                        base = `${pascal(kids[0][0])}List`;
                    }
                }

                // a subtree of a shared class is named after it (`PostItem` -> `PostItemMenu`), not by its last word alone
                const parentCls = parentOf(root, group[0])?.cls;
                if (parentCls?.shared && group.every((m) => parentOf(root, m)?.cls === parentCls)) {
                    base = parentCls.name + pascal(words[0]);
                }

                // mounted under one top-level scope only (`admin.attribute.graph.pane.children` and `.parents`): it lives in that
                // scope's file, next to the classes it returns, instead of making shared.ts and that file import each other
                const files = new Set(group.map((m) => named(m)[0] ?? m.path[0]));
                const file = files.size === 1 ? [...files][0] : 'shared';
                const area = files.size === 1 ? pascal([...files][0]) : null;
                const owner = renderedBy ?? mainOwner(group[0]);
                const cls: ClassModel = {name: unique(base, group[0], area, owner, group), file, node: group[0], shared: true, mounts: group};
                for (const m of group) {
                    m.cls = cls;
                    done.add(m);
                }
                classes.push(cls);
                continue;
            }
            const words = named(n);
            const first = words[0] ?? n.path[0];
            const owner = n.container?.component.name ?? mainOwner(n);
            const cls: ClassModel = {name: unique(pascal(words.join('_') || n.path.join('_')), n, pascal(first), owner), file: first, node: n, shared: false, mounts: [n]};
            n.cls = cls;
            done.add(n);
            classes.push(cls);
        }
        return {classes, collided: new Set([...wanted].filter(([, c]) => c > 1).map(([w]) => w))};
    };
    return assign(assign(new Set()).collided).classes;
}

function parentOf(root: ScopeNode, n: ScopeNode): ScopeNode | undefined {
    let p: ScopeNode | undefined = root;
    for (const w of n.path.slice(0, -1)) {
        p = p?.children.get(w);
    }
    return p;
}

function isAncestor(a: ScopeNode, b: ScopeNode): boolean {
    return a.path.length < b.path.length && a.path.every((w, i) => b.path[i] === w);
}

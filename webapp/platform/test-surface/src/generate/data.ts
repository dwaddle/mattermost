// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';

import type {Output} from './emit.ts';
import type {Model, ScopeNode} from './model.ts';
import {isIdentifier, pageGetter, pascal, propKey} from './names.ts';

import {cmp} from '../compare.ts';
import {APP_MAP_VERSION, type Manifest, type Page} from '../manifest_types.ts';

/** `Api`: every operation an element can fire, branded with its response body type. */
export function emitApi(manifest: Manifest, out: Output): string {
    const imports = new Map<string, Set<string>>();
    const lines: string[] = [];
    for (const op of [...manifest.operations].sort((a, b) => cmp(a.opId, b.opId))) {
        for (const [name, module] of Object.entries(op.bodyImports ?? {})) {
            const s = imports.get(module) ?? new Set<string>();
            s.add(name);
            imports.set(module, s);
        }
        const body = op.body && Object.keys(op.bodyImports ?? {}).length ? op.body : 'unknown';
        const note = op.inSpec ? '' : ' // not in the OpenAPI spec';
        lines.push(`    ${op.opId}: effect<${body}>()({op: '${op.opId}', method: '${op.verb}', path: '${op.path}'}),${note}`);
    }
    const typeImports = [...imports.entries()].sort((a, b) => cmp(a[0], b[0])).map(([m, names]) => `import type {${[...names].sort().join(', ')}} from '${m}';`);
    return `${out.header}
${typeImports.join('\n')}${typeImports.length ? '\n\n' : ''}import {effect} from '${out.runtime}';

/** API operations the webapp's actions can fire, from its handlers' call graph. \`settle\` waits for them. */
export const Api = {
${lines.join('\n')}
} as const;

export type ApiOp = keyof typeof Api;
`;
}

/** Fixed key sets (`ChannelSettingsModalTab`) as const objects with derived types. */
export function emitSets(manifest: Manifest, out: Output): string {
    const blocks = [...manifest.sets].sort((a, b) => cmp(a.name, b.name)).map((s) => {
        const used = new Set<string>();
        const entries = s.values.map((v) => {
            let k = pascal(v) || 'Empty';
            for (let i = 2; used.has(k); i++) {
                k = `${pascal(v)}${i}`;
            }
            used.add(k);
            return `    ${k}: '${v}',`;
        });
        return `/** Keys of ${s.name} (from ${s.source}). */
export const ${s.name} = {
${entries.join('\n')}
} as const;
export type ${s.name} = (typeof ${s.name})[keyof typeof ${s.name}];`;
    });
    const settings = settingIds(manifest, out);
    if (settings) {
        blocks.push(settings);
    }
    return `${out.header}\n${blocks.length ? blocks.join('\n\n') : 'export {};'}\n`;
}

/**
 * `AdminSettingId`: the System Console settings keyed by a literal id where the page passes one (a React id like
 * `restrictUnauthenticatedWebappPlugins`, or a path the config type doesn't have). They join the runtime's
 * `AdminSettingKey` by declaration merging (`AdminSettingIds`), so `admin.setting()` takes them, the config paths and the
 * custom attribute settings, and nothing else.
 */
function settingIds(manifest: Manifest, out: Output): string | null {
    const ids = [...new Set(manifest.elements.filter((e) => e.key?.kind === 'setting').flatMap((e) => e.key!.values ?? []))].sort(cmp);
    if (!ids.length) {
        return null;
    }
    const used = new Set<string>();
    const entries = ids.map((v) => {
        let k = pascal(v) || 'Empty';
        for (let i = 2; used.has(k); i++) {
            k = `${pascal(v)}${i}`;
        }
        used.add(k);
        return `    ${k}: '${v}',`;
    });
    return `/** System Console settings keyed by a literal id (a React id, or a path the config type doesn't have): \`admin.setting(AdminSettingId.X)\`. */
export const AdminSettingId = {
${entries.join('\n')}
} as const;
export type AdminSettingId = (typeof AdminSettingId)[keyof typeof AdminSettingId];

declare module '${out.runtime}' {
    interface AdminSettingIds {
${ids.map((v) => `        ${propKey(v)}: true;`).join('\n')}
    }
}`;
}

type MsgNode = {leaf?: {id: string; text: string}; children: Map<string, MsgNode>};

/** ICU argument names and their value types: `{name}`, `{n, plural, …}`, `{x, select, …}`. */
export function messageParams(text: string): Map<string, string> {
    const out = new Map<string, string>();
    const visit = (s: string) => {
        let depth = 0;
        for (let i = 0; i < s.length; i++) {
            if (s[i] === "'" && (s[i + 1] === '{' || s[i + 1] === '}')) {
                const close = s.indexOf("'", i + 1);
                i = close < 0 ? s.length : close;
                continue;
            }
            if (s[i] !== '{') {
                continue;
            }
            let j = i;
            depth = 0;
            for (; j < s.length; j++) {
                if (s[j] === '{') {
                    depth++;
                } else if (s[j] === '}') {
                    depth--;
                    if (depth === 0) {
                        break;
                    }
                }
            }
            const body = s.slice(i + 1, j);
            const [name, kind] = body.split(',').map((x) => x.trim());
            if (name && isIdentifier(name)) {
                let t = 'string | number';
                if (kind === 'plural' || kind === 'selectordinal' || kind === 'number') {
                    t = 'number';
                } else if (kind === 'select') {
                    t = 'string';
                } else if (kind === 'date' || kind === 'time') {
                    t = 'Date | number';
                }
                if (!out.has(name) || t !== 'string | number') {
                    out.set(name, t);
                }
            }
            const inner = body.indexOf('{');
            if (inner >= 0) {
                visit(body.slice(inner));
            }
            i = j;
        }
    };
    visit(text);
    return out;
}

/** `Msg`: the i18n catalog as a nested object (`Msg.api.channel.join_channel.post_and_forget`). */
export function emitMsg(catalogPath: string, out: Output): string {
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8')) as Record<string, string | {defaultMessage: string}>;
    const root: MsgNode = {children: new Map()};
    for (const id of Object.keys(catalog).sort()) {
        const entry = catalog[id];
        const text = typeof entry === 'string' ? entry : entry.defaultMessage;
        let n = root;
        for (const w of id.split('.')) {
            let c = n.children.get(w);
            if (!c) {
                c = {children: new Map()};
                n.children.set(w, c);
            }
            n = c;
        }
        n.leaf = {id, text};
    }
    const render = (n: MsgNode, indent: string): string => {
        const lines: string[] = [];
        for (const [k, c] of [...n.children.entries()].sort((a, b) => cmp(a[0], b[0]))) {
            if (c.leaf && !c.children.size) {
                lines.push(`${indent}${propKey(k)}: ${leaf(c.leaf)},`);
                continue;
            }
            const inner = [...(c.leaf ? [`${indent}    _: ${leaf(c.leaf)},`] : []), render(c, indent + '    ')].filter(Boolean).join('\n');
            lines.push(`${indent}${propKey(k)}: {\n${inner}\n${indent}},`);
        }
        return lines.join('\n');
    };
    const leaf = (l: {id: string; text: string}) => {
        const params = messageParams(l.text);
        const p = params.size ? `<{${[...params.entries()].map(([k, t]) => `${k}: ${t}`).join('; ')}}>` : '';
        return `msg${p}(${JSON.stringify(l.id)}, ${JSON.stringify(l.text)})`;
    };
    return `${out.header}
/* eslint-disable max-lines */

import {msg} from '${out.runtime}';

/**
 * The webapp's i18n catalog (en.json). Tests format what the UI renders instead of retyping English:
 * \`await expect(postList).toContainMessage(Msg.api.channel.join_channel.post_and_forget, {username})\`.
 * A message whose id is also a prefix of other ids is under \`_\`.
 */
export const Msg = {
${render(root, '    ')}
} as const;
`;
}

/** app-map.json: what agents read to plan a test, per scope: elements, what they open, what they fire, when they render. */
export function appMap(manifest: Manifest, model: Model, pageList: Page[]): string {
    const scopes: unknown[] = [];
    const visit = (n: ScopeNode) => {
        if (n.path.length) {
            const elements = [...n.members, ...(n.item ? [n.item] : [])].sort((a, b) => cmp(a.template, b.template)).map((e) => ({
                testId: e.template,
                role: e.role,
                ...(e.key ? {key: e.key.type} : {}),
                ...(e.opens?.length ? {opens: e.opens.map((o) => ({kind: o.kind, target: o.target, ...(o.scope ? {scope: o.scope} : {}), ...(o.dialogOps ? {dialogOps: o.dialogOps} : {})}))} : {}),
                ...(e.effects?.ops.length || e.effects?.unknown ? {effects: e.effects.ops, ...(e.effects.unknown ? {unknownEffects: true} : {})} : {}),
                ...(e.renderedWhen?.length ? {renderedWhen: [...new Set(e.renderedWhen.map((c) => c.explained))].slice(0, 5)} : {}),
                source: e.component.at,
            }));
            scopes.push({scope: n.path.join('.'), class: n.cls?.name, ...(n.container ? {container: n.container.component.at} : {}), elements});
        }
        [...n.children.values()].forEach(visit);
    };
    visit(model.root);
    const operations = manifest.operations.map((o) => ({op: o.opId, method: o.verb, path: o.path, body: o.body}));
    const pages = pageList.map((p) => ({
        class: p.class,
        getter: pageGetter(p.class),
        path: p.path,
        params: p.params.map((q) => ({name: q.as, ...(q.optional ? {optional: true} : {}), ...(q.values ? {values: q.values} : {}), ...(q.entity ? {entity: `${q.entity.type}.${q.entity.field}`} : {})})),
        scopes: p.scopes,
    }));
    const pluginSlots = manifest.pluginSlots.map((s) => ({slot: s.slot, testId: s.template, key: 'PluginKey', ...(s.registry ? {registry: s.registry} : {})}));
    return JSON.stringify({version: APP_MAP_VERSION, pages, scopes, pluginSlots, operations}, null, 2) + '\n';
}

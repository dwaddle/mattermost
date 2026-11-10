// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Output} from './emit.ts';
import {propKey} from './names.ts';

import {cmp} from '../compare.ts';
import type {Diagnostic, Manifest, Page, PageParam} from '../manifest_types.ts';

function paramType(p: PageParam): string {
    if (p.entity) {
        return `Pick<${p.entity.type}, '${p.entity.field}'> | string`;
    }
    if (p.values) {
        return p.values.map((v) => `'${v}'`).join(' | ');
    }
    return 'string';
}

function paramValue(p: PageParam): string {
    const v = `params.${p.as}`;
    if (p.entity) {
        return `keyOf(${v}, '${p.entity.field}')`;
    }
    if (p.values && !p.optional) {
        return `${v} ?? '${p.values[0]}'`;
    }
    return v;
}

function paramDoc(p: PageParam): string {
    const parts: string[] = [];
    if (p.entity) {
        parts.push(`a ${p.entity.type} or its ${p.entity.field}`);
    } else if (p.values) {
        parts.push(`default \`${p.values[0]}\``);
    }
    if (p.as !== p.name) {
        parts.push(`(route param \`:${p.name}\`)`);
    }
    return parts.length ? `    /** ${parts.join(' ')} */\n` : '';
}

/** The browser's load event comes before a single-page app is up: `goto` waits for the page's ready element too. */
function gotoDoc(page: Page): string {
    if (!page.ready?.length) {
        return `/** Navigates here and returns once the browser reports the page loaded: there is nothing to wait for (${(page.noReady ?? 'no pageReady entry').replace(/\*\//g, '*\\/').replace(/\.$/, '')}). */`;
    }
    return `/** Navigates here and waits until ${page.ready.map((r) => `\`${r}\``).join(' or ')} shows. */`;
}

function readyWait(page: Page): string {
    if (!page.ready?.length) {
        return '';
    }
    const locators = page.ready.map((r) => `this.page.getByTestId(${JSON.stringify(r).replace(/^"|"$/g, "'")})`);
    return `\n        await ${locators[0]}${locators.slice(1).map((l) => `.or(${l})`).join('')}.waitFor();`;
}

/**
 * Pages whose class names clash are left out with a diagnostic. A page with no `pageReady` entry is an error: its `goto`
 * would return before the app is up, unlike the others.
 */
export function usablePages(manifest: Manifest, diagnostics: Diagnostic[]): Page[] {
    const seen = new Map<string, Page>();
    const out: Page[] = [];
    for (const page of [...manifest.pages].sort((a, b) => cmp(a.class, b.class) || cmp(a.path, b.path))) {
        const prev = seen.get(page.class);
        if (prev) {
            diagnostics.push({rule: 'collisions', severity: 'error', at: page.component.at, message: `Page class ${page.class} is generated for both ${prev.path} and ${page.path}.`, fix: 'Name one of them in pageNames in test-surface.config.json.'});
            continue;
        }
        if (!page.ready?.length && !page.noReady) {
            diagnostics.push({rule: 'pages', severity: 'error', at: page.component.at, message: `Page ${page.class} (${page.path}) has no pageReady entry, so its goto() wouldn't wait for the app.`, fix: `Add "${page.class}" to pageReady in test-surface.config.json: the testids that show it is up, or {"ready": null, "reason": …} when it has none (it redirects, or renders no testid yet).`});
        }
        seen.set(page.class, page);
        out.push(page);
    }
    return out;
}

/** `pages.ts`: one class per route with typed params, `path(params)` and `goto(params)`. */
export function emitPages(pages: Page[], out: Output): string {
    const types = new Map<string, Set<string>>();
    const classes: string[] = [];
    for (const page of pages) {
        const optional = (p: PageParam) => p.optional || Boolean(p.values && !p.entity);
        const params = page.params;
        for (const p of params) {
            if (p.entity) {
                types.set(p.entity.module, (types.get(p.entity.module) ?? new Set()).add(p.entity.type));
            }
        }
        const Params = `${page.class}Params`;
        const fields = params.map((p) => `${paramDoc(p)}    ${propKey(p.as)}${optional(p) ? '?' : ''}: ${paramType(p)};`).join('\n');
        const required = params.some((p) => !optional(p));
        const arg = params.length ? `params: ${Params}${required ? '' : ' = {}'}` : '';
        const values = params.length ? `{${params.map((p) => `${propKey(p.name)}: ${paramValue(p)}`).join(', ')}}` : '{}';
        classes.push(`${params.length ? `export type ${Params} = {\n${fields}\n};\n\n` : ''}/**
 * \`${page.path}\`, rendered by \`${page.component.name}\` (${page.component.at.split('#')[0]}). Its scopes are listed in app-map.json.
 */
export class ${page.class} {
    static readonly route = ${JSON.stringify(page.path).replace(/^"|"$/g, "'")};

    readonly page: Page;

    constructor(page: Page) {
        this.page = page;
    }

    /** The URL path for these params. */
    static path(${arg}): string {
        return buildPath(${page.class}.route, ${values});
    }

    ${gotoDoc(page)}
    async goto(${arg}): Promise<void> {
        await this.page.goto(${page.class}.path(${params.length ? 'params' : ''}));${readyWait(page)}
    }
}
`);
    }
    const typeImports = [...types.entries()].sort((a, b) => cmp(a[0], b[0])).map(([m, names]) => `import type {${[...names].sort().join(', ')}} from '${m}';`);
    const usesKey = pages.some((p) => p.params.some((q) => q.entity));
    return `${out.header}
import type {Page} from '@playwright/test';
${typeImports.join('\n')}

import {${['buildPath', ...(usesKey ? ['keyOf'] : [])].join(', ')}} from '${out.runtime}';

${classes.join('\n')}`;
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import path from 'node:path';

import {escapeRegExp} from './ast.ts';
import {relativeToRoot, type Config} from './config.ts';
import {KEY_PLACEHOLDER} from './grammar.ts';
import type {Diagnostic, Manifest} from './manifest_types.ts';
import {templateMatcher} from './report.ts';

/** The code files under `roots`, skipping dependencies, build output and generated page objects. */
function codeFiles(roots: string[]): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        if (!fs.existsSync(d)) {
            return;
        }
        for (const e of fs.readdirSync(d, {withFileTypes: true})) {
            if (e.name === 'node_modules' || e.name === 'generated' || e.name === 'dist' || e.name.startsWith('.')) {
                continue;
            }
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
                walk(p);
            } else if ((/\.(ts|js)$/).test(e.name)) {
                out.push(p);
            }
        }
    };
    roots.forEach(walk);
    return out.sort();
}

/**
 * Testids that e2e code queries (Playwright's `getByTestId('…')` and `getByTestId(/…/)`, Cypress's and Testing
 * Library's `findByTestId` / `queryAllByTestId` and the like, `[data-testid…="…"]`) and that no
 * element in the manifest can render: usually a test left behind by a rename. Warnings, not stored in the
 * manifest (they depend on the tests, not the app). Keyed templates that are mostly runtime data
 * (`{key}`, `{key}--text`) would match anything, so they only count when their literal part is long enough.
 */
export function staleReferences(manifest: Manifest, config: Config): Diagnostic[] {
    const sr = config.staleReferences;
    if (!sr) {
        return [];
    }
    const usable = manifest.elements.flatMap((e) => {
        const pattern = templateMatcher(e.template, {minLiteral: 8});
        return pattern ? [{template: e.template, pattern}] : [];
    });

    // sample keys of a few shapes, so a regex query like `time:\d{4}--menuitem` can match a keyed template
    const concrete = usable.flatMap((e) => (e.template.includes(KEY_PLACEHOLDER) ? ['x1', '0900', '0', '1', 'a_b'].map((k) => e.template.split(KEY_PLACEHOLDER).join(k)) : [e.template]));
    const patterns = usable.map((e) => e.pattern);
    const matchesSome = (probe: RegExp, lit?: string) => (lit !== undefined && patterns.some((t) => t.test(lit))) || concrete.some((c) => probe.test(c));

    const out: Diagnostic[] = [];
    const query = /\b(?:get|query|find)(?:All)?ByTestId\(\s*(?:(['"`])((?:(?!\1).)*)\1|\/((?:\\.|[^/\n])+)\/[a-z]*)|\[data-testid([\^$*]?)=["'`]?((?:[^"'`\]])*)/g;
    for (const file of codeFiles(sr.roots)) {
        const rel = relativeToRoot(config, file);
        const src = fs.readFileSync(file, 'utf8');
        for (const m of src.matchAll(query)) {
            const [, , quoted, regex, op, attr] = m;
            let ok: boolean;
            let shown: string;
            if (regex === undefined) {
                const lit = quoted ?? attr;
                if (!lit) {
                    continue;
                }
                shown = lit;

                // a template literal's ${…} can be anything
                const body = escapeRegExp(lit).replace(/\\\$\\\{[^}]*\\\}/g, '.*');

                // `^=` is a prefix, `$=` a suffix, `*=` a substring
                const probe = new RegExp((op === '$' || op === '*' ? '' : '^') + body + (op === '^' || op === '*' ? '' : '$'));
                ok = matchesSome(probe, op ? undefined : lit.replace(/\$\{[^}]*\}/g, 'x1'));
            } else {
                shown = `/${regex}/`;
                let re: RegExp;
                try {
                    re = new RegExp(regex);
                } catch {
                    continue;
                }
                ok = matchesSome(re);
            }
            if (ok) {
                continue;
            }
            const allowed = sr.allow.find((a) => a.testid === shown && (!a.file || rel.endsWith(a.file)));
            if (allowed) {
                continue;
            }
            const line = src.slice(0, m.index).split('\n').length;
            out.push({
                rule: 'stale-reference',
                severity: 'warning',
                at: `${rel}:${line}`,
                message: `"${shown}" matches no testid the app renders (renamed or removed?).`,
                fix: 'Use the testid the app renders now (or the generated page objects); if this one is fine, add it to staleReferences.allow with the reason.',
            });
        }
    }
    return out;
}

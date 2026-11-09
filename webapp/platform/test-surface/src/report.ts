// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import path from 'node:path';

import {cmp} from './compare.ts';
import type {Diagnostic, Manifest} from './manifest_types.ts';
import type {ScanResult, ScanStats} from './scan.ts';

/** Deterministic manifest text: insertion-ordered keys (the builder sorts arrays), two-space indent, trailing newline. */
export function manifestText(m: Manifest): string {
    return JSON.stringify(m, null, 2) + '\n';
}

export function writeIfChanged(file: string, text: string): boolean {
    if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === text) {
        return false;
    }
    fs.mkdirSync(path.dirname(file), {recursive: true});
    fs.writeFileSync(file, text);
    return true;
}

const pct = (a: number, b: number) => (b ? `${((100 * a) / b).toFixed(1)}%` : '-');

/** Coverage numbers the golden-numbers check compares against (they may only go up). */
export function goldenNumbers(stats: ScanStats): Record<string, number> {
    const n = (k: string) => (typeof stats[k] === 'number' ? stats[k] as number : 0);
    return {
        domSites: n('domSites'),
        domResolved: n('domResolved'),
        domFromPropsResolved: n('domFromPropsResolved'),
        matchedToOpenAPI: n('matchedToOpenAPI'),
        elementsWithRole: n('elementsWithRole'),
        elementsWithEffects: n('elementsWithEffects'),
        elementsWithOpens: n('elementsWithOpens'),
        grammarElements: n('grammarElements'),
    };
}

export function summary(result: ScanResult, diagnostics: Diagnostic[]): string {
    const s = result.stats;
    const n = (k: string) => (typeof s[k] === 'number' ? s[k] as number : 0);
    const byRule = new Map<string, {error: number; warning: number}>();
    for (const d of diagnostics) {
        const r = byRule.get(d.rule) ?? {error: 0, warning: 0};
        r[d.severity]++;
        byRule.set(d.rule, r);
    }
    const lines = [
        `program: ${n('files')} files in scope, ${n('components')} components with usages`,
        `testid sites: ${n('sites')} (${n('domSites')} on DOM elements, ${n('componentSites')} on components [${n('forwardedComponentSites')} forwarded], ${n('objectSites')} object props)`,
        `DOM sites resolved: ${n('domResolved')}/${n('domSites')} (${pct(n('domResolved'), n('domSites'))}); from props ${n('domFromPropsResolved')}/${n('domFromProps')} (${pct(n('domFromPropsResolved'), n('domFromProps'))})`,
        `elements: ${n('elements')} templates, ${n('grammarElements')} follow the grammar; ${n('elementsWithRole')} with an ARIA role`,
        `  with effects ${n('elementsWithEffects')} (unknown ${n('elementsWithUnknownEffects')}), opens ${n('elementsWithOpens')}, render conditions ${n('elementsWithConditions')}`,
        `client: ${n('apiCalls')} ${'/api/v4'} fetches, ${n('matchedToOpenAPI')} match an OpenAPI operation (${pct(n('matchedToOpenAPI'), n('apiCalls'))}); ${result.specGaps.length} endpoints missing from the spec`,
        `diagnostics: ${diagnostics.filter((d) => d.severity === 'error').length} errors, ${diagnostics.filter((d) => d.severity === 'warning').length} warnings`,
        ...[...byRule.entries()].sort().map(([r, c]) => `  ${r.padEnd(12)} ${String(c.error).padStart(5)} errors ${String(c.warning).padStart(5)} warnings`),
        `timings ms: ${JSON.stringify(s.timings)}`,
    ];
    return lines.join('\n');
}

/** One diagnostic in the §9.4 shape: what, where, how to fix. */
export function formatDiagnostic(d: Diagnostic): string {
    const mark = d.severity === 'error' ? '✗' : '!';
    return `${mark} ${d.at}  [${d.rule}]\n  ${d.message}${d.fix ? `\n  ${d.fix}` : ''}`;
}

/** Report files for people: unknown effects, spec gaps, a11y gaps, unresolved/unscoped testids, duplicates, everything else. */
export function writeReports(dir: string, result: ScanResult, diagnostics: Diagnostic[], unrendered: Array<{testId: string; files: string[]}> = []) {
    fs.mkdirSync(dir, {recursive: true});
    const write = (name: string, lines: string[]) => fs.writeFileSync(path.join(dir, name), lines.join('\n') + '\n');
    write('summary.txt', [summary(result, diagnostics)]);
    write('golden.json', [JSON.stringify(goldenNumbers(result.stats), null, 2)]);
    write('unknown_effects.txt', result.unknownEffects.map((u) => `${u.at}  ${u.template}\n    ${u.calls.join('\n    ')}`));
    write('spec_gaps.txt', result.specGaps.map((g) => `${g.client}: ${g.verb} ${g.path}`));
    write('unrendered_test_ids.txt', unrendered.map((u) => `${u.testId}\n    ${u.files.join('\n    ')}`));
    const rules = [...new Set(diagnostics.map((d) => d.rule))].sort();
    for (const r of rules) {
        write(`diagnostics_${r.replace(/[^a-z]+/g, '_')}.txt`, diagnostics.filter((d) => d.rule === r).map(formatDiagnostic));
    }
}

/**
 * Testids that unit tests query but no template in the manifest produces. An absence check on one
 * (`expect(queryByTestId('x')).not.toBeInTheDocument()`) can't fail: the usual trace of a rename
 * that missed a test. Testids a mock in the same test file renders are left out.
 */
export function unrenderedTestIds(manifest: Manifest, files: Array<{path: string; text: string}>): Array<{testId: string; files: string[]}> {
    // templates that are only runtime data (`{key}`) would match anything
    const patterns = manifest.elements.
        map((e) => e.template).
        filter((t) => !t.startsWith('{key}')).
        map((t) => new RegExp('^' + t.split('{key}').map(escapeRegExp).join('.+') + '$'));
    const found = new Map<string, Set<string>>();
    const query = /(?:get|query|find)(?:All)?ByTestId\(\s*['"]([^'"]+)['"]\s*\)|\[data-testid="([^"]+)"\]/g;
    for (const f of files) {
        // a mock in the test itself renders it (`jest.mock(..., () => <div data-testid='x'/>)`)
        const rendered = new Set([...f.text.matchAll(/(?<!\[)data-testid['"]?\s*[=:]\s*\{?\s*['"`]([^'"`]+)['"`]/g)].map((m) => m[1]));
        for (const m of f.text.matchAll(query)) {
            const id = m[1] ?? m[2];
            if (!rendered.has(id) && !patterns.some((p) => p.test(id))) {
                const s = found.get(id) ?? new Set<string>();
                s.add(f.path);
                found.set(id, s);
            }
        }
    }
    return [...found.entries()].sort((a, b) => cmp(a[0], b[0])).map(([testId, fs2]) => ({testId, files: [...fs2].sort()}));
}

function escapeRegExp(s: string): string {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

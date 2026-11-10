// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console */

import fs from 'node:fs';
import path from 'node:path';
import {parseArgs} from 'node:util';

import {runChecks} from './checks.ts';
import {findConfig, loadConfig, relativeToRoot, type Config} from './config.ts';
import {readVersioned} from './input.ts';
import {MANIFEST_VERSION, type Diagnostic, type Manifest} from './manifest_types.ts';
import {loadProgram} from './program.ts';
import {formatDiagnostic, manifestText, summary, templateMatcher, unrenderedTestIds, writeIfChanged, writeReports} from './report.ts';
import {Scanner, type ScanResult} from './scan.ts';
import {staleReferences} from './stale_refs.ts';

const USAGE = `test-surface <command> [--config <path>]

Commands:
  scan       Scan the TypeScript program, run checks, write test-surface.json.
  check      Scan and run checks without writing; exit 1 on errors or a stale manifest.
  report     Scan and write human-readable reports (unknown effects, spec gaps, diagnostics).
  generate   Generate the typed Playwright page objects from test-surface.json (reads only the manifest).
  watch      Keep the program warm and rescan + regenerate when files change.
  parts      Library mode: write test-parts.json (the testids each component derives from testId).
  install-hooks  Opt-in git hooks for this config: pre-commit lints, scans and regenerates; pre-push re-checks.
  where <testid> Scan and print the exact places (file:line:column) that render a testid or template, and the
                 usage chains it comes through: the manifest names only the component (file#Component).

Options:
  --config <path>   test-surface.config.json (default: nearest at or above cwd, or channels/)
  --quiet           Only print errors.
  --all             Print every diagnostic, not just errors.
`;

export type ScanOutput = {result: ScanResult; manifest: Manifest; diagnostics: Diagnostic[]};

export function scanProject(config: Config): ScanOutput {
    const loaded = loadProgram(config);
    const scanner = new Scanner(loaded, config);
    const result = scanner.scan();
    const diagnostics = runChecks(result, {...config.checks, plugin: config.plugin, configAt: relativeToRoot(config, config.configPath)});
    return {result, manifest: result.published, diagnostics};
}

export async function main(argv: string[]): Promise<number> {
    const {values, positionals} = parseArgs({
        args: argv,
        allowPositionals: true,
        options: {
            config: {type: 'string'},
            quiet: {type: 'boolean', default: false},
            all: {type: 'boolean', default: false},
            help: {type: 'boolean', short: 'h', default: false},
        },
    });
    const cmd = positionals[0];
    if (!cmd || values.help) {
        console.log(USAGE);
        return cmd ? 0 : 1;
    }
    const config = loadConfig(findConfig(values.config));
    const log = (s: string) => {
        if (!values.quiet) {
            console.log(s);
        }
    };
    const printDiagnostics = (ds: Diagnostic[]) => {
        for (const d of ds) {
            if (d.severity === 'error' || values.all) {
                console.log(formatDiagnostic(d));
            }
        }
    };

    switch (cmd) {
    case 'scan':
    case 'check':
    case 'report': {
        const {result, manifest, diagnostics} = scanProject(config);
        const text = manifestText(manifest);

        // tests that query testids the app no longer renders: printed with the rest, not stored in the manifest
        const stale = staleReferences(manifest, config);
        printDiagnostics([...diagnostics, ...stale]);
        log(summary(result, [...diagnostics, ...stale]));
        const errors = diagnostics.filter((d) => d.severity === 'error').length;
        if (cmd === 'scan') {
            const changed = writeIfChanged(config.output.manifest, text);
            log(`${changed ? 'wrote' : 'unchanged'} ${relativeToRoot(config, config.output.manifest)}`);
        }
        if (cmd === 'report' && config.output.reports) {
            const tests = testFiles(config.include).map((f) => ({path: relativeToRoot(config, f), text: fs.readFileSync(f, 'utf8')}));
            writeReports(config.output.reports, result, [...diagnostics, ...stale], unrenderedTestIds(manifest, tests));
            log(`reports in ${relativeToRoot(config, config.output.reports)}`);
        }
        if (cmd === 'check') {
            const current = fs.existsSync(config.output.manifest) ? fs.readFileSync(config.output.manifest, 'utf8') : '';
            if (current !== text) {
                console.log(`✗ ${relativeToRoot(config, config.output.manifest)} is stale. Run \`test-surface scan\` and commit the result.`);
                return 1;
            }
        }
        return errors ? 1 : 0;
    }
    case 'where': {
        const query = positionals[1];
        if (!query) {
            console.log(USAGE);
            return 1;
        }
        const {result} = scanProject(config);
        const found = result.manifest.elements.filter((e) => e.template === query || templateMatcher(e.template)?.test(query));
        for (const e of found) {
            console.log(e.template);
            for (const at of [e.component.at, ...(e.alsoAt ?? [])]) {
                console.log(`  rendered at ${at}`);
            }
            for (const via of new Set(e.instances.filter((i) => i.via.length).map((i) => i.via.join(' < ')))) {
                console.log(`  through ${via}`);
            }
        }
        if (!found.length) {
            console.log(`No testid in the scan matches "${query}".`);
        }
        return found.length ? 0 : 1;
    }
    case 'generate': {
        const {generate} = await import('./generate/index.ts');
        const read = readVersioned<Manifest>(config.output.manifest, MANIFEST_VERSION, 'The manifest', relativeToRoot(config, config.output.manifest));
        if ('diagnostic' in read) {
            console.log(formatDiagnostic(read.diagnostic));
            return 1;
        }
        const out = await generate(read.value, config);
        for (const d of out.diagnostics) {
            console.log(formatDiagnostic(d));
        }
        log(`generated ${out.files.length} files into ${relativeToRoot(config, config.output.generated!)} (${out.changed} changed)`);
        return out.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
    }
    case 'parts': {
        const {writeParts} = await import('./parts_cli.ts');
        const out = writeParts(config);
        printDiagnostics(out.diagnostics);
        log(`${out.changed ? 'wrote' : 'unchanged'} ${relativeToRoot(config, config.output.parts!)}: ${out.components} components, ${out.parts} parts`);
        return out.diagnostics.some((d) => d.severity === 'error') ? 1 : 0;
    }
    case 'install-hooks': {
        const {installHooks} = await import('./hooks.ts');
        installHooks(config.configPath, log);
        return 0;
    }
    case 'watch': {
        const {watch} = await import('./watch.ts');
        await watch(config, log);
        return 0;
    }
    default:
        console.log(USAGE);
        return 1;
    }
}

/** Unit test files under the scanned directories. */
function testFiles(dirs: string[]): string[] {
    const out: string[] = [];
    const walk = (d: string) => {
        for (const e of fs.readdirSync(d, {withFileTypes: true})) {
            if (e.name === 'node_modules' || e.name.startsWith('.')) {
                continue;
            }
            const p = path.join(d, e.name);
            if (e.isDirectory()) {
                walk(p);
            } else if ((/\.test\.tsx?$/).test(e.name)) {
                out.push(p);
            }
        }
    };
    for (const d of dirs) {
        if (fs.existsSync(d)) {
            walk(d);
        }
    }
    return out.sort();
}

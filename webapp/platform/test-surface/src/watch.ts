// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import fs from 'node:fs';
import path from 'node:path';

import {runChecks} from './checks.ts';
import {relativeToRoot, type Config} from './config.ts';
import {WatchedProgram} from './program.ts';
import type {ProgramIndex} from './program_index.ts';
import {formatDiagnostic, manifestText, writeIfChanged} from './report.ts';
import {Scanner} from './scan.ts';

const SOURCE = /\.(tsx?|jsx?)$/;

/**
 * Keeps a language service warm: each change costs an incremental program update and a rescan
 * of the (cheap) analysis, then the manifest and generated page objects are rewritten if they changed.
 */
export async function watch(config: Config, log: (s: string) => void, opts: {once?: string[]; signal?: AbortSignal} = {}) {
    const program = new WatchedProgram(config);
    let previous: ProgramIndex | undefined;
    const run = async (changed: string[]) => {
        const t0 = Date.now();
        program.touch(changed);
        const loaded = program.current();
        const tProgram = Date.now() - t0;
        const t1 = Date.now();
        const scanner = new Scanner(loaded, config, previous);
        previous = scanner.ix;
        const result = scanner.scan();
        const diagnostics = runChecks(result, {...config.checks, plugin: config.plugin});
        const manifest = {...result.manifest, diagnostics};
        const wrote = writeIfChanged(config.output.manifest, manifestText(manifest));
        const tScan = Date.now() - t1;
        let generated = 0;
        const t2 = Date.now();

        // the initial run generates too (writing only what changed), so later changes reformat only their files
        if ((wrote || !changed.length) && config.output.generated) {
            const {generate} = await import('./generate/index.ts');
            generated = (await generate(manifest, config)).changed;
        }
        const tGenerate = Date.now() - t2;
        // eslint-disable-next-line no-process-env
        if (process.env.TEST_SURFACE_TIMINGS) {
            log(`  timings ms: ${JSON.stringify(result.stats.timings)}`);
        }
        for (const d of diagnostics.filter((x) => x.severity === 'error' && changed.some((c) => x.at.startsWith(relativeToRoot(config, c))))) {
            log(formatDiagnostic(d));
        }
        log(`${changed.length ? changed.map((c) => relativeToRoot(config, c)).join(', ') : 'initial scan'}: ${Date.now() - t0} ms (program ${tProgram} ms, index ${scanner.ix.stats.indexMs} ms, scan ${tScan} ms, generate ${tGenerate} ms, ${scanner.ix.stats.reusedFiles} files reused)${wrote ? `, manifest updated, ${generated} generated files changed` : ''}`);
        return Date.now() - t0;
    };

    await run([]);
    if (opts.once) {
        return run(opts.once.map((f) => path.resolve(f)));
    }

    let pending = new Set<string>();
    let timer: NodeJS.Timeout | null = null;
    let running: Promise<number> | null = null;
    const flush = async () => {
        timer = null;
        if (running) {
            await running;
        }
        const batch = [...pending];
        pending = new Set();
        if (batch.length) {
            running = run(batch);
            await running;
            running = null;
        }
    };
    const watchers = config.include.map((dir) => fs.watch(dir, {recursive: true, signal: opts.signal}, (_event, file) => {
        // editors' and sed's temporary files (`.!123!x.tsx`, `.x.tsx.swp`) are not sources
        if (!file || !SOURCE.test(file) || file.includes('node_modules') || file.toString().split(path.sep).some((p) => p.startsWith('.'))) {
            return;
        }
        pending.add(path.join(dir, file.toString()));
        if (timer) {
            clearTimeout(timer);
        }
        timer = setTimeout(flush, 150);
    }));
    log(`watching ${config.include.map((d) => relativeToRoot(config, d)).join(', ')} (ctrl-c to stop)`);
    await new Promise<void>((resolve) => {
        const stop = () => {
            watchers.forEach((w) => w.close());
            resolve();
        };
        process.once('SIGINT', stop);
        opts.signal?.addEventListener('abort', stop);
    });
    return 0;
}

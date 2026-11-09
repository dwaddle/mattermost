// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console, no-process-exit -- a git hook reports and sets its exit status */

// pre-commit (`test-surface install-hooks`): the lint rules on staged sources next to the config (syntactic,
// about a second), then the scan and the generator (about 10 s), adding the manifest and generated page
// objects to the same commit, so they never go out stale. The scan reads the working tree: with unstaged
// edits it can see more than the commit holds, and CI's staleness check catches that case.

import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

import {loadConfig} from '../src/config.ts';

const {values} = parseArgs({options: {config: {type: 'string'}}});
const config = loadConfig(values.config);
const cli = fileURLToPath(new URL('../bin/test-surface.mjs', import.meta.url));
const configDir = path.dirname(config.configPath);
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: configDir, encoding: 'utf8'}).trim();

const inside = (file, dir) => !path.relative(dir, file).startsWith('..');
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {cwd: repo, encoding: 'utf8'}).
    split('\n').
    filter((f) => (/\.tsx?$/).test(f) && !(/\.test\.tsx?$/).test(f)).
    map((f) => path.join(repo, f)).
    filter((f) => config.include.some((dir) => inside(f, dir)));
if (!staged.length) {
    process.exit(0);
}

// the files the config's own eslint config covers (other packages have their own)
const lint = staged.filter((f) => inside(f, configDir));
if (lint.length) {
    const res = spawnSync('npx', ['eslint', '--quiet', ...lint], {cwd: configDir, stdio: 'inherit'});
    if (res.status) {
        console.error('\ntestid lint failed (see above). Fix the testids, or commit with --no-verify to skip.');
        process.exit(res.status ?? 1);
    }
}

const run = (cmd) => spawnSync(process.execPath, [cli, cmd, '--config', config.configPath, '--quiet'], {stdio: 'inherit'}).status;
if (run('scan') || (config.output.generated && run('generate'))) {
    console.error('\ntest-surface found errors (see above). Fix them, or commit with --no-verify to skip.');
    process.exit(1);
}
const outputs = [config.output.manifest, config.output.generated].filter(Boolean).map((p) => path.relative(repo, p));
const changed = execFileSync('git', ['status', '--porcelain', '--', ...outputs], {cwd: repo, encoding: 'utf8'}).trim();
if (changed) {
    execFileSync('git', ['add', '--', ...outputs], {cwd: repo});
    console.log('test-surface: regenerated the manifest and page objects and added them to this commit.');
}
process.exit(0);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console, no-process-exit -- a git hook reports and sets its exit status */

// pre-push (`test-surface install-hooks`): a safety net for commits made without the pre-commit hook
// (--no-verify, another machine). It scans, checks and regenerates (~10 s); a hook can't add commits to the
// push, so when the manifest or generated page objects change it stops the push and says what to commit.

import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parseArgs} from 'node:util';

import {loadConfig} from '../src/config.ts';

const {values} = parseArgs({options: {config: {type: 'string'}}});
const config = loadConfig(values.config);
const cli = fileURLToPath(new URL('../bin/test-surface.mjs', import.meta.url));
const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {cwd: path.dirname(config.configPath), encoding: 'utf8'}).trim();
const outputs = [config.output.manifest, config.output.generated].filter(Boolean).map((p) => path.relative(repo, p));

// what this push adds; a branch without an upstream yet is always checked
let changed = null;
try {
    changed = execFileSync('git', ['diff', '--name-only', '@{push}..HEAD'], {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).split('\n').filter(Boolean);
} catch {
    changed = null;
}
const watched = [path.relative(repo, config.root), ...outputs];
if (changed && !changed.some((f) => watched.some((w) => f === w || f.startsWith(`${w}/`)))) {
    process.exit(0);
}
const run = (cmd) => spawnSync(process.execPath, [cli, cmd, '--config', config.configPath, '--quiet'], {stdio: 'inherit'}).status;
if (run('scan') || (config.output.generated && run('generate'))) {
    console.error('\ntest-surface found errors (see above). Fix them, or push with --no-verify to skip.');
    process.exit(1);
}
const dirty = execFileSync('git', ['status', '--porcelain', '--', ...outputs], {cwd: repo, encoding: 'utf8'}).trim();
if (dirty) {
    console.error(`\nThe manifest or generated page objects changed:\n${dirty}\n\nCommit them and push again:\n    git add ${outputs.join(' ')} && git commit -m "Regenerate test surface"`);
    process.exit(1);
}
process.exit(0);

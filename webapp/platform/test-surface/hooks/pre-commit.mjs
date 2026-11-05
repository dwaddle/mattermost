// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console, no-process-exit -- a git hook reports and sets its exit status */

// pre-commit: the testid lint rules on staged webapp sources (syntactic, about a second), then the scan
// and the generator (about 10 s), adding the manifest and generated page objects to the same commit, so
// they never go out stale. The scan reads the working tree: with unstaged edits it can see more than the
// commit holds, and CI's staleness check catches that case.

import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';

const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();
const staged = execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACMR'], {cwd: repo, encoding: 'utf8'}).
    split('\n').
    filter((f) => (/^webapp\/(channels\/src|platform\/[^/]+\/src)\/.*\.tsx?$/).test(f) && !(/\.test\.tsx?$/).test(f));
if (!staged.length) {
    process.exit(0);
}
const channels = path.join(repo, 'webapp/channels');
const files = staged.filter((f) => f.startsWith('webapp/channels/')).map((f) => path.join(repo, f));
if (!files.length) {
    process.exit(0);
}
const res = spawnSync('npx', ['eslint', '--quiet', ...files], {cwd: channels, stdio: 'inherit'});
if (res.status) {
    console.error('\ntestid lint failed (see above). Fix the testids, or commit with --no-verify to skip.');
    process.exit(res.status ?? 1);
}

const run = (script) => spawnSync('npm', ['run', '--silent', script, '--', '--quiet'], {cwd: channels, stdio: 'inherit'}).status;
if (run('test-surface') || run('test-surface:generate')) {
    console.error('\ntest-surface found errors (see above). Fix them, or commit with --no-verify to skip.');
    process.exit(1);
}
const outputs = ['webapp/channels/test-surface.json', 'e2e-tests/playwright/lib/src/ui/generated'];
const changed = execFileSync('git', ['status', '--porcelain', '--', ...outputs], {cwd: repo, encoding: 'utf8'}).trim();
if (changed) {
    execFileSync('git', ['add', '--', ...outputs], {cwd: repo});
    console.log('test-surface: regenerated the manifest and page objects and added them to this commit.');
}
process.exit(0);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console, no-process-exit -- a git hook reports and sets its exit status */

// pre-push: a safety net for commits made without the pre-commit hook (--no-verify, another machine).
// It scans, checks and regenerates (~10 s); a hook can't add commits to the push, so when the manifest or
// generated page objects change it stops the push and says what to commit.

import {execFileSync, spawnSync} from 'node:child_process';
import path from 'node:path';

const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], {encoding: 'utf8'}).trim();

// what this push adds; a branch without an upstream yet is always checked
let changed = null;
try {
    changed = execFileSync('git', ['diff', '--name-only', '@{push}..HEAD'], {cwd: repo, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore']}).split('\n').filter(Boolean);
} catch {
    changed = null;
}
if (changed && !changed.some((f) => f.startsWith('webapp/') || f.startsWith('e2e-tests/playwright/lib/'))) {
    process.exit(0);
}
const channels = path.join(repo, 'webapp/channels');
const run = (script) => spawnSync('npm', ['run', '--silent', script, '--', '--quiet'], {cwd: channels, stdio: 'inherit'}).status;
if (run('test-surface') || run('test-surface:generate')) {
    console.error('\ntest-surface found errors (see above). Fix them, or push with --no-verify to skip.');
    process.exit(1);
}
const outputs = ['webapp/channels/test-surface.json', 'e2e-tests/playwright/lib/src/ui/generated'];
const dirty = execFileSync('git', ['status', '--porcelain', '--', ...outputs], {cwd: repo, encoding: 'utf8'}).trim();
if (dirty) {
    console.error(`\nThe manifest or generated page objects changed:\n${dirty}\n\nCommit them and push again:\n    git add ${outputs.join(' ')} && git commit -m "Regenerate test surface"`);
    process.exit(1);
}

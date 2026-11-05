// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-console, no-process-exit -- a git hook reports and sets its exit status */

// Installs the test-surface git hooks (opt-in): `npm run test-surface:install-hooks` in webapp/channels.
// Existing hooks are kept: ours run first and then call them.

import {execFileSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const hooksDir = execFileSync('git', ['rev-parse', '--git-path', 'hooks'], {encoding: 'utf8'}).trim();
fs.mkdirSync(hooksDir, {recursive: true});
for (const name of ['pre-commit', 'pre-push']) {
    const target = path.resolve(hooksDir, name);
    const marker = '# test-surface hook';
    let previous = '';
    if (fs.existsSync(target)) {
        const current = fs.readFileSync(target, 'utf8');
        if (current.includes(marker)) {
            console.log(`${name}: already installed`);
            continue;
        }
        fs.renameSync(target, `${target}.local`);
        previous = `\nif [ -x "${target}.local" ]; then "${target}.local" "$@" || exit $?; fi\n`;
    }
    fs.writeFileSync(target, `#!/bin/sh\n${marker}\nnode "${path.join(here, `${name}.mjs`)}" || exit $?\n${previous}`, {mode: 0o755});
    console.log(`${name}: installed (${target})`);
}

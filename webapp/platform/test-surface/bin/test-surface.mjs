#!/usr/bin/env node
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Runs from source: Node 24 strips TypeScript types natively, so the tool has no build step.

import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

// a whole-webapp program needs more than Node's default heap: rerun with 8 GB unless the caller chose a size
const sized = (args) => args.some((a) => a.startsWith('--max-old-space-size'));
// eslint-disable-next-line no-process-env -- a size set through NODE_OPTIONS wins too
if (!sized(process.execArgv) && !sized((process.env.NODE_OPTIONS ?? '').split(/\s+/))) {
    const res = spawnSync(process.execPath, ['--max-old-space-size=8192', ...process.execArgv, fileURLToPath(import.meta.url), ...process.argv.slice(2)], {stdio: 'inherit'});
    process.exitCode = res.status ?? 1;
} else {
    const {main} = await import('../src/cli.ts');
    main(process.argv.slice(2)).then((code) => {
        process.exitCode = code;
    }, (err) => {
        // eslint-disable-next-line no-console
        console.error(err);
        process.exitCode = 2;
    });
}

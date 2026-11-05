#!/usr/bin/env node
// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Runs from source: Node 24 strips TypeScript types natively, so the tool has no build step.
import {main} from '../src/cli.ts';

main(process.argv.slice(2)).then((code) => {
    process.exitCode = code;
}, (err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exitCode = 2;
});

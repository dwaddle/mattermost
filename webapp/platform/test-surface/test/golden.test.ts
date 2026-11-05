// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {scanProject} from '../src/cli.ts';
import {loadConfig} from '../src/config.ts';
import {goldenNumbers} from '../src/report.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenFile = path.join(here, '..', 'golden.json');

// eslint-disable-next-line no-process-env
const enabled = Boolean(process.env.TEST_SURFACE_GOLDEN);

// Scans the real webapp: resolution and tracing coverage may not drop below the recorded numbers.
test('golden numbers on the webapp', {skip: !enabled && 'set TEST_SURFACE_GOLDEN=1 (scans the whole webapp)'}, () => {
    const {result} = scanProject(loadConfig(path.join(here, '..', '..', '..', 'channels', 'test-surface.config.json')));
    const now = goldenNumbers(result.stats);
    const recorded = JSON.parse(fs.readFileSync(goldenFile, 'utf8')) as Record<string, number>;
    const drops = Object.entries(recorded).filter(([k, v]) => (now[k] ?? 0) < v).map(([k, v]) => `${k}: ${now[k]} < ${v}`);
    assert.deepEqual(drops, [], `coverage dropped:\n  ${drops.join('\n  ')}\nIf this is intended, update golden.json.`);
});

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {test} from 'node:test';
import {fileURLToPath} from 'node:url';

import {scanProject} from '../src/cli.ts';
import {loadConfig} from '../src/config.ts';
import {goldenCeilings, goldenNumbers} from '../src/report.ts';
import {staleReferences} from '../src/stale_refs.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const goldenFile = path.join(here, '..', 'golden.json');

// eslint-disable-next-line no-process-env
const enabled = Boolean(process.env.TEST_SURFACE_GOLDEN);

type Golden = Record<string, number> & {ceilings?: Record<string, number>; warnings?: Record<string, number>};

// Scans the real webapp: resolution and tracing coverage may not drop below the recorded numbers, and the counts
// under `ceilings` (values cut at a cap) and `warnings` (per rule; a rule not listed has none) may not rise.
test('golden numbers on the webapp', {skip: !enabled && 'set TEST_SURFACE_GOLDEN=1 (scans the whole webapp)'}, () => {
    const config = loadConfig(path.join(here, '..', '..', '..', 'channels', 'test-surface.config.json'));
    const {result, manifest, diagnostics} = scanProject(config);
    const now = goldenNumbers(result.stats);
    const {ceilings = {}, warnings, ...floors} = JSON.parse(fs.readFileSync(goldenFile, 'utf8')) as Golden;
    const drops = Object.entries(floors).filter(([k, v]) => (now[k] ?? 0) < v).map(([k, v]) => `${k}: ${now[k]} < ${v}`);
    const above = goldenCeilings(result.stats, [...diagnostics, ...staleReferences(manifest, config)]);
    const rises = Object.entries(ceilings).filter(([k, v]) => (above.ceilings[k] ?? 0) > v).map(([k, v]) => `${k}: ${above.ceilings[k]} > ${v}`);
    const more = warnings ? Object.entries(above.warnings).filter(([r, c]) => c > (warnings[r] ?? 0)).map(([r, c]) => `${r} warnings: ${c} > ${warnings[r] ?? 0}`) : [];
    const failures = [...drops, ...rises, ...more];
    assert.deepEqual(failures, [], `coverage dropped or a ceiling was passed:\n  ${failures.join('\n  ')}\nIf this is intended, update golden.json (\`test-surface report\` writes the current numbers to reports/golden.json).`);
});

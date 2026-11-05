// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {scanProject, type ScanOutput} from '../src/cli.ts';
import {loadConfig} from '../src/config.ts';

export const FIXTURES = path.join(path.dirname(fileURLToPath(import.meta.url)), 'fixtures');

const cache = new Map<string, ScanOutput>();

/** Scans a fixture project (test/fixtures/<name>) once per test run. */
export function scanFixture(name: string): ScanOutput {
    const hit = cache.get(name);
    if (hit) {
        return hit;
    }
    const out = scanProject(loadConfig(path.join(FIXTURES, name, 'test-surface.config.json')));
    cache.set(name, out);
    return out;
}

/** Compares a value with test/fixtures/<name>/<file>; UPDATE_SNAPSHOTS=1 rewrites the file. */
export function matchSnapshot(name: string, file: string, value: unknown) {
    const p = path.join(FIXTURES, name, file);
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2) + '\n';
    // eslint-disable-next-line no-process-env
    if (process.env.UPDATE_SNAPSHOTS || !fs.existsSync(p)) {
        fs.writeFileSync(p, text);
        return;
    }
    assert.equal(text, fs.readFileSync(p, 'utf8'), `snapshot ${name}/${file} differs (UPDATE_SNAPSHOTS=1 to accept)`);
}

/** Element lookup by template. */
export function element(out: ScanOutput, template: string) {
    const el = out.manifest.elements.find((e) => e.template === template);
    assert.ok(el, `no element ${template}; have:\n  ${out.manifest.elements.map((e) => e.template).join('\n  ')}`);
    return el;
}

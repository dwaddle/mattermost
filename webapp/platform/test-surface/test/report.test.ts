// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {scanFixture} from './helpers.ts';

import type {Manifest} from '../src/manifest_types.ts';
import {goldenCeilings, manifestText, unrenderedTestIds} from '../src/report.ts';

const manifest = {elements: [{template: 'panel.save--button'}, {template: 'list.row:{key}--link'}, {template: '{key}'}]} as unknown as Manifest;

test('report: testids tests query that no template produces', () => {
    const out = unrenderedTestIds(manifest, [{path: 'a.test.tsx',
        text: [
            "expect(screen.queryByTestId('panel.save--button')).toBeInTheDocument();",
            "screen.getByTestId('list.row:abc--link');",
            "expect(screen.queryByTestId('oldSaveButton')).not.toBeInTheDocument();",
            "cy.get('[data-testid=\"gone\"]');",
            "jest.mock('./x', () => () => <div data-testid='mocked'/>); screen.getByTestId('mocked');",
        ].join('\n')}]);
    assert.deepEqual(out, [{testId: 'gone', files: ['a.test.tsx']}, {testId: 'oldSaveButton', files: ['a.test.tsx']}]);
});

test('report: the manifest holds no diagnostics; the golden ceilings count warnings per rule', () => {
    const out = scanFixture('checks');
    assert.ok(!('diagnostics' in out.manifest));
    assert.ok(!manifestText(out.manifest).includes('"diagnostics"'));
    const {warnings} = goldenCeilings(out.result.stats, [...out.diagnostics, {rule: 'aria', severity: 'warning', at: 'x', message: 'm'}]);
    assert.equal(warnings.aria, out.diagnostics.filter((d) => d.rule === 'aria' && d.severity === 'warning').length + 1);
});

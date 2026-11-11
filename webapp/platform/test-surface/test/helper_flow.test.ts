// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import assert from 'node:assert/strict';
import {test} from 'node:test';

import {scanFixture} from './helpers.ts';

/**
 * The instances (template @ usage chain, exact locations) that come through one file of the fixture, with its
 * scope prefix and file name written the same for both files.
 */
function instancesOf(file: string, prefix: string): string[] {
    return scanFixture('helper_flow').result.manifest.elements.flatMap((e) => e.instances.
        filter((i) => i.via.some((at) => at.includes(file))).
        map((i) => `${e.template.replaceAll(prefix, 'X')} @ ${i.via.join(' < ').replaceAll(file, 'F')}`)).
        sort();
}

test('helper flow: part(scope, …) gives the same instances as the guarded template it stands for', () => {
    const template = instancesOf('template.tsx', 'tpl');
    assert.deepEqual(instancesOf('helper.tsx', 'hlp'), template);

    // what the two cases are about: a hook's testid built from a scope its callers pass, and a fallback testid
    // where a scope passed down can be unset (a runtime value)
    assert.ok(template.some((t) => t.startsWith('X.menu.item.icon @ ')), template.join('\n'));
    assert.ok(template.some((t) => t.startsWith('X_spinner @ ') && t.endsWith(':60:17')), template.join('\n'));
});

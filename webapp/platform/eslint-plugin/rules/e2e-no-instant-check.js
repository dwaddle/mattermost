// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// A one-shot read inside an assertion (`expect(await x.isDisabled()).toBe(true)`) checks the state once, so right after
// an action it sees the state before the re-render and fails, or passes, by timing. The retrying matchers wait for the
// state: `toBeDisabled()`, `toBeChecked()`, `toHaveValue(v)`, `toHaveText(t)`, `toHaveCount(n)`.
//
// The rule reports `expect(await <locator or driver>.<read>())` for the state reads below. It doesn't look at what
// came before: measured on the specs, a read in an assertion is almost always checking state an earlier step
// changed, and a read that isn't (`expect(await rows.count()).toBeLessThan(5)` after waiting for the list) reads just
// as well with `toHaveCount`. A value kept for later (`const n = await rows.count()`) isn't an assertion and isn't
// reported.

import {calleeName, expectCall} from './e2e-utils.js';

const READS = {
    isVisible: 'toBeVisible()',
    isHidden: 'toBeHidden()',
    isEnabled: 'toBeEnabled()',
    isDisabled: 'toBeDisabled()',
    isChecked: 'toBeChecked()',
    isEditable: 'toBeEditable()',
    isOn: 'toBeChecked()',
    isPressed: "toHaveAttribute('aria-pressed', 'true')",
    isSelected: "toHaveAttribute('aria-selected', 'true')",
    isExpanded: "toHaveAttribute('aria-expanded', 'true')",
    count: 'toHaveCount(n)',
    textContent: 'toHaveText(t)',
    innerText: 'toHaveText(t)',
    text: 'toHaveText(t)',
    inputValue: 'toHaveValue(v)',
    value: 'toHaveValue(v)',
    getAttribute: 'toHaveAttribute(name, v)',
};

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow one-shot state reads in assertions; use a retrying matcher',
        },
        schema: [],
    },
    create: (context) => ({
        CallExpression: (node) => {
            if (node.callee.type !== 'Identifier' || node.callee.name !== 'expect') {
                return;
            }
            const subject = node.arguments[0];
            if (!subject || subject.type !== 'AwaitExpression' || subject.argument.type !== 'CallExpression') {
                return;
            }
            const read = calleeName(subject.argument);
            if (!read || !Object.hasOwn(READS, read) || subject.argument.callee.type !== 'MemberExpression') {
                return;
            }
            let matcher = node.parent;
            while (matcher && matcher.type === 'MemberExpression') {
                matcher = matcher.parent;
            }
            if (!matcher || matcher.type !== 'CallExpression' || expectCall(matcher) !== node) {
                return;
            }
            context.report({
                node,
                message: `\`${read}()\` reads the state once: use the retrying \`expect(…).${READS[read]}\`.`,
            });
        },
    }),
};

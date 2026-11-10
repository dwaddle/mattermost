// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Timeouts come from the lib's named durations (`duration.half_min`), so a slow environment can be tuned in one
// place and a reader sees the intent. Flags numbers written as a `timeout:` option and in `test.setTimeout(n)`, and
// suggests the named duration that rounds up (a wait never gets shorter). A matcher's timeout at or under the
// expect default (10 s) can simply go.

/** The lib's `duration` (lib/src/util.ts), in milliseconds. */
export const DURATIONS = {
    half_sec: 500,
    one_sec: 1000,
    two_sec: 2000,
    four_sec: 4000,
    ten_sec: 10000,
    half_min: 30000,
    one_min: 60000,
    two_min: 120000,
    four_min: 240000,
    ten_min: 600000,
};

const EXPECT_DEFAULT = 10000;

/** The value of an all-number expression (`30 * 1000`), or null. */
function numberValue(node) {
    if (node.type === 'Literal' && typeof node.value === 'number') {
        return node.value;
    }
    if (node.type === 'BinaryExpression' && ['*', '+', '-', '/'].includes(node.operator)) {
        const a = numberValue(node.left);
        const b = numberValue(node.right);
        if (a === null || b === null) {
            return null;
        }
        switch (node.operator) {
        case '*': return a * b;
        case '+': return a + b;
        case '-': return a - b;
        default: return a / b;
        }
    }
    return null;
}

function roundUp(ms, durations) {
    const fit = Object.entries(durations).sort((a, b) => a[1] - b[1]).find(([, v]) => v >= ms);
    return fit ? `duration.${fit[0]}` : null;
}

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Require timeouts in e2e code to use the named durations',
        },
        schema: [{
            type: 'object',
            properties: {durations: {type: 'object', additionalProperties: {type: 'number'}}},
            additionalProperties: false,
        }],
    },
    create: (context) => {
        const durations = (context.options[0] && context.options[0].durations) || DURATIONS;
        const report = (node, ms, isMatcherOption) => {
            const named = roundUp(ms, durations);
            let hint = named ? `use \`${named}\`` : 'use a named duration';
            if (isMatcherOption && ms <= EXPECT_DEFAULT) {
                hint = `drop it (the expect default is ${EXPECT_DEFAULT / 1000} s) or ${hint}`;
            }
            context.report({node, message: `Hard-coded timeout ${ms} ms: ${hint}.`});
        };
        return {
            Property: (node) => {
                if (node.computed || node.parent.type !== 'ObjectExpression') {
                    return;
                }
                const key = node.key.type === 'Identifier' ? node.key.name : node.key.value;
                const ms = key === 'timeout' ? numberValue(node.value) : null;
                if (ms === null || ms === 0) {
                    return;
                }
                const call = node.parent.parent;
                const callName = call && call.type === 'CallExpression' && call.callee.type === 'MemberExpression' && call.callee.property.type === 'Identifier' ? call.callee.property.name : '';
                report(node.value, ms, (/^(to|not)/).test(callName));
            },
            CallExpression: (node) => {
                const c = node.callee;
                if (c.type !== 'MemberExpression' || c.computed || c.property.type !== 'Identifier' || c.property.name !== 'setTimeout' || !node.arguments[0]) {
                    return;
                }
                const ms = numberValue(node.arguments[0]);
                if (ms !== null && ms !== 0) {
                    report(node.arguments[0], ms, false);
                }
            },
        };
    },
};

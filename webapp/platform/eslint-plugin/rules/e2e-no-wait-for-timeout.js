// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Waiting belongs to the framework: `settle(el, act, {wait})` waits for the request an action fires, and
// the matchers retry. A fixed sleep is either too short (flaky) or too long (slow).
export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow fixed sleeps (waitForTimeout) in e2e code',
        },
        schema: [],
    },
    create: (context) => ({
        CallExpression: (node) => {
            const callee = node.callee;
            if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier' && callee.property.name === 'waitForTimeout') {
                context.report({
                    node,
                    message: 'No fixed sleeps: use `settle(element, action, {wait: Api.X})` for a request, or a retrying matcher for UI state.',
                });
            }
        },
    }),
};

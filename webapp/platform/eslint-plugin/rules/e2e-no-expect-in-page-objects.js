// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Page objects and flows locate and act; specs assert. An `expect` inside a page object hides an
// assertion from the test that relies on it.
export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow expect() in generated page objects and flows',
        },
        schema: [],
    },
    create: (context) => ({
        CallExpression: (node) => {
            const callee = node.callee;
            const name = callee.type === 'Identifier' ? callee.name : null;
            const base = callee.type === 'MemberExpression' && callee.object.type === 'Identifier' ? callee.object.name : null;
            if (name === 'expect' || base === 'expect') {
                context.report({
                    node,
                    message: 'No assertions in page objects or flows: return the element or value and assert in the spec.',
                });
            }
        },
    }),
};

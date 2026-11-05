// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Specs reach elements through the generated page objects (`app.channelHeader.clickOpenMenuButton()`),
// not hand-written selectors: a literal locator in a spec is a magic string the generator can't keep in
// sync with the webapp. Text a user types and values from generated types (`Msg`, `Api`, key sets) are fine.
const LOCATOR_METHODS = new Set(['locator', 'getByTestId', 'getByText', 'getByLabel', 'getByPlaceholder', 'getByTitle', 'getByAltText']);

function isLiteralString(node) {
    if (!node) {
        return false;
    }
    if (node.type === 'Literal') {
        return typeof node.value === 'string' || node.regex !== undefined;
    }
    return node.type === 'TemplateLiteral' && node.expressions.length === 0;
}

function literalName(options) {
    if (!options || options.type !== 'ObjectExpression') {
        return null;
    }
    const name = options.properties.find((p) => p.type === 'Property' && !p.computed && ((p.key.type === 'Identifier' && p.key.name === 'name') || (p.key.type === 'Literal' && p.key.value === 'name')));
    return name && isLiteralString(name.value) ? name.value : null;
}

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow string-literal locators in e2e specs; use the generated page objects',
        },
        schema: [],
    },
    create: (context) => ({
        CallExpression: (node) => {
            const callee = node.callee;
            if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier') {
                return;
            }
            const method = callee.property.name;
            if (LOCATOR_METHODS.has(method) && isLiteralString(node.arguments[0])) {
                context.report({
                    node: node.arguments[0],
                    message: `\`${method}()\` with a literal in a spec. Reach the element through \`app\` (the generated page objects); migrate the webapp area if it has no testids yet.`,
                });
                return;
            }
            if (method === 'getByRole') {
                const name = literalName(node.arguments[1]);
                if (name) {
                    context.report({
                        node: name,
                        message: '`getByRole()` with a literal name in a spec. Use the generated page objects, or `Msg` for the accessible name.',
                    });
                }
            }
        },
    }),
};

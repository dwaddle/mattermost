// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- messages and cases quote template-literal syntax */

import {testIdTarget, testIdValueNode} from './testid-grammar.js';

// A testid passed down from a parent prop is fine (`data-testid={props.testId}`); one made entirely of
// runtime data is not (`data-testid={setting.key}`): its scope and name must be literal in the source.
const PASS_THROUGH = /(^|\.)(\w*test[_-]?id\w*|id)$/i;

function nameOf(expr) {
    if (expr.type === 'Identifier') {
        return expr.name;
    }
    if (expr.type === 'MemberExpression' && !expr.computed && expr.property.type === 'Identifier') {
        const obj = nameOf(expr.object);
        return obj ? `${obj}.${expr.property.name}` : expr.property.name;
    }
    if (expr.type === 'MemberExpression' && expr.computed && expr.property.type === 'Literal') {
        return String(expr.property.value);
    }
    return null;
}

function hasLiteralPart(expr) {
    switch (expr.type) {
    case 'Literal':
        return typeof expr.value === 'string' || expr.value === null;
    case 'TemplateLiteral':
        return expr.quasis.some((q) => (q.value.cooked ?? q.value.raw).length > 0);
    case 'ConditionalExpression':
        return hasLiteralPart(expr.consequent) || hasLiteralPart(expr.alternate);
    case 'LogicalExpression':
        return hasLiteralPart(expr.right) || hasLiteralPart(expr.left);
    case 'BinaryExpression':
        return hasLiteralPart(expr.left) || hasLiteralPart(expr.right);
    case 'Identifier':
        return expr.name === 'undefined';
    case 'TSAsExpression':
    case 'TSNonNullExpression':
        return hasLiteralPart(expr.expression);
    default:
        return false;
    }
}

function isPassThrough(expr) {
    if (expr.type === 'TSAsExpression' || expr.type === 'TSNonNullExpression') {
        return isPassThrough(expr.expression);
    }
    if (expr.type === 'ConditionalExpression') {
        return (isPassThrough(expr.consequent) || hasLiteralPart(expr.consequent)) && (isPassThrough(expr.alternate) || hasLiteralPart(expr.alternate));
    }
    if (expr.type === 'LogicalExpression') {
        return isPassThrough(expr.left) || isPassThrough(expr.right);
    }
    const name = nameOf(expr);
    return Boolean(name && PASS_THROUGH.test(name));
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow testids made entirely of runtime data; the scope and name must be literal',
        },
        schema: [],
    },
    create: (context) => {
        const check = (node) => {
            const target = testIdTarget(node);
            if (!target || !target.withRole) {
                return;
            }
            const value = testIdValueNode(node);
            if (!value || hasLiteralPart(value) || isPassThrough(value)) {
                return;
            }
            context.report({
                node: value,
                message: 'testid is made entirely of runtime data. Write the scope and name as literals and put the data in the key: `scope.name:${value}--role`.',
            });
        };
        return {
            JSXAttribute: check,
            Property: check,
        };
    },
};

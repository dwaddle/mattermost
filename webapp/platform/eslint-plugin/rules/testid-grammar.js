// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- messages and cases quote template-literal syntax */

// The testid grammar is defined once, in @mattermost/types/test_id:
//
//     testid  := path [ ":" KEY ] [ "--" ROLE ]
//     path    := WORD ( "." WORD )*        leading WORDs = scope, last WORD = name
//     WORD    := [a-z][a-z0-9_]*
//
// In a template literal, runtime data may fill the key (`a.b.item:${id}--button`) or, in a component
// that composes its parts from a testId prop, the whole leading path (`${testId}.close--button`).

import {isTestIdProblem, parseTestId, TEST_ID_ROLES} from '@mattermost/types/test_id';

const KEY = '\u0000';
const PREFIX = '\u0001';

const MESSAGES = {
    dashes_before_role: () => '"--" may only precede the role',
    empty_key: () => 'empty key after ":"',
    key_characters: () => 'a key may not contain "." or ":"',
    data_outside_key: () => 'runtime data may only fill the key of the last word (`scope.name:${value}`)',
    composed_without_dot: () => 'a composed testid continues its prefix with "." (`${testId}.part--role`)',
    unknown_role: (p) => `unknown role "--${p.role}"; use one of ${TEST_ID_ROLES.join(', ')}`,
    word: (p) => `"${p.word}" is not a lower_snake_case word`,
    unscoped: () => 'a testid needs a scope (`area.name--role`)',
};

/**
 * Checks a testid written as literal text, where KEY marks runtime data after ":" and PREFIX marks a
 * leading composed path. Returns an error message, or null when it follows the grammar.
 */
export function grammarError(text, {withRole = true} = {}) {
    if (!withRole && text.includes('--')) {
        return 'a testId prop is the path only; the component appends "--<role>"';
    }
    const p = parseTestId(text, {key: KEY, prefix: PREFIX});
    return isTestIdProblem(p) ? MESSAGES[p.problem](p) : null;
}

/** Literal text of a testid expression with runtime parts marked, or null when it isn't literal/template. */
export function testIdText(node) {
    if (!node) {
        return null;
    }
    if (node.type === 'Literal' && typeof node.value === 'string') {
        return node.value;
    }
    if (node.type === 'TemplateLiteral') {
        let out = '';
        node.quasis.forEach((q, i) => {
            out += q.value.cooked ?? q.value.raw;
            if (i < node.expressions.length) {
                out += i === 0 && out === '' ? PREFIX : KEY;
            }
        });
        return out;
    }
    return null;
}

export function testIdValueNode(attrOrProp) {
    const v = attrOrProp.value;
    if (!v) {
        return null;
    }
    if (v.type === 'JSXExpressionContainer') {
        return v.expression;
    }
    return v;
}

/** Which attributes/properties carry testids: data-testid always, testId props without the role. */
export function testIdTarget(node) {
    if (node.type === 'JSXAttribute') {
        const name = node.name.type === 'JSXIdentifier' ? node.name.name : null;
        if (name === 'data-testid') {
            return {withRole: true};
        }
        if (name === 'testId') {
            return {withRole: false};
        }
        return null;
    }
    if (node.type === 'Property' && !node.computed) {
        const key = node.key.type === 'Literal' ? node.key.value : node.key.name;
        return key === 'data-testid' ? {withRole: true} : null;
    }
    return null;
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require data-testid values to follow the testid grammar (scope.name:key--role)',
        },
        schema: [],
    },
    create: (context) => {
        const check = (node) => {
            const target = testIdTarget(node);
            if (!target) {
                return;
            }
            const value = testIdValueNode(node);
            const text = testIdText(value);
            if (text === null) {
                return;
            }
            const error = grammarError(text, target);
            if (error) {
                context.report({node: value, message: `testid ${JSON.stringify(text.replaceAll(KEY, '${…}').replaceAll(PREFIX, '${…}'))}: ${error}.`});
            }
        };
        return {
            JSXAttribute: check,
            Property: check,
        };
    },
};

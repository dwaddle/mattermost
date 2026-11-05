// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- messages and cases quote template-literal syntax */

// The testid grammar (see webapp/platform/test-surface/README.md):
//
//     testid  := path [ ":" KEY ] [ "--" ROLE ]
//     path    := WORD ( "." WORD )*        leading WORDs = scope, last WORD = name
//     WORD    := [a-z][a-z0-9_]*
//
// In a template literal, runtime data may fill the key (`a.b.item:${id}--button`) or, in a component
// that composes its parts from a testId prop, the whole leading path (`${testId}.close--button`).

export const ROLES = [
    'button', 'link', 'textbox', 'searchbox', 'checkbox', 'switch', 'radio', 'radiogroup', 'combobox',
    'listbox', 'option', 'tab', 'tablist', 'tabpanel', 'menu', 'menuitem', 'menuitemcheckbox', 'menuitemradio',
    'dialog', 'alertdialog', 'slider', 'spinbutton', 'togglebutton', 'text', 'img', 'list', 'listitem', 'row',
    'grid', 'gridcell', 'status', 'alert', 'tooltip', 'region', 'separator',
];

const WORD = /^[a-z][a-z0-9_]*$/;
const KEY = '\u0000';
const PREFIX = '\u0001';

/**
 * Checks a testid written as literal text, where KEY marks runtime data after ":" and PREFIX marks a
 * leading composed path. Returns an error message, or null when it follows the grammar.
 */
export function grammarError(text, {withRole = true} = {}) {
    let rest = text;
    const dash = rest.lastIndexOf('--');
    if (dash >= 0) {
        const role = rest.slice(dash + 2);
        if (!withRole) {
            return 'a testId prop is the path only; the component appends "--<role>"';
        }
        if (!ROLES.includes(role)) {
            return `unknown role "--${role}"; use one of ${ROLES.join(', ')}`;
        }
        rest = rest.slice(0, dash);
    }
    if (rest.includes('--')) {
        return '"--" may only precede the role';
    }
    const colon = rest.indexOf(':');
    if (colon >= 0) {
        const key = rest.slice(colon + 1);
        rest = rest.slice(0, colon);
        if (!key.length) {
            return 'empty key after ":"';
        }
        if (key !== KEY && (/[.:]/).test(key.replaceAll(KEY, ''))) {
            return 'a key may not contain "." or ":"';
        }
    }
    if (rest.includes(KEY)) {
        return 'runtime data may only fill the key of the last word (`scope.name:${value}`)';
    }
    const composed = rest.startsWith(PREFIX);
    if (composed) {
        rest = rest.slice(1);
        if (rest === '') {
            return null;
        }
        if (!rest.startsWith('.')) {
            return 'a composed testid continues its prefix with "." (`${testId}.part--role`)';
        }
        rest = rest.slice(1);
    }
    if (rest.includes(PREFIX)) {
        return 'runtime data may only fill the key of the last word (`scope.name:${value}`)';
    }
    const words = rest.split('.');
    const bad = words.find((w) => !WORD.test(w));
    if (bad !== undefined) {
        return `"${bad}" is not a lower_snake_case word`;
    }

    // a bare word is only allowed as a scope root container (no key, no role): `channel_settings_modal`
    if (!composed && words.length < 2 && (dash >= 0 || colon >= 0)) {
        return 'a testid needs a scope (`area.name--role`)';
    }
    return null;
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

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- messages and cases quote template-literal syntax */

// The testid grammar is defined once, in @mattermost/types/test_id:
//
//     testid  := path [ ":" KEY ] [ "--" ROLE ]
//     path    := WORD ( "." WORD )*        leading WORDs = scope, last WORD = name
//     WORD    := [a-z][a-z0-9_]*
//
// In a template literal, runtime data may fill the key (`a.b.item:${id}--button`) or, in a component that composes
// its parts from a testId prop, the whole leading path (`${testId}.close--button`). Every branch that can render is
// checked (`?:`, `||`, `??`, the right of `&&`), and so are the arguments of the testid helpers (`part`, `keyed`,
// `withRole`, `pluginSlotTestId`, `pluginSlotPath`).

import {isTestIdProblem, parseTestId, TEST_ID_ROLES, TEST_ID_WORD} from '@mattermost/types/test_id';

import {
    constInit,
    helperName,
    isNothing,
    isPassThroughName,
    isStringLiteral,
    OPTIONS_SCHEMA,
    propKinds,
    stringValue,
    testIdKind,
    testIdValueNode,
    unwrapCasts,
    valueLeaves,
} from './testid-utils.js';

const KEY = '\u0000';
const PREFIX = '\u0001';
const ROLES = new Set(TEST_ID_ROLES);
const MAX_VARIANTS = 32;

/** One message per `TestIdProblem` kind; `problemMessage` falls back for a kind added later. */
export const MESSAGES = {
    dashes_before_role: () => '"--" may only precede the role',
    empty_key: () => 'empty key after ":"',
    key_characters: () => 'a key may not contain "." or ":"',
    data_outside_key: () => 'runtime data may only fill the key of the last word (`scope.name:${value}`)',
    composed_without_dot: () => 'a composed testid continues its prefix with "." (`${testId}.part--role`)',
    unknown_role: (p) => `unknown role "--${p.role}"; use one of ${TEST_ID_ROLES.join(', ')}`,
    word: (p) => `"${p.word}" is not a lower_snake_case word`,
    unscoped: () => 'a testid needs a scope (`area.name--role`)',
};

export function problemMessage(p) {
    const message = MESSAGES[p.problem];
    return message ? message(p) : `breaks the testid grammar (${p.problem})`;
}

const PATH_ONLY = 'a testId prop is the path only; the component appends "--<role>"';

/**
 * Checks a testid written as literal text, where KEY marks runtime data after ":" and PREFIX marks a leading
 * composed path. Returns an error message, or null when it follows the grammar.
 */
export function grammarError(text, {withRole = true} = {}) {
    if (!withRole && text.includes('--')) {
        return PATH_ONLY;
    }
    const p = parseTestId(text, {key: KEY, prefix: PREFIX});
    return isTestIdProblem(p) ? problemMessage(p) : null;
}

const show = (text) => JSON.stringify(text.replaceAll(KEY, '${…}').replaceAll(PREFIX, '${…}'));

/**
 * The texts an expression can produce inside a testid, with runtime data marked: string literals, nested templates,
 * the branches of `?:` / `||` / `??` / `&&` (an `undefined` branch renders nothing) and same-file consts expand to
 * every alternative; anything else is runtime data (PREFIX at the start, KEY elsewhere). `badPrefixes` collects
 * leading expressions that don't come from a testid prop or scope.
 */
function expressionTexts(context, node, atStart, badPrefixes, depth = 0) {
    const expr = unwrapCasts(node);
    if (isStringLiteral(expr)) {
        return [stringValue(expr)];
    }
    if (depth < 4) {
        let branches = null;
        if (expr.type === 'ConditionalExpression') {
            branches = [expr.consequent, expr.alternate];
        } else if (expr.type === 'LogicalExpression') {
            branches = expr.operator === '&&' ? [expr.right] : [expr.left, expr.right];
        }
        branches = branches && branches.map(unwrapCasts).filter((b) => !isNothing(b));
        if (branches && branches.length) {
            return branches.flatMap((b) => expressionTexts(context, b, atStart, badPrefixes, depth + 1)).slice(0, MAX_VARIANTS);
        }
        if (expr.type === 'TemplateLiteral') {
            return templateTexts(context, expr, atStart, badPrefixes, depth + 1);
        }
        const init = constInit(context, expr);
        if (init && ['Literal', 'TemplateLiteral', 'ConditionalExpression', 'LogicalExpression'].includes(unwrapCasts(init).type)) {
            return expressionTexts(context, init, atStart, badPrefixes, depth + 1);
        }
    }
    if (atStart && !isPassThroughName(expr)) {
        badPrefixes.push(expr);
    }
    return [atStart ? PREFIX : KEY];
}

function templateTexts(context, node, atStart, badPrefixes, depth = 0) {
    let texts = [''];
    node.quasis.forEach((q, i) => {
        const quasi = q.value.cooked ?? q.value.raw;
        texts = texts.map((t) => t + quasi);
        if (i < node.expressions.length) {
            const start = atStart && texts.every((t) => t === '');
            const alternatives = expressionTexts(context, node.expressions[i], start, badPrefixes, depth);
            const next = [];
            for (const t of texts) {
                for (const a of alternatives) {
                    if (next.length < MAX_VARIANTS) {
                        next.push(t + a);
                    }
                }
            }
            texts = next;
        }
    });
    return texts;
}

function isStringConcat(node) {
    if (node.type !== 'BinaryExpression' || node.operator !== '+') {
        return false;
    }
    const stringy = (n) => isStringLiteral(n) || n.type === 'TemplateLiteral' || isStringConcat(n);
    return stringy(node.left) || stringy(node.right);
}

function isLiteralRole(node) {
    if (isStringLiteral(node)) {
        return ROLES.has(stringValue(node));
    }
    return node.type === 'ConditionalExpression' && isLiteralRole(node.consequent) && isLiteralRole(node.alternate);
}

/** Whether a helper call renders a role (so it can't fill a path-only prop). */
function helperHasRole(name, call) {
    const args = call.arguments;
    switch (name) {
    case 'withRole':
    case 'pluginSlotTestId':
        return true;
    case 'part':
        return args.length >= 4 || (args.length === 3 && args[2].type !== 'ObjectExpression');
    case 'keyed':
        return args.length >= 3;
    default:
        return false;
    }
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Require testids to follow the testid grammar (scope.name:key--role)',
        },
        schema: OPTIONS_SCHEMA,
    },
    create: (context) => {
        const kindOf = propKinds(context.options[0]);

        const checkText = (node, text, withRole) => {
            const error = grammarError(text, {withRole});
            if (error) {
                context.report({node, message: `testid ${show(text)}: ${error}.`});
            }
        };

        const checkLeaf = (leaf, withRole) => {
            if (isStringLiteral(leaf)) {
                checkText(leaf, stringValue(leaf), withRole);
                return;
            }
            if (leaf.type === 'TemplateLiteral') {
                const badPrefixes = [];
                const texts = templateTexts(context, leaf, true, badPrefixes);
                for (const prefix of badPrefixes) {
                    context.report({
                        node: prefix,
                        message: `testid ${show(texts[0])}: a composed testid starts from a testid prop or scope (\`\${testId}.part\`, \`\${testIdScope}.part\`), not \`${context.sourceCode.getText(prefix)}\`; put other runtime data in the key.`,
                    });
                }
                const seen = new Set();
                for (const text of texts) {
                    const error = grammarError(text, {withRole});
                    if (error && !seen.has(error)) {
                        seen.add(error);
                        context.report({node: leaf, message: `testid ${show(text)}: ${error}.`});
                    }
                }
                return;
            }
            if (isStringConcat(leaf)) {
                context.report({node: leaf, message: 'testid built with "+": write it as a template literal (`scope.name:${key}--role`) or with part()/keyed().'});
                return;
            }
            if (leaf.type === 'CallExpression') {
                const name = helperName(context, leaf);
                if (name && !withRole && helperHasRole(name, leaf)) {
                    context.report({node: leaf, message: `${name}(): ${PATH_ONLY}.`});
                }
                return;
            }
            if (leaf.type === 'Identifier' && constInit(context, leaf)) {
                for (const text of new Set(expressionTexts(context, leaf, true, []))) {
                    const error = grammarError(text, {withRole});
                    if (error) {
                        context.report({node: leaf, message: `testid ${show(text)} (from const ${leaf.name}): ${error}.`});
                        break;
                    }
                }
            }
        };

        const checkTarget = (node) => {
            const kind = testIdKind(node, kindOf);
            if (!kind) {
                return;
            }
            const value = testIdValueNode(node);
            if (!value) {
                return;
            }
            for (const leaf of valueLeaves(value)) {
                checkLeaf(leaf, kind === 'full');
            }
        };

        const checkPathArg = (name, call, arg) => {
            if (!arg || !isStringLiteral(arg)) {
                context.report({node: arg ?? call, message: `${name}(): write the path as a string literal ('menu.item'), so the scanner and this rule can read it.`});
                return;
            }
            const path = stringValue(arg);
            const bad = path.split('.').find((w) => !TEST_ID_WORD.test(w));
            if (bad !== undefined) {
                context.report({node: arg, message: `${name}(): path ${JSON.stringify(path)}: "${bad}" is not a lower_snake_case word.`});
            }
        };

        const checkRoleArg = (name, arg) => {
            if (arg && !isLiteralRole(arg)) {
                const text = isStringLiteral(arg) ? `unknown role ${JSON.stringify(stringValue(arg))}; use one of ${TEST_ID_ROLES.join(', ')}` : 'write the role as a string literal';
                context.report({node: arg, message: `${name}(): ${text}.`});
            }
        };

        const checkKeyArg = (name, arg) => {
            if (arg && (isStringLiteral(arg) || (arg.type === 'Literal' && typeof arg.value === 'number'))) {
                context.report({node: arg, message: `${name}(): the key is a literal. Keys hold runtime data (an id, a name); a fixed element gets its own word in the path.`});
            }
        };

        const checkHelperCall = (call) => {
            const name = helperName(context, call);
            if (!name) {
                return;
            }
            const args = call.arguments;
            switch (name) {
            case 'part': {
                checkPathArg(name, call, args[1]);
                const third = args[2];
                if (third && third.type === 'ObjectExpression') {
                    const key = third.properties.find((p) => p.type === 'Property' && !p.computed && p.key.type === 'Identifier' && p.key.name === 'key');
                    checkKeyArg(name, key && key.value);
                    checkRoleArg(name, args[3]);
                } else {
                    checkRoleArg(name, third);
                }
                break;
            }
            case 'keyed':
                checkKeyArg(name, args[1]);
                checkRoleArg(name, args[2]);
                break;
            case 'withRole':
                checkRoleArg(name, args[1]);
                break;
            default: // pluginSlotTestId, pluginSlotPath
                if (args[0] && !isStringLiteral(args[0])) {
                    context.report({node: args[0], message: `${name}(): write the slot as a string literal, so the scanner can expand it from PLUGIN_SLOT_TEST_IDS.`});
                }
            }
        };

        return {
            JSXAttribute: checkTarget,
            Property: checkTarget,
            CallExpression: checkHelperCall,
        };
    },
};

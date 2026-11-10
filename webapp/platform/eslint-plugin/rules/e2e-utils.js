// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Shared by the e2e spec rules.

export function isStringLiteral(node) {
    return Boolean(node) && ((node.type === 'Literal' && typeof node.value === 'string') || (node.type === 'TemplateLiteral' && node.expressions.length === 0));
}

export function stringValue(node) {
    if (node.type === 'Literal') {
        return node.value;
    }
    return node.quasis[0].value.cooked ?? node.quasis[0].value.raw;
}

function findVariable(scope, name) {
    for (let s = scope; s; s = s.upper) {
        const v = s.set.get(name);
        if (v) {
            return v;
        }
    }
    return null;
}

/** The initializer of the same-file `const` an identifier refers to, or null. */
export function constInit(context, node) {
    if (!node || node.type !== 'Identifier') {
        return null;
    }
    const v = findVariable(context.sourceCode.getScope(node), node.name);
    const def = v && v.defs.length === 1 ? v.defs[0] : null;
    if (!def || def.type !== 'Variable' || def.parent.kind !== 'const' || def.node.id.type !== 'Identifier' || !def.node.init) {
        return null;
    }
    return def.node.init;
}

/** The string an expression is, directly or through a same-file `const` (`const name = 'Save'`), or null. */
export function resolvedString(context, node) {
    if (isStringLiteral(node)) {
        return stringValue(node);
    }
    const init = constInit(context, node);
    return init && isStringLiteral(init) ? stringValue(init) : null;
}

/** The name of a called method or function: `a.b.click()` -> 'click', `settle()` -> 'settle'. */
export function calleeName(call) {
    const c = call.callee;
    if (c.type === 'Identifier') {
        return c.name;
    }
    if (c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier') {
        return c.property.name;
    }
    return null;
}

/** A property of an object-literal argument, by name. */
export function objectProperty(node, name) {
    if (!node || node.type !== 'ObjectExpression') {
        return null;
    }
    return node.properties.find((p) => p.type === 'Property' && !p.computed && ((p.key.type === 'Identifier' && p.key.name === name) || (p.key.type === 'Literal' && p.key.value === name))) ?? null;
}

/** The `expect(...)` call at the start of an assertion chain (`expect(x).not.toHaveText()`), or null. */
export function expectCall(matcherCall) {
    let obj = matcherCall.callee.type === 'MemberExpression' ? matcherCall.callee.object : null;
    while (obj && obj.type === 'MemberExpression') {
        obj = obj.object;
    }
    if (obj && obj.type === 'CallExpression') {
        const c = obj.callee;
        const name = c.type === 'Identifier' ? c.name : null;
        const base = c.type === 'MemberExpression' && c.object.type === 'Identifier' ? c.object.name : null;
        if (name === 'expect' || base === 'expect') {
            return obj;
        }
    }
    return null;
}

/** The statement that holds a node, and the statement after it in the same block (or null). */
export function statementAndNext(node) {
    let stmt = node;
    while (stmt.parent && stmt.parent.type !== 'BlockStatement' && stmt.parent.type !== 'Program' && stmt.parent.type !== 'SwitchCase') {
        stmt = stmt.parent;
        if (stmt.type.endsWith('FunctionExpression') || stmt.type === 'FunctionDeclaration') {
            return {statement: null, next: null, previous: null};
        }
    }
    const body = stmt.parent ? (stmt.parent.body ?? stmt.parent.consequent) : null;
    if (!Array.isArray(body)) {
        return {statement: stmt, next: null, previous: null};
    }
    const i = body.indexOf(stmt);
    return {statement: stmt, next: body[i + 1] ?? null, previous: i > 0 ? body[i - 1] : null};
}

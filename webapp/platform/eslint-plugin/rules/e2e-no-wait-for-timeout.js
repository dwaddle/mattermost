// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Waiting belongs to the framework: `commit()` / `settle(el, act, {wait})` wait for the request an action fires, and
// the matchers retry. A fixed sleep is either too short (flaky) or too long (slow). Sleeps come in several spellings:
// `page.waitForTimeout(n)`, the lib's `pw.wait(n)` / `wait(n)`, and a timer wrapped in a promise
// (`new Promise((r) => setTimeout(r, n))`), in the spec or inside `page.evaluate`.

const MESSAGE = 'No fixed sleeps: use `commit()` or `settle(element, action, {wait: Api.X})` for a request, a retrying matcher for UI state, or `expect.poll(fn, {message})` for server state.';

const LIB = /^@mattermost\/playwright-lib(\/|$)/;

function isTimerCall(node) {
    const c = node.callee;
    if (c.type === 'Identifier') {
        return c.name === 'setTimeout';
    }
    return c.type === 'MemberExpression' && !c.computed && c.property.type === 'Identifier' && c.property.name === 'setTimeout' &&
        c.object.type === 'Identifier' && ['window', 'globalThis', 'self'].includes(c.object.name);
}

function insidePromiseExecutor(node) {
    for (let n = node.parent; n; n = n.parent) {
        if ((n.type === 'ArrowFunctionExpression' || n.type === 'FunctionExpression') && n.parent.type === 'NewExpression' &&
            n.parent.callee.type === 'Identifier' && n.parent.callee.name === 'Promise' && n.parent.arguments[0] === n) {
            return true;
        }
    }
    return false;
}

function importedFromLib(context, id) {
    for (let s = context.sourceCode.getScope(id); s; s = s.upper) {
        const v = s.set.get(id.name);
        if (v) {
            const def = v.defs[0];
            return Boolean(def && def.type === 'ImportBinding' && LIB.test(def.parent.source.value));
        }
    }
    return false;
}

export default {
    meta: {
        type: 'problem',
        docs: {
            description: 'Disallow fixed sleeps (waitForTimeout, pw.wait, setTimeout promises) in e2e code',
        },
        schema: [],
    },
    create: (context) => ({
        CallExpression: (node) => {
            const callee = node.callee;
            if (callee.type === 'MemberExpression' && !callee.computed && callee.property.type === 'Identifier') {
                const method = callee.property.name;
                if (method === 'waitForTimeout' || (method === 'wait' && callee.object.type === 'Identifier' && callee.object.name === 'pw')) {
                    context.report({node, message: MESSAGE});
                    return;
                }
            }
            if (callee.type === 'Identifier' && callee.name === 'wait' && importedFromLib(context, callee)) {
                context.report({node, message: MESSAGE});
                return;
            }
            if (isTimerCall(node) && insidePromiseExecutor(node)) {
                context.report({node, message: `A timer wrapped in a promise is a fixed sleep. ${MESSAGE}`});
            }
        },
    }),
};

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// A click that saves must wait for the save: `await settings.saveButton.commit()` (or `textbox.submit()`, or
// `settle(el, act, {wait})`) waits for the request the element declares and returns its body. A plain `click()` lets
// the next step race the server, and "the modal closed" proves nothing for modals that close before their confirm
// handler runs.
//
// The rule works without type information. It decides which elements save in one of two ways:
// - from the generated page objects (option `generated`, their directory): an element saves when its metadata
//   lists an effect that writes (an `Api` op not named Get…, Search…, List…, View…, Autocomplete…, Check…). Without
//   types the rule can't tell which class a getter belongs to, so it matches getters by name: a name saves when it
//   writes in every class that has it (`sendButton`), or when it writes in some class and starts with a saving verb
//   (`saveButton`; a few `saveButton`s list no effect yet, R1). A name that writes in one class only by accident of
//   naming (`closeButton`, `option`) isn't checked;
// - otherwise, by name: a button whose name starts with a saving verb (`saveButton`, `confirmDeleteButton`,
//   `clickCreateButton()`), see `verbs`.
// It flags `x.saveButton.click()`, `x.saveButton.locator.click()`, `x.clickSaveButton()`, keyed getters
// (`x.removeButton(id).click()`) and Enter in a saving textbox (`x.headerTextbox.press('Enter')`), unless the click is
// inside `settle(…)` / `Promise.all([…waitForResponse…])`, or the next statement asserts the save
// (`toBeSaved()`, `toHaveMessage(Msg.….saved)`). Client-side validation that sends nothing:
// `// eslint-disable-next-line @mattermost/e2e-commit-settles -- client-side validation, no request`.

import fs from 'node:fs';
import path from 'node:path';

import {calleeName, statementAndNext} from './e2e-utils.js';

const READ_OPS = /^(Get|Search|List|View|Autocomplete|Check)/;
const DEFAULT_VERBS = '^(save|confirm|submit|delete|create|apply|send|update|remove|archive|restore|revoke|regenerate|invite)';
const SAVE_ASSERTION = /\.toBeSaved\(|\.toHaveMessage\([^)]*\.saved\b/;

const indexes = new Map();

/** Per getter name, in how many generated classes it appears and in how many it lists a writing effect. */
export function savingElements(dir) {
    if (indexes.has(dir)) {
        return indexes.get(dir);
    }
    const names = new Map();
    let files = [];
    try {
        files = fs.readdirSync(dir).filter((f) => f.endsWith('.ts'));
    } catch {
        indexes.set(dir, null);
        return null;
    }
    for (const file of files) {
        const text = fs.readFileSync(path.join(dir, file), 'utf8');

        // each element: `get name() {` or `name(key: …) {` followed by its driver call and metadata
        const chunks = text.split(/\n {4}(?=(?:get |async )?[a-z]\w*\()/);
        for (const chunk of chunks) {
            const head = chunk.match(/^(?:get )?([a-z]\w*)\(/);
            const effects = chunk.match(/effects: \[([^\]]*)\]/);
            if (!head || !effects || !(/return drivers\.\w+\(/).test(chunk)) {
                continue;
            }
            const ops = effects[1].split(',').map((s) => s.trim().replace(/^Api\./, '')).filter(Boolean);
            const entry = names.get(head[1]) ?? {total: 0, writes: 0};
            entry.total++;
            if (ops.some((op) => !READ_OPS.test(op))) {
                entry.writes++;
            }
            names.set(head[1], entry);
        }
    }
    indexes.set(dir, names);
    return names;
}

function propertyName(node) {
    if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
        return node.property.name;
    }
    if (node.type === 'CallExpression') {
        return propertyName(node.callee);
    }
    return null;
}

/** The element a click acts on, by getter name, or null when the call isn't a click on an element. */
function clickedElement(call) {
    const c = call.callee;
    if (c.type !== 'MemberExpression' || c.computed || c.property.type !== 'Identifier') {
        return null;
    }
    const method = c.property.name;
    if (method === 'click') {
        let target = c.object;
        if (target.type === 'MemberExpression' && !target.computed && target.property.type === 'Identifier' && target.property.name === 'locator') {
            target = target.object;
        }
        return propertyName(target);
    }
    if (method === 'press') {
        const key = call.arguments[0];
        const enter = key && key.type === 'Literal' && key.value === 'Enter';
        let target = c.object;
        if (target.type === 'MemberExpression' && !target.computed && target.property.type === 'Identifier' && target.property.name === 'locator') {
            target = target.object;
        }
        const name = enter ? propertyName(target) : null;
        return name && (/(Textbox|Searchbox)$/).test(name) ? name : null;
    }
    const m = method.match(/^click([A-Z]\w*)$/);
    return m ? m[1][0].toLowerCase() + m[1].slice(1) : null;
}

function waitsElsewhere(call) {
    for (let n = call.parent; n; n = n.parent) {
        if (n.type === 'CallExpression') {
            const name = calleeName(n);
            if (name === 'settle' || name === 'settleAll') {
                return true;
            }
            if (name === 'all' && n.callee.type === 'MemberExpression' && n.callee.object.type === 'Identifier' && n.callee.object.name === 'Promise') {
                return n.arguments.some((a) => a.type === 'ArrayExpression' && a.elements.some((e) => e && e.type === 'CallExpression' && (/^waitFor(Response|Request)$/).test(calleeName(e) ?? '')));
            }
        }
    }
    return false;
}

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Require clicks that save to wait for the save (commit(), submit() or settle())',
        },
        schema: [{
            type: 'object',
            properties: {
                generated: {type: 'string'},
                verbs: {type: 'string'},
            },
            additionalProperties: false,
        }],
    },
    create: (context) => {
        const opts = context.options[0] || {};
        const index = opts.generated ? savingElements(path.resolve(context.cwd ?? process.cwd(), opts.generated)) : null;
        const verbs = new RegExp(opts.verbs || DEFAULT_VERBS);
        const saves = (name) => {
            if (index) {
                const entry = index.get(name);
                return Boolean(entry && entry.writes > 0 && (entry.writes === entry.total || verbs.test(name)));
            }
            return verbs.test(name) && (/Button$/).test(name);
        };
        return {
            CallExpression: (node) => {
                const name = clickedElement(node);
                if (!name || !saves(name) || waitsElsewhere(node)) {
                    return;
                }
                const {next} = statementAndNext(node);
                if (next && SAVE_ASSERTION.test(context.sourceCode.getText(next))) {
                    return;
                }
                const how = (/(Textbox|Searchbox)$/).test(name) ? `\`${name}.submit()\`` : `\`${name}.commit()\``;
                context.report({
                    node,
                    message: `\`${name}\` saves: use ${how} (or \`settle(el, act, {wait: Api.X})\`) so the test waits for the request, or assert \`toBeSaved()\` right after.`,
                });
            },
        };
    },
};

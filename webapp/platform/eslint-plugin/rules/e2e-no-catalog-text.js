// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Specs don't retype the webapp's English: text the UI renders from the i18n catalog is asserted through `Msg`
// (`expect(el).toHaveMessage(Msg.team_settings.membership_tab.confirm.title)`), so a copy change doesn't break tests
// and a reader sees which message is meant. The rule loads the catalog (`webapp/channels/src/i18n/en.json` by default,
// or the `catalog` option) and flags a string literal in a text assertion that equals a message, formatted the way
// the runtime's `formatMessage` does (tags and markdown emphasis dropped). A literal that fills a message with
// placeholders (`'3 members'` for `{count} members`) is reported as a template match. Text the same file typed
// (`fill`, `type`, `post…`, `create…`) is user data and isn't reported.
//
// Checked: `toHaveText`, `toContainText` (exact message only), `toHaveAccessibleName`, `toHaveAccessibleDescription`,
// `toHaveAttribute('title' | 'aria-label' | 'placeholder' | 'alt', text)`, and `expect(await el.text())`-style reads
// compared with `toBe`/`toEqual`. With `locators: true`, also `getByRole(…, {name})`, `filter({hasText})`,
// `getByText`, `getByLabel`, `getByPlaceholder` and `getByTitle` (e2e-no-literal-locators reports those already).

import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {calleeName, expectCall, isStringLiteral, objectProperty, resolvedString, stringValue} from './e2e-utils.js';

const DEFAULT_CATALOG = fileURLToPath(new URL('../../../channels/src/i18n/en.json', import.meta.url));

const TEXT_MATCHERS = new Set(['toHaveText', 'toContainText', 'toHaveAccessibleName', 'toHaveAccessibleDescription']);
const TEXT_ATTRIBUTES = new Set(['title', 'aria-label', 'placeholder', 'alt']);
const TEXT_READS = new Set(['text', 'textContent', 'innerText', 'textIfPresent', 'getAttribute']);
const LOCATOR_TEXT = new Set(['getByText', 'getByLabel', 'getByPlaceholder', 'getByTitle']);
const TYPED = /^(fill|type|pressSequentially|post\w*|create\w*|send\w*|submit|update\w*|patch\w*|insertText)$/;

export function normalize(text) {
    return text.
        replace(/<\/?[a-zA-Z0-9_]+>/g, '').
        replace(/\*\*([^*]+)\*\*/g, '$1').
        replace(/__([^_]+)__/g, '$1').
        replace(/''/g, "'").
        replace(/\s+/g, ' ').
        trim();
}

/** Splits an ICU message into literal text and `{…}` arguments (nested braces included). */
function icuParts(message) {
    const parts = [];
    let text = '';
    for (let i = 0; i < message.length; i++) {
        if (message[i] !== '{') {
            text += message[i];
            continue;
        }
        let depth = 0;
        let j = i;
        for (; j < message.length; j++) {
            if (message[j] === '{') {
                depth++;
            } else if (message[j] === '}' && --depth === 0) {
                break;
            }
        }
        parts.push(text, null);
        text = '';
        i = j;
    }
    parts.push(text);
    return parts;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const catalogs = new Map();

/** {exact: Map<text, ids[]>, templates: [{id, re}]} for a catalog (`{id: {defaultMessage}}` or `{id: message}`). */
export function loadCatalog(messages) {
    const exact = new Map();
    const templates = [];
    for (const [id, entry] of Object.entries(messages)) {
        const message = typeof entry === 'string' ? entry : entry && entry.defaultMessage;
        if (typeof message !== 'string' || !message.trim()) {
            continue;
        }
        if (!message.includes('{')) {
            const text = normalize(message);
            exact.set(text, [...(exact.get(text) ?? []), id]);
            continue;
        }
        const parts = icuParts(message);
        const literal = parts.filter((p) => p !== null).join('');
        if (normalize(literal).length < 6) {
            continue; // `{count}`, `{name}:` match nearly anything
        }
        const source = parts.map((p) => (p === null ? '\uE000' : p)).join('');
        const re = new RegExp(`^${escape(normalize(source)).replace(/\uE000/g, '.+?')}$`);
        templates.push({id, re});
    }
    return {exact, templates};
}

function catalogFor(options, cwd) {
    const files = options.catalog ? [].concat(options.catalog).map((f) => path.resolve(cwd, f)) : [DEFAULT_CATALOG];
    const key = options.messages ? null : files.join('\n');
    if (key && catalogs.has(key)) {
        return catalogs.get(key);
    }
    let messages = options.messages ?? {};
    if (!options.messages) {
        for (const file of files) {
            try {
                messages = {...messages, ...JSON.parse(fs.readFileSync(file, 'utf8'))};
            } catch {
                // a missing catalog (the published package) turns the rule off
            }
        }
    }
    const catalog = loadCatalog(messages);
    if (key) {
        catalogs.set(key, catalog);
    }
    return catalog;
}

const msgRef = (id) => `Msg.${id}`;

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Disallow string literals in e2e text assertions that equal an i18n catalog message; use Msg',
        },
        schema: [{
            type: 'object',
            properties: {
                catalog: {anyOf: [{type: 'string'}, {type: 'array', items: {type: 'string'}}]},
                messages: {type: 'object'},
                locators: {type: 'boolean'},
            },
            additionalProperties: false,
        }],
    },
    create: (context) => {
        const options = context.options[0] || {};
        const catalog = catalogFor(options, context.cwd ?? process.cwd());
        const typed = new Set();
        const candidates = [];

        const consider = (node, {exactOnly = false} = {}) => {
            if (!node) {
                return;
            }
            if (node.type === 'ArrayExpression') {
                node.elements.forEach((e) => consider(e, {exactOnly}));
                return;
            }
            const text = isStringLiteral(node) ? stringValue(node) : resolvedString(context, node);
            if (text !== null && text.trim()) {
                candidates.push({node, text: normalize(text), exactOnly});
            }
        };

        return {
            CallExpression: (node) => {
                const name = calleeName(node);
                if (!name) {
                    return;
                }
                if (TYPED.test(name)) {
                    for (const arg of node.arguments) {
                        if (isStringLiteral(arg)) {
                            typed.add(normalize(stringValue(arg)));
                        } else if (arg.type === 'ObjectExpression') {
                            for (const p of arg.properties) {
                                if (p.type === 'Property' && isStringLiteral(p.value)) {
                                    typed.add(normalize(stringValue(p.value)));
                                }
                            }
                        }
                    }
                    return;
                }
                if (TEXT_MATCHERS.has(name) && expectCall(node)) {
                    consider(node.arguments[0], {exactOnly: name === 'toContainText'});
                    return;
                }
                if (name === 'toHaveAttribute' && expectCall(node) && isStringLiteral(node.arguments[0]) && TEXT_ATTRIBUTES.has(stringValue(node.arguments[0]))) {
                    consider(node.arguments[1]);
                    return;
                }
                if ((name === 'toBe' || name === 'toEqual') && expectCall(node)) {
                    const subject = expectCall(node).arguments[0];
                    const read = subject && subject.type === 'AwaitExpression' && subject.argument.type === 'CallExpression' ? calleeName(subject.argument) : null;
                    if (read && TEXT_READS.has(read)) {
                        consider(node.arguments[0]);
                    }
                    return;
                }
                if (!options.locators) {
                    return;
                }
                if (name === 'getByRole') {
                    consider(objectProperty(node.arguments[1], 'name')?.value);
                } else if (name === 'filter') {
                    consider(objectProperty(node.arguments[0], 'hasText')?.value);
                    consider(objectProperty(node.arguments[0], 'hasNotText')?.value);
                } else if (LOCATOR_TEXT.has(name)) {
                    consider(node.arguments[0]);
                }
            },
            'Program:exit': () => {
                for (const {node, text, exactOnly} of candidates) {
                    if (typed.has(text)) {
                        continue;
                    }
                    const ids = catalog.exact.get(text);
                    if (ids) {
                        const which = ids.length === 1 ? `\`${msgRef(ids[0])}\`` : `one of ${ids.slice(0, 3).map((id) => `\`${msgRef(id)}\``).join(', ')}${ids.length > 3 ? ` (+${ids.length - 3} more)` : ''}`;
                        context.report({node, message: `${JSON.stringify(text)} is catalog text: assert ${which} with \`toHaveMessage\` / \`toContainMessage\` (or \`formatMessage\`).`});
                        continue;
                    }
                    if (exactOnly) {
                        continue;
                    }
                    const template = catalog.templates.find((t) => t.re.test(text));
                    if (template) {
                        context.report({node, message: `${JSON.stringify(text)} fills the catalog message \`${msgRef(template.id)}\`: assert it with \`toHaveMessage(${msgRef(template.id)}, {…})\` and the test's values.`});
                    }
                }
            },
        };
    },
};

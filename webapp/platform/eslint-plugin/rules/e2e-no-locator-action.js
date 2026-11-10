// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Specs act through the drivers of the generated page objects (`composer.sendButton.click()`), not through their raw
// Playwright locator (`composer.sendButton.locator.click()`): the driver is where waiting, error metadata and
// `commit()` live. A raw `Locator` has no `.locator` property, so `x.locator.click()` is always a driver's locator.
//
// Without type information the rule tells the driver from the generated getter's name, which ends in its role
// (`saveButton`, `nameTextbox`, `leaveItem`), and reports only when that driver has the method. Receivers it can't
// place (scopes such as `post`, `row`) are left alone until their drivers get these methods.

/** Getter-name suffix -> driver. */
const DRIVER_BY_SUFFIX = {
    Button: 'button',
    Link: 'button',
    Item: 'button',
    Menuitem: 'button',
    Textbox: 'textbox',
    Searchbox: 'textbox',
    Checkbox: 'checkbox',
    Radio: 'checkbox',
    Tab: 'select',
    Option: 'select',
    Combobox: 'combobox',
    Switch: 'switch',
    Togglebutton: 'switch',
    Text: 'text',
    Alert: 'text',
    Status: 'text',
    Img: 'text',
};

// What each driver offers for each locator action (every driver hovers, presses, focuses and blurs).
const BASE = {hover: 'hover', press: 'press', focus: 'focus', blur: 'blur'};
const METHODS = {
    button: {...BASE, click: 'click'},
    textbox: {...BASE, fill: 'fill', clear: 'clear', type: 'type', pressSequentially: 'type'},
    checkbox: {...BASE, check: 'check', uncheck: 'uncheck', setChecked: 'set'},
    select: {...BASE, click: 'select'},
    combobox: {...BASE},
    switch: {...BASE},
    text: {...BASE},
};

const ACTIONS = new Set(['click', 'dblclick', 'hover', 'press', 'fill', 'focus', 'blur', 'clear', 'check', 'uncheck', 'setChecked', 'pressSequentially', 'type', 'selectOption', 'tap']);

function getterName(node) {
    if (node.type === 'MemberExpression' && !node.computed && node.property.type === 'Identifier') {
        return node.property.name;
    }
    if (node.type === 'CallExpression') {
        return getterName(node.callee);
    }
    return null;
}

export function driverFor(name) {
    const m = name && name.match(/[A-Z][a-z]*$/);
    return m ? DRIVER_BY_SUFFIX[m[0]] ?? null : null;
}

export default {
    meta: {
        type: 'suggestion',
        docs: {
            description: 'Act through the generated drivers (x.click()), not their raw locator (x.locator.click())',
        },
        schema: [],
    },
    create: (context) => ({
        CallExpression: (node) => {
            const callee = node.callee;
            if (callee.type !== 'MemberExpression' || callee.computed || callee.property.type !== 'Identifier' || !ACTIONS.has(callee.property.name)) {
                return;
            }
            const loc = callee.object;
            if (loc.type !== 'MemberExpression' || loc.computed || loc.property.type !== 'Identifier' || loc.property.name !== 'locator') {
                return;
            }
            const getter = getterName(loc.object);
            const driver = driverFor(getter);
            const method = driver && METHODS[driver][callee.property.name];
            if (!method) {
                return;
            }
            const receiver = context.sourceCode.getText(loc.object);
            context.report({
                node,
                message: `Act through the driver: \`${receiver}.${method}(…)\`, not \`${receiver}.locator.${callee.property.name}(…)\`.`,
            });
        },
    }),
};

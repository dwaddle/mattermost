// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {TestIdRole} from '@mattermost/types/test_id';

/**
 * What the scanner and the generator know about each testid role, in one table: every other role table is derived
 * from it, and the types make a missing role, or a form verb its driver doesn't have, fail to compile.
 */

/** The runtime's drivers (`drivers.<name>` in `@mattermost/playwright-lib`'s aria module). */
export type DriverName = 'container' | 'button' | 'link' | 'menuitem' | 'menuitemcheckbox' | 'menuitemradio' | 'togglebutton' | 'switch' |
    'checkbox' | 'radio' | 'radiogroup' | 'textbox' | 'searchbox' | 'tab' | 'combobox' | 'listbox' | 'option' | 'text';

/** The method each driver sets a form field's value with. */
type FillVerbs = {togglebutton: 'setPressed'; switch: 'set'; checkbox: 'set'; textbox: 'fill'; searchbox: 'fill'; combobox: 'choose'; radiogroup: 'choose'};

/** The method each driver reads a form field's value with. */
type ReadVerbs = {togglebutton: 'isPressed'; switch: 'isOn'; checkbox: 'isChecked'; textbox: 'value'; searchbox: 'value'};

type Row<D extends DriverName> = {

    /** The driver its elements get. */
    driver: D;

    /** The role in member names (`saveButton`, `clickSaveButton`). */
    word: string;

    /** A form field's value type: the scope's other fields of a value role make a form (`fill(values)`). */
    value?: 'string' | 'number' | 'boolean';
    fill?: D extends keyof FillVerbs ? FillVerbs[D] : never;
    read?: D extends keyof ReadVerbs ? ReadVerbs[D] : never;

    /** Clicking it is its action: a `click…()` method, returning what it opens. */
    click?: true;

    /** Something a user operates (a part of a library component with this role handles input). */
    interactive?: true;
};

type AnyRow = {[D in DriverName]: Row<D>}[DriverName];

export const ROLE_TABLE: {readonly [R in TestIdRole]: AnyRow} = {
    button: {driver: 'button', word: 'Button', click: true, interactive: true},
    link: {driver: 'link', word: 'Link', click: true, interactive: true},
    textbox: {driver: 'textbox', word: 'Textbox', value: 'string', fill: 'fill', read: 'value', interactive: true},
    searchbox: {driver: 'searchbox', word: 'Searchbox', value: 'string', fill: 'fill', read: 'value', interactive: true},
    checkbox: {driver: 'checkbox', word: 'Checkbox', value: 'boolean', fill: 'set', read: 'isChecked', interactive: true},
    switch: {driver: 'switch', word: 'Switch', value: 'boolean', fill: 'set', read: 'isOn', interactive: true},
    radio: {driver: 'radio', word: 'Radio', interactive: true},
    radiogroup: {driver: 'radiogroup', word: 'RadioGroup', value: 'string', fill: 'choose'},
    combobox: {driver: 'combobox', word: 'Combobox', value: 'string', fill: 'choose', interactive: true},
    listbox: {driver: 'listbox', word: 'Listbox'},
    option: {driver: 'option', word: 'Option', interactive: true},
    tab: {driver: 'tab', word: 'Tab', interactive: true},
    tablist: {driver: 'text', word: 'TabList'},
    tabpanel: {driver: 'text', word: 'TabPanel'},
    menu: {driver: 'text', word: 'Menu'},
    menuitem: {driver: 'menuitem', word: 'MenuItem', click: true, interactive: true},
    menuitemcheckbox: {driver: 'menuitemcheckbox', word: 'MenuItemCheckbox', click: true, interactive: true},
    menuitemradio: {driver: 'menuitemradio', word: 'MenuItemRadio', click: true, interactive: true},
    dialog: {driver: 'text', word: 'Dialog'},
    alertdialog: {driver: 'text', word: 'AlertDialog'},

    // a slider has a number value but no driver to set it yet: its form field isn't filled
    slider: {driver: 'text', word: 'Slider', value: 'number', interactive: true},
    spinbutton: {driver: 'textbox', word: 'SpinButton', value: 'number', fill: 'fill', interactive: true},
    togglebutton: {driver: 'togglebutton', word: 'ToggleButton', value: 'boolean', fill: 'setPressed', read: 'isPressed', interactive: true},
    text: {driver: 'text', word: 'Text'},
    img: {driver: 'text', word: 'Img'},
    list: {driver: 'text', word: 'List'},
    listitem: {driver: 'text', word: 'ListItem'},
    row: {driver: 'text', word: 'Row'},
    grid: {driver: 'text', word: 'Grid'},
    gridcell: {driver: 'text', word: 'GridCell'},
    status: {driver: 'text', word: 'Status'},
    alert: {driver: 'text', word: 'Alert'},
    tooltip: {driver: 'text', word: 'Tooltip'},
    region: {driver: 'text', word: 'Region'},
    separator: {driver: 'text', word: 'Separator'},
};

/** The table's row for a role (a testid without a role is a container). */
export function roleRow(role: TestIdRole): AnyRow {
    return ROLE_TABLE[role];
}

/** The driver an element of this role gets. */
export function driverFor(role: TestIdRole | null): DriverName {
    return role ? ROLE_TABLE[role].driver : 'container';
}

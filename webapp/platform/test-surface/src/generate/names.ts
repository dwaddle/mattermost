// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/** `join_leave_messages` -> `joinLeaveMessages` */
export function camel(s: string): string {
    const p = pascal(s);
    return p.charAt(0).toLowerCase() + p.slice(1);
}

/** `join_leave_messages` -> `JoinLeaveMessages`; `access-rules` -> `AccessRules`; `9am` -> `N9am` */
export function pascal(s: string): string {
    const out = s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    return (/^[0-9]/).test(out) ? 'N' + out : out;
}

const ROLE_WORDS: Record<string, string> = {
    button: 'Button',
    link: 'Link',
    textbox: 'Textbox',
    searchbox: 'Searchbox',
    checkbox: 'Checkbox',
    switch: 'Switch',
    radio: 'Radio',
    radiogroup: 'RadioGroup',
    combobox: 'Combobox',
    listbox: 'Listbox',
    option: 'Option',
    tab: 'Tab',
    tablist: 'TabList',
    tabpanel: 'TabPanel',
    menu: 'Menu',
    menuitem: 'MenuItem',
    menuitemcheckbox: 'MenuItemCheckbox',
    menuitemradio: 'MenuItemRadio',
    dialog: 'Dialog',
    alertdialog: 'AlertDialog',
    slider: 'Slider',
    spinbutton: 'SpinButton',
    togglebutton: 'ToggleButton',
    text: 'Text',
    img: 'Img',
    list: 'List',
    listitem: 'ListItem',
    row: 'Row',
    grid: 'Grid',
    gridcell: 'GridCell',
    status: 'Status',
    alert: 'Alert',
    tooltip: 'Tooltip',
    region: 'Region',
    separator: 'Separator',
};

export function roleWord(role: string | null): string {
    return role ? ROLE_WORDS[role] ?? pascal(role) : '';
}

/** Roles that have a driver; everything else gets the read-only text driver. */
const DRIVER_FOR: Record<string, string> = {
    button: 'button',
    link: 'link',
    menuitem: 'menuitem',
    menuitemcheckbox: 'menuitemcheckbox',
    menuitemradio: 'menuitemradio',
    togglebutton: 'togglebutton',
    switch: 'switch',
    checkbox: 'checkbox',
    radio: 'radio',
    textbox: 'textbox',
    searchbox: 'searchbox',
    spinbutton: 'textbox',
    tab: 'tab',
    option: 'option',
    combobox: 'combobox',
    listbox: 'listbox',
};

export function driverFor(role: string | null): string {
    if (!role) {
        return 'container';
    }
    return DRIVER_FOR[role] ?? 'text';
}

const RESERVED = new Set(['page', 'scope', 'root', 'container', 'constructor', 'byTestId', 'byTestIdPattern', 'keysOf', 'fill', 'read']);

/** A member name that can't clash with the Scope base class. */
export function memberName(name: string): string {
    return RESERVED.has(name) ? `${name}Element` : name;
}

export const isIdentifier = (s: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/).test(s);

/** A property key, quoted when it isn't an identifier. */
export function propKey(s: string): string {
    return isIdentifier(s) || (/^(0|[1-9][0-9]*)$/).test(s) ? s : JSON.stringify(s);
}

/** `MFAPage` -> `mfaPage`, `ChannelsPage` -> `channelsPage` */
export function pageGetter(cls: string): string {
    const lead = (/^[A-Z]+(?=[A-Z][a-z]|$)/).exec(cls)?.[0] ?? cls.charAt(0);
    return lead.toLowerCase() + cls.slice(lead.length);
}

/**
 * The template around its key: a composite key (`group:{key}-{key}`, a nested group's `<parent>-<child>`) is one key,
 * from the first placeholder to the last, that the caller passes whole.
 */
export function splitAtKey(template: string): [string, string] {
    const first = template.indexOf('{key}');
    const last = template.lastIndexOf('{key}');
    return [template.slice(0, first), template.slice(last + '{key}'.length)];
}

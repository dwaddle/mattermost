// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// A System Console setting renders as the row `admin.setting:<key>`, where the key is the setting's id with `.` and
// `:` turned into `_`. Its controls are parts inside the row: `value--textbox`, `value--spinbutton` (number inputs),
// `value--combobox` (dropdowns), `true--radio` / `false--radio`, `label--text` and `help--text`.

export function settingTestKey(id) {
    return id.replace(/[.:]/g, '_').replace(/-{2,}/g, '-');
}

/** The setting's row. */
export function settingRow(id, options) {
    return cy.findByTestId(`admin.setting:${settingTestKey(id)}`, options);
}

/** A part of the setting's row, e.g. settingPart('ServiceSettings.SiteURL', 'value--textbox'). */
export function settingPart(id, part, options) {
    return settingRow(id, options).findByTestId(`admin.setting.${part}`, options);
}

/**
 * A CSS selector for the setting's row, or a part of it, for `cy.get(...)`. Use it where the row itself may be
 * absent, e.g. `cy.get(settingSelector(id, 'value--textbox')).should('not.exist')`.
 */
export function settingSelector(id, part) {
    const row = `[data-testid="admin.setting:${settingTestKey(id)}"]`;
    return part ? `${row} [data-testid="admin.setting.${part}"]` : row;
}

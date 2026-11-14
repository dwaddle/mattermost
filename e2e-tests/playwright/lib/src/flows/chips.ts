// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import type {Driver} from '@/aria/drivers';

/**
 * Removes a removable chip (a Compass `Chip` with `onRemove`) by clicking its remove icon. The chip itself is the
 * button (give its testid `--button`); the icon inside it is the library's, hidden from the accessibility tree, and
 * has no testid of its own: `data-chip-remove` is its stable marker.
 */
export async function removeChip(chip: Driver): Promise<void> {
    await chip.locator.locator('[data-chip-remove]').click();
}

/**
 * The chips of a multiselect combobox (a Compass `Combobox` with `multiple`) inside `field`: the library renders them
 * without testids, so `data-chip` is their stable marker. Assert their text with `toHaveText([...])`.
 */
export function comboboxChips(field: {locator: Locator}): Locator {
    return field.locator.locator('[data-chip]');
}

/** Removes the chip labelled `label` from a multiselect combobox inside `field`, through its remove icon. */
export async function removeComboboxChip(field: {locator: Locator}, label: string): Promise<void> {
    await comboboxChips(field).filter({hasText: label}).locator('[data-chip-remove]').click();
}

/** The swatches shown in a multiselect combobox's field (on its chips) or a single one's closed field, whichever it renders. */
export function comboboxSwatches(field: {locator: Locator}): Locator {
    return field.locator.locator('[data-testid$="swatch"]');
}

/** A chip's swatch (the chip carries a copy of its option row's visual). */
export function chipSwatch(chip: Locator): Locator {
    return chip.locator('[data-testid$="swatch"]');
}

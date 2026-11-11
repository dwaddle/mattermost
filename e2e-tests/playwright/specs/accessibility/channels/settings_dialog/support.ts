// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {generated, type App} from '@mattermost/playwright-lib';

/** A CSS selector for a generated element, for axe's `include()` (which takes selectors, not locators). */
export function selectorOf(driver: {meta: {testId: string}}) {
    return `[data-testid="${driver.meta.testId}"]`;
}

/** The expanded settings section, as an axe `include()` selector (the open section is a `<section>`). */
export const EXPANDED_SECTION = 'section[data-testid^="settings.section:"]';

/** The open settings section: the one showing a Cancel button. */
export function expandedSection(app: App): Locator {
    // `has` takes a locator relative to each section, so build it from the testid (a generated locator starts at `:root`)
    const cancel = new generated.SettingsSectionItem(app.page, 'settings.section').cancelButton;
    return app.settings.sectionItems.filter({has: app.page.getByTestId(cancel.meta.testId)});
}

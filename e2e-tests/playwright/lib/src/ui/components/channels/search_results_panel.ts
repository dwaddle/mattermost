// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator, Page} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * The right-hand-side panel that renders search results, saved messages, and
 * recent mentions. All three share the `#searchContainer` region.
 */
export default class SearchResultsPanel {
    readonly container: Locator;

    constructor(container: Locator) {
        this.container = container;
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    /**
     * All result items currently shown in the panel.
     */
    getResultItems() {
        return this.container.getByTestId(/^search\.results\.(post|file):/);
    }

    /**
     * A single result item that contains the given text.
     */
    getResultByText(text: string) {
        return this.getResultItems().filter({hasText: text});
    }

    /**
     * The button that pops the panel out into its own window.
     */
    getPopoutButton() {
        return this.container.getByRole('button', {name: 'Open in new window'});
    }

    async toContainText(text: string) {
        await expect(this.container).toContainText(text);
    }

    /**
     * Clicks the "Jump" link on the result item that contains the given text.
     */
    async jumpToResultWithText(text: string) {
        await this.getResultByText(text).first().getByRole('link', {name: 'Jump'}).click();
    }
}

/**
 * The panel on a page (the main window or a popout). Its elements carry no testids yet, so this is the one hand-written
 * page object left for the channels page; the generated `app.search` covers the panel's header and results.
 */
export function searchResultsPanel(page: Page) {
    return new SearchResultsPanel(page.locator('#searchContainer'));
}

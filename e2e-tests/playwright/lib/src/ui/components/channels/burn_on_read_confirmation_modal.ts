// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class BurnOnReadConfirmationModal {
    readonly container: Locator;
    readonly title: Locator;
    readonly message: Locator;
    readonly deleteButton: Locator;
    readonly cancelButton: Locator;
    readonly dontShowAgainCheckbox: Locator;

    constructor(container: Locator) {
        this.container = container;

        // Modal elements
        this.title = container.getByRole('heading').first();
        this.message = container.locator('#confirmModalBody');

        // Action buttons - use flexible selectors
        this.deleteButton = container.getByTestId('burn_on_read_confirmation_modal.confirm--button');
        this.cancelButton = container.getByTestId('burn_on_read_confirmation_modal.cancel--button');

        // Checkbox for "don't show again" preference
        this.dontShowAgainCheckbox = container.getByTestId('burn_on_read_confirmation_modal.dont_show_again--checkbox');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async toBeHidden() {
        await expect(this.container).not.toBeVisible();
    }

    /**
     * Confirm deletion without checking "don't show again"
     */
    async confirm() {
        await this.deleteButton.click();
        await this.toBeHidden();
    }

    /**
     * Confirm deletion and check "don't show again"
     */
    async confirmWithDontShowAgain() {
        await this.dontShowAgainCheckbox.check();
        await this.deleteButton.click();
        await this.toBeHidden();
    }

    /**
     * Cancel the deletion
     */
    async cancel() {
        await this.cancelButton.click();
        await this.toBeHidden();
    }

    /**
     * Get the modal title text
     */
    async getTitleText(): Promise<string> {
        return (await this.title.textContent()) || '';
    }

    /**
     * Get the modal message text
     */
    async getMessageText(): Promise<string> {
        return (await this.message.textContent()) || '';
    }

    /**
     * Check if "don't show again" checkbox is present
     */
    async hasDontShowAgainOption(): Promise<boolean> {
        return this.dontShowAgainCheckbox.isVisible();
    }

    /**
     * Check if "don't show again" is already checked
     */
    async isDontShowAgainChecked(): Promise<boolean> {
        return this.dontShowAgainCheckbox.isChecked();
    }
}

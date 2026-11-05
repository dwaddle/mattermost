// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import path from 'node:path';

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

import {PostCreate} from '@/ui/generated/shared';
import {duration} from '@/util';
import {assetPath} from '@/file';
import {waitUntil} from '@/test_action';

export default class ChannelsPostCreate {
    readonly container: Locator;
    readonly input;

    readonly attachmentButton;
    readonly sendMessageButton;
    readonly filePreview;
    readonly previewArea;

    // Burn-on-Read elements
    readonly burnOnReadButton;

    /** Generated from the webapp's testids; this class keeps the flows specs already use. */
    readonly generated: PostCreate;

    constructor(container: Locator, isRHS = false) {
        this.container = container;
        this.generated = new PostCreate(container.page(), isRHS ? 'rhs.post_create' : 'center.post_create', container);

        this.input = this.generated.messageTextbox.locator;

        this.attachmentButton = container.locator('#fileUploadButton');
        this.sendMessageButton = this.generated.sendButton.locator;
        this.filePreview = container.getByTestId(/\.file_previews$/);
        this.previewArea = container.locator('.textbox-preview-area');

        // Burn-on-Read elements
        // Use a flexible locator that matches the aria-label pattern
        this.burnOnReadButton = container.getByRole('button', {name: /Burn-on-read/i});
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();

        await this.input.waitFor();
        await expect(this.input).toBeVisible();
    }

    /**
     * It just writes the message in the input and doesn't send it
     * @param message : Message to be written in the input
     */
    async writeMessage(message: string) {
        await this.input.waitFor();
        await expect(this.input).toBeVisible();

        await this.input.fill(message);
    }

    /**
     * Returns the value of the message input
     */
    async getInputValue() {
        await expect(this.input).toBeVisible();
        return this.input.inputValue();
    }

    /**
     * Sends the message already written in the input
     */
    async sendMessage() {
        await expect(this.input).toBeVisible();
        const messageInputValue = await this.getInputValue();
        expect(messageInputValue).not.toBe('');

        await expect(this.sendMessageButton).toBeVisible();
        await expect(this.sendMessageButton).toBeEnabled();

        await this.sendMessageButton.click();
    }

    /**
     * Composes and sends a message
     */
    async postMessage(message: string, files?: string[]) {
        await this.writeMessage(message);

        const page = this.container.page();
        const uploadResponsePromise =
            files && files.length > 0
                ? page.waitForResponse(
                      (r) =>
                          r.url().includes('/api/v4/files') &&
                          r.request().method() === 'POST' &&
                          r.status() >= 200 &&
                          r.status() < 300,
                      {timeout: 60000},
                  )
                : null;

        if (files) {
            const filePaths = files.map((file) => path.join(assetPath, file));
            await expect(this.attachmentButton).toBeVisible();
            const fileInput = this.container.locator('input[type="file"]');
            await expect(fileInput).toBeAttached();
            await fileInput.setInputFiles(filePaths);
            // Wait for the upload API first so the 10s preview asserts run after
            // the file exists, instead of racing the default expect timeout.
            if (uploadResponsePromise) {
                await uploadResponsePromise;
            }
            await this.waitUntilFilePreviewContains(files);
        }

        await this.sendMessage();
    }

    async waitUntilFilePreviewContains(files: string[], timeout = duration.ten_sec) {
        await waitUntil(
            async () => {
                const previews = this.filePreview.getByTestId(/\.file_previews\.file:/);
                const details = this.filePreview.getByTestId(/\.file_previews\.file\.details$/);

                const [previewsCount, detailsCount] = await Promise.all([previews.count(), details.count()]);
                if (previewsCount !== files.length || detailsCount !== files.length) {
                    return false;
                }

                const previewTexts = await previews.allTextContents();
                return files.every((file) => previewTexts.some((text) => text.includes(file)));
            },
            {timeout},
        );
    }

    /**
     * Toggle the burn-on-read feature for the message
     */
    async toggleBurnOnRead() {
        await expect(this.burnOnReadButton).toBeAttached();
        await expect(this.burnOnReadButton).toBeEnabled();
        await this.burnOnReadButton.click();
    }
}

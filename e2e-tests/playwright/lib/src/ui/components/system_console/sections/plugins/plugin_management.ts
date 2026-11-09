// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';
import {pluginTestKey} from '@mattermost/types/test_id';

import {settingTestKey} from '@/aria';
import {duration} from '@/util';

/**
 * System Console -> Plugins -> Plugin Management
 */
export default class PluginManagement {
    readonly container: Locator;

    readonly pluginFileInput: Locator;
    readonly uploadButton: Locator;
    readonly saveButton: Locator;

    readonly restrictUnauthenticatedWebappPluginsTrue: Locator;
    readonly restrictUnauthenticatedWebappPluginsFalse: Locator;
    readonly restrictUnauthenticatedWebappPluginsHelpText: Locator;

    constructor(container: Locator) {
        this.container = container;

        // Hidden; the upload button opens it, and choosing a file starts the upload.
        this.pluginFileInput = container.getByTestId('admin.plugins.upload_file');
        this.uploadButton = container.getByTestId('admin.plugins.upload--button');
        this.saveButton = container.getByRole('button', {name: 'Save'});

        const restrictUnauthenticatedWebappPlugins = container.getByTestId(
            `admin.setting:${settingTestKey('restrictUnauthenticatedWebappPlugins')}`,
        );
        this.restrictUnauthenticatedWebappPluginsTrue =
            restrictUnauthenticatedWebappPlugins.getByTestId('admin.setting.true--radio');
        this.restrictUnauthenticatedWebappPluginsFalse =
            restrictUnauthenticatedWebappPlugins.getByTestId('admin.setting.false--radio');
        this.restrictUnauthenticatedWebappPluginsHelpText =
            restrictUnauthenticatedWebappPlugins.getByTestId('admin.setting.help--text');
    }

    async toBeVisible() {
        await expect(this.container.getByText('Plugin Management', {exact: true})).toBeVisible();
    }

    async save() {
        await expect(this.saveButton).toBeEnabled();
        await this.saveButton.click();
        await expect(this.saveButton).toBeDisabled();
    }

    /**
     * Locates an installed plugin's row by its manifest id.
     */
    pluginRow(pluginId: string): Locator {
        return this.container.getByTestId(`admin.plugins.plugin:${pluginTestKey(pluginId)}`);
    }

    async notToHavePlugin(pluginId: string) {
        await expect(this.pluginRow(pluginId)).not.toBeVisible();
    }

    /**
     * Removes the given plugin via its "Remove" control and confirms the "Remove plugin?" dialog.
     */
    async removePlugin(pluginId: string) {
        await this.pluginRow(pluginId).getByTestId('admin.plugins.plugin.remove--button').click();

        const page = this.container.page();
        const confirmModal = page.getByTestId('admin.plugins.remove_modal');
        await expect(confirmModal).toBeVisible();
        await page.getByTestId('admin.plugins.remove_modal.confirm--button').click();
        await expect(confirmModal).not.toBeVisible();
    }

    /**
     * Uploads a plugin bundle (.tar.gz) through the file input; choosing the file starts the upload.
     * If a plugin with the same id is already installed, confirms the overwrite review dialog that
     * appears instead of failing.
     */
    async uploadPlugin(filePath: string) {
        await expect(this.uploadButton).toBeEnabled();
        await this.pluginFileInput.setInputFiles(filePath);

        const page = this.container.page();
        const overwriteDialog = page.getByTestId('admin.plugins.overwrite_modal');
        const sawOverwriteDialog = await overwriteDialog
            .waitFor({state: 'visible', timeout: duration.ten_sec})
            .then(() => true)
            .catch(() => false);
        if (sawOverwriteDialog) {
            await page.getByTestId('admin.plugins.overwrite_modal.confirm--button').click();
            await expect(overwriteDialog).not.toBeVisible();
        }
    }

    /**
     * Clicks "Enable" on an already-installed plugin's row. Uploading a plugin does not
     * auto-enable it — this is always a separate step.
     */
    async enablePlugin(pluginId: string) {
        await this.pluginRow(pluginId).getByTestId('admin.plugins.plugin.enable--button').click();
    }

    async toBeEnabled(pluginId: string) {
        await expect(this.pluginRow(pluginId).getByTestId('admin.plugins.plugin.disable--button')).toBeVisible();
    }
}

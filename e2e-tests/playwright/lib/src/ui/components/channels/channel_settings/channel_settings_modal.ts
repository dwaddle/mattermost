// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

import InfoSettings from './info_settings';

import {ChannelSettingsModal as GeneratedChannelSettingsModal} from '@/ui/generated/channel_settings_modal';

export default class ChannelSettingsModal {
    readonly container: Locator;

    readonly closeButton;
    readonly saveButton;

    readonly infoTab;

    readonly infoSettings;

    /** Generated from the webapp's testids; this class keeps the flows specs already use. */
    readonly generated: GeneratedChannelSettingsModal;

    constructor(container: Locator) {
        this.container = container;
        this.generated = new GeneratedChannelSettingsModal(
            container.page(),
            'channel_settings_modal',
            container.page().locator(':root'),
        );

        this.closeButton = this.generated.closeButton.locator;
        this.saveButton = this.generated.savePanel.saveButton.locator;

        this.infoTab = this.generated.tabs.infoTab.locator;

        this.infoSettings = new InfoSettings(this.generated.info.locator);
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async close() {
        await this.closeButton.click();

        // The modal uses a two-step close when there are unsaved changes:
        // the first click warns the user (sets hasBeenWarned=true) but keeps the modal open;
        // only the second click actually closes it. Click again if needed.
        try {
            await expect(this.container).not.toBeVisible({timeout: 1000});
        } catch {
            await this.closeButton.click();
            await expect(this.container).not.toBeVisible({timeout: 10000});
        }
    }

    async save() {
        await expect(this.saveButton).toBeVisible();
        await this.saveButton.click();
    }

    async openInfoTab(): Promise<InfoSettings> {
        await expect(this.infoTab).toBeVisible();
        await this.infoTab.click();

        await this.infoSettings.toBeVisible();

        return this.infoSettings;
    }
}

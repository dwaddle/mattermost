// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

export default class ScheduleMessageMenu {
    readonly container: Locator;

    readonly tomorrowMenuItem;
    readonly mondayMenuItem;
    readonly nextMondayMenuItem;
    readonly recentlyUsedCustomTimeMenuItem;
    readonly customTimeMenuItem;

    // The preset time options offered, which vary with the current weekday
    readonly presetTimeMenuItems;

    // In mobile view the menu renders inside a full-height dialog instead of a popover.
    // Clicking the dimmed area of the dialog around the panel dismisses the menu.
    readonly mobileDialog;
    readonly mobileDialogPanel;

    constructor(container: Locator) {
        this.container = container;

        this.tomorrowMenuItem = container.getByTestId('send_post_options.menu.tomorrow_9_am--menuitem');
        this.mondayMenuItem = container.getByTestId('send_post_options.menu.monday_9_am--menuitem');
        this.nextMondayMenuItem = container.getByTestId('send_post_options.menu.next_monday_9_am--menuitem');
        this.recentlyUsedCustomTimeMenuItem = container.getByTestId(
            'send_post_options.menu.recently_used_custom_time--menuitem',
        );
        this.customTimeMenuItem = container.getByText('Choose a custom time');
        // the preset times (tomorrow, Monday, next Monday at 9 AM)
        this.presetTimeMenuItems = container.locator(
            '[data-testid^="send_post_options.menu."][data-testid$="_9_am--menuitem"]',
        );

        this.mobileDialog = container.locator('.modal-dialog.menuModal');
        this.mobileDialogPanel = this.mobileDialog.locator('.modal-content');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async selectCustomTime() {
        await this.customTimeMenuItem.click();
    }

    async toBeVisibleAsMobileDialog() {
        await this.toBeVisible();
        await expect(this.mobileDialog).toBeVisible();
    }

    async toBeHidden() {
        await expect(this.mobileDialog).toBeHidden();
        await expect(this.container).toBeHidden();
    }

    async clickOutsideMobileDialog() {
        await expect(this.mobileDialogPanel).toBeVisible();

        const dialogBox = await this.mobileDialog.boundingBox();
        const panelBox = await this.mobileDialogPanel.boundingBox();
        expect(dialogBox).not.toBeNull();
        expect(panelBox).not.toBeNull();

        // The dialog can be taller than the viewport and start above it, so only the part of the
        // dimmed area inside the viewport can be clicked
        const dimmedAreaTop = Math.max(dialogBox!.y, 0);
        const dimmedAreaHeight = panelBox!.y - dimmedAreaTop;

        // Guard against clicking the plain backdrop outside the dialog, which dismisses
        // the menu even without the dialog letting clicks through to it
        expect(dimmedAreaHeight).toBeGreaterThan(20);

        await this.mobileDialog
            .page()
            .mouse.click(panelBox!.x + panelBox!.width / 2, dimmedAreaTop + dimmedAreaHeight / 2);
    }
}

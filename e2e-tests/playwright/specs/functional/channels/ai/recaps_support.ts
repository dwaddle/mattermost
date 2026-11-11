// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {duration, expect, generated, type App, Msg} from '@mattermost/playwright-lib';

/**
 * The Recaps page on the generated page objects. Recaps are created through the UI, so a test knows one by its title:
 * a recap is found by its heading, then reached through its id (`recaps.recap:<id>`, or `recaps.processing:<id>`
 * while it is being generated).
 */

type RecapMenuAction = generated.RecapsRecapMenuAction;
type ChannelMenuAction = generated.RecapsAction;
type ScheduleDay = generated.CreateRecapModalDay;

function escapeRegExp(value: string) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** The id a keyed element's testid ends with (`recaps.recap:<id>` -> `<id>`). */
async function keyOf(item: Locator) {
    const testId = await item.getAttribute('data-testid');
    return testId!.slice(testId!.lastIndexOf(':') + 1);
}

export class CreateRecapDialog {
    constructor(readonly modal: generated.CreateRecapModal) {}

    async toBeVisible() {
        await expect(this.modal.nameTextbox.locator.or(this.modal.schedule.mondayToggleButton.locator)).toBeVisible();
    }

    async fillTitle(title: string) {
        await expect(this.modal.nameTextbox.locator).toBeVisible();
        await this.modal.nameTextbox.fill(title);
    }

    async selectSelectedChannels() {
        await this.modal.type('selected').click();
    }

    async selectAllUnreads() {
        await this.modal.type('all_unreads').click();
    }

    /** Clicks the step's confirm button, which reads `label` on this step. */
    private async confirm(label: string) {
        await expect(this.modal.confirmButton.locator).toHaveText(label);
        await this.modal.clickConfirmButton();
    }

    async clickNext() {
        await this.confirm('Next');
    }

    async clickPrevious() {
        await this.modal.clickPreviousButton();
    }

    async startRecap() {
        await this.confirm('Start recap');
        await expect(this.modal.locator).not.toBeVisible({timeout: duration.ten_sec});
    }

    async createSchedule() {
        await this.confirm('Create schedule');
        await expect(this.modal.locator).not.toBeVisible({timeout: duration.ten_sec});
    }

    async saveChanges() {
        await this.confirm('Save changes');
        await expect(this.modal.locator).not.toBeVisible({timeout: duration.ten_sec});
    }

    async enableRunOnce() {
        await this.modal.runOnceSwitch.turnOn();
    }

    async expectChannelSelectorVisible() {
        await expect(this.modal.channelSearchTextbox.locator).toBeVisible();
    }

    async expectChannelSelectorHidden() {
        await expect(this.modal.channelSearchTextbox.locator).not.toBeVisible();
    }

    async searchChannel(channelName: string) {
        await this.modal.channelSearchTextbox.fill(channelName);
    }

    async selectChannel(channelName: string) {
        const option = this.modal.channelItems.filter({hasText: channelName});
        await expect(option).toBeVisible();
        await option.click();
        await expect(option.getByRole('checkbox')).toBeChecked();
    }

    async expectSummaryChannels(channelNames: string[]) {
        for (const channelName of channelNames) {
            await expect(this.modal.summary.channelItems.filter({hasText: channelName})).toBeVisible();
        }
    }

    /** The schedule step shows the day toggles (its submit reads "Create schedule" or "Save changes"). */
    async expectScheduleConfigurationVisible() {
        await expect(this.modal.schedule.mondayToggleButton.locator).toBeVisible();
    }

    async selectScheduleDay(day: ScheduleDay) {
        await this.modal.schedule.day(day).toggle();
    }

    async selectAgent(agentName: string) {
        const menu = await this.modal.clickAgentButton();
        await menu.agentItems.filter({hasText: new RegExp(`^${escapeRegExp(agentName)}(?: \\(default\\))?$`)}).click();
    }
}

export class RecapChannelCard {
    constructor(readonly card: generated.RecapsRecapChannel) {}

    async toBeVisible() {
        await expect(this.card.locator).toBeVisible();
    }

    async clickChannelName() {
        await this.card.clickOpenButton();
    }

    async toggleCollapse() {
        await this.card.clickCollapseButton();
    }

    async expectText(text: string) {
        await expect(this.card.locator).toContainText(text);
    }

    async openMenuAction(action: ChannelMenuAction) {
        // its button within the card (the generated menu getter isn't rooted); the items render in a popover
        const button = new generated.Menu(this.card.page, 'recaps.recap.channel.menu', this.card.locator);
        const menu = await button.clickOpenButton();
        await menu.action(action).click();
    }
}

export class RecapItem {
    constructor(
        private readonly app: App,
        private readonly title: string,
    ) {}

    /** The recap (or its processing placeholder) whose heading is the title, once it shows. */
    private get any() {
        const {recaps} = this.app;
        return recaps.recapItems
            .or(recaps.processingItems)
            .filter({has: this.app.page.getByRole('heading', {name: this.title, exact: true})})
            .first();
    }

    private async id() {
        await expect(this.any).toBeVisible({timeout: duration.one_min});
        return keyOf(this.any);
    }

    private async recap() {
        return this.app.recaps.recap({id: await this.id()});
    }

    /** The recap (or its processing placeholder) itself. */
    get container() {
        return this.any;
    }

    /** Its parts, within it (they render inside the recap, so they need no id). */
    private get parts() {
        return new generated.RecapsRecap(this.app.page, 'recaps.recap', this.any);
    }

    get markReadButton() {
        return this.parts.markReadButton.locator;
    }

    /** Its menu, within it (the generated getter isn't rooted; with several recaps it would match each one's). */
    private get menu() {
        return new generated.Menu(this.app.page, 'recaps.recap.menu', this.any);
    }

    get menuButton() {
        return this.menu.openButton.locator;
    }

    async toBeVisible() {
        await expect(this.any).toBeVisible();
    }

    async expectProcessing() {
        const processing = this.app.recaps.processing({id: await this.id()});
        await expect(processing.locator).toContainMessage(Msg.recaps.processing.subtitle);
        await expect(processing.locator).toContainMessage(Msg.recaps.processing.message);
    }

    async expectFailed() {
        await expect(this.any).toContainText('Failed');
    }

    async expectText(text: string) {
        await expect(this.any).toContainText(text);
    }

    async expand() {
        const recap = await this.recap();
        if ((await recap.locator.getAttribute('class'))?.includes('expanded')) {
            return;
        }
        await recap.header.locator.click();
        await expect(recap.locator).toHaveClass(/expanded/);
    }

    async clickMarkRead() {
        await (await this.recap()).clickMarkReadButton();
    }

    /** Clicks the delete button, and returns the confirmation dialog it opens. */
    async clickDelete() {
        return (await this.recap()).clickDeleteButton();
    }

    async openMenuAction(action: RecapMenuAction) {
        // the items render in a popover outside the recap: there's one menu open at a time
        const menu = await this.menu.clickOpenButton();
        await menu.action(action).click();
    }

    async getChannelCard(channel: {id: string}) {
        return new RecapChannelCard((await this.recap()).channel({channel_id: channel.id}));
    }
}

export class ScheduledRecapItem {
    constructor(
        private readonly app: App,
        private readonly title: string,
    ) {}

    private get item() {
        return this.app.recaps.scheduled.recapItems
            .filter({has: this.app.page.getByRole('heading', {name: this.title, exact: true})})
            .first();
    }

    private async recap() {
        await expect(this.item).toBeVisible({timeout: duration.one_min});
        return this.app.recaps.scheduled.recap({id: await keyOf(this.item)});
    }

    async toBeVisible() {
        await expect(this.item).toBeVisible();
    }

    async expectText(text: string | RegExp) {
        await expect(this.item).toContainText(text);
    }

    async expectSchedulePattern(text: string | RegExp) {
        const schedule = (await this.recap()).scheduleText.locator;
        await expect(schedule).toBeVisible();
        await expect(schedule).toContainText(text);
    }

    async expectActive() {
        const toggle = (await this.recap()).enableSwitch.locator;
        await expect(toggle).toBeChecked();
        await expect(toggle).toHaveAccessibleName('Active - click to pause');
    }

    async expectPaused() {
        const toggle = (await this.recap()).enableSwitch.locator;
        await expect(toggle).not.toBeChecked();
        await expect(toggle).toHaveAccessibleName('Paused - click to resume');
    }

    async pause() {
        await this.expectActive();
        await (await this.recap()).enableSwitch.turnOff();
        await this.expectPaused();
    }

    async resume() {
        await this.expectPaused();
        await (await this.recap()).enableSwitch.turnOn();
        await this.expectActive();
    }

    async editViaMenu() {
        const menu = await (await this.recap()).clickOpenMenuButton();
        await menu.clickEditMenuItem();
    }

    /** Deletes it through its menu, and returns the confirmation dialog that opens. */
    async deleteViaMenu() {
        const menu = await (await this.recap()).clickOpenMenuButton();
        return menu.clickDeleteMenuItem();
    }
}

export class RecapsUi {
    readonly createRecapModal: CreateRecapDialog;

    constructor(readonly app: App) {
        this.createRecapModal = new CreateRecapDialog(app.createRecapModal);
    }

    get page() {
        return this.app.page;
    }

    async goto(teamName: string) {
        await this.app.recapsPage.goto({team: {name: teamName}});
    }

    async toBeVisible() {
        await expect(this.page).toHaveURL(/.*\/recaps/);
        await expect(this.app.recaps.title.locator).toBeVisible({timeout: duration.one_min});
    }

    /**
     * A user with existing recaps opens the dialog from the header's "Add a recap"; a user with none from the empty
     * state's "Create a recap". Both open the same dialog, so it clicks whichever is present.
     */
    private get createButton() {
        return this.app.recaps.addButton.locator.or(this.app.recaps.placeholder.createButton.locator).first();
    }

    async openCreateRecap() {
        await expect(this.createButton).toBeVisible({timeout: duration.one_min});
        await this.createButton.click();
        await this.createRecapModal.toBeVisible();
        return this.createRecapModal;
    }

    private async switchTo(tab: generated.RecapsTab) {
        const button = this.app.recaps.tab(tab).locator;
        await button.click();
        await expect(button).toHaveClass(/active/);
    }

    async switchToUnread() {
        await this.switchTo('unread');
    }

    async switchToRead() {
        await this.switchTo('read');
    }

    async switchToScheduled() {
        await this.switchTo('scheduled');
    }

    /**
     * A user with no recaps at all settles on the "Set up your recap" placeholder, while "You're all caught up" is the
     * per-tab empty state shown during loading or when recaps live in other tabs; either will do.
     */
    async expectCaughtUpEmptyState() {
        await expect(this.app.recaps.caughtUp.locator.or(this.app.recaps.placeholder.locator).first()).toBeVisible({
            timeout: duration.one_min,
        });
    }

    async expectScheduledEmptyState() {
        const empty = this.app.recaps.scheduled.empty;
        await expect(empty).toContainMessage(Msg.recaps.scheduled.emptyState.title);
        await expect(empty).toContainMessage(Msg.recaps.placeholder.description);
        await expect(empty.createButton.locator).toBeVisible();
    }

    async openCreateRecapFromScheduledEmptyState() {
        await this.app.recaps.scheduled.empty.clickCreateButton();
        await this.createRecapModal.toBeVisible();
        return this.createRecapModal;
    }

    /** The create affordance (the header's or the empty state's, whichever shows) is disabled, with `reason` as its title. */
    async expectAddRecapDisabled(reason: string) {
        await expect(this.createButton).toBeDisabled();
        await expect(this.createButton).toHaveAttribute('title', reason);
    }

    /** Confirms a delete dialog, and waits for it to close. */
    async confirmDelete(dialog: generated.ConfirmModal) {
        await expect(dialog.confirmButton.locator).toBeVisible();
        await dialog.confirmButton.click();
        await expect(dialog.confirmButton.locator).not.toBeVisible({timeout: duration.ten_sec});
    }

    getRecap(title: string) {
        return new RecapItem(this.app, title);
    }

    getScheduledRecap(title: string) {
        return new ScheduledRecapItem(this.app, title);
    }

    async expectRecapNotVisible(title: string) {
        const {recaps} = this.app;
        await expect(
            recaps.recapItems
                .or(recaps.processingItems)
                .filter({has: this.page.getByRole('heading', {name: title, exact: true})}),
        ).toHaveCount(0);
    }

    async expectScheduledRecapNotVisible(title: string) {
        await expect(
            this.app.recaps.scheduled.recapItems.filter({
                has: this.page.getByRole('heading', {name: title, exact: true}),
            }),
        ).toHaveCount(0);
    }
}

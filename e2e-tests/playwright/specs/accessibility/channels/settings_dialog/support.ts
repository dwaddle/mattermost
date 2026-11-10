// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import {expect, generated, type App} from '@mattermost/playwright-lib';

/**
 * The Settings modal on the generated page objects, keeping the names these specs use: a tab's panel
 * (`settings.panel:<tab>--tabpanel`), its sections' Edit buttons (`settings.section:<key>`), and the section that is
 * open (the expanded section is a `<section>`; the collapsed ones are rows).
 */

/** A CSS selector for a generated element, for axe's `include()` (which takes selectors, not locators). */
export function selectorOf(driver: {meta: {testId: string}}) {
    return `[data-testid="${driver.meta.testId}"]`;
}

/** The expanded section, as an axe `include()` selector. */
export const EXPANDED_SECTION = 'section[data-testid^="settings.section:"]';

class TabSettings {
    readonly container: Locator;
    readonly id: string;
    readonly expandedSectionId = EXPANDED_SECTION;

    constructor(
        protected readonly app: App,
        tab: generated.SettingsPanel,
    ) {
        const panel = app.settings.panel(tab);
        this.container = panel.locator;
        this.id = selectorOf(panel);
    }

    /** The open section: the one showing a Cancel button. */
    get expandedSection(): Locator {
        // `has` takes a locator relative to each section, so build it from the testid (a generated locator starts at `:root`)
        const cancel = new generated.SettingsSectionItem(this.app.page, 'settings.section').cancelButton;
        return this.app.settings.sectionItems.filter({has: this.app.page.getByTestId(cancel.meta.testId)});
    }

    protected edit(section: string): Locator {
        return this.app.settings.section(section).editButton.locator;
    }
}

class DisplaySettings extends TabSettings {
    constructor(app: App) {
        super(app, 'display');
    }

    readonly themeEditButton = this.edit('theme');
    readonly clockDisplayEditButton = this.edit('clock');
    readonly teammateNameDisplayEditButton = this.edit('name_format');
    readonly availabilityStatusOnPostsEditButton = this.edit('availabilityStatus');
    readonly lastActiveTimeEditButton = this.edit('lastactive');
    readonly timezoneEditButton = this.edit('timezone');
    readonly showLinkPreviewsEditButton = this.edit('linkpreview');
    readonly collapseImagePreviewsEditButton = this.edit('collapse');
    readonly messageDisplayEditButton = this.edit('message_display');
    readonly clickToReplyEditButton = this.edit('click_to_reply');
    readonly channelDisplayModeEditButton = this.edit('channel_display_mode');
    readonly collapseCategoryWithUnreadsEditButton = this.edit('collapse_category_with_unreads');
    readonly oneClickReactionsEditButton = this.edit('one_click_reactions_enabled');
    readonly emojiPickerEditButton = this.edit('renderEmoticonsAsEmoji');
    readonly languageEditButton = this.edit('languages');
}

class NotificationsSettings extends TabSettings {
    constructor(app: App) {
        super(app, 'notifications');
    }

    readonly desktopAndMobileEditButton = this.edit('desktopAndMobile');
    readonly desktopNotificationSoundEditButton = this.edit('desktopNotificationSound');
    readonly emailEditButton = this.edit('email');
    readonly channelMentionAutoFollowEditButton = this.edit('channelMentionAutoFollow');
    readonly keywordsTriggerNotificationsEditButton = this.edit('keywordsAndMentions');
    readonly keywordsGetHighlightedEditButton = this.edit('keywordsAndHighlight');
}

class SidebarSettings extends TabSettings {
    constructor(app: App) {
        super(app, 'sidebar');
    }

    readonly groupUnreadEditButton = this.edit('showUnreadsCategory');
    readonly limitVisibleDMsEditButton = this.edit('limitVisibleGMsDMs');
}

class AdvancedSettings extends TabSettings {
    constructor(app: App) {
        super(app, 'advanced');
    }

    readonly ctrlEnterEditButton = this.edit('advancedCtrlSend');
    readonly wysiwygEditorEditButton = this.edit('wysiwygEditor');
    readonly postFormattingEditButton = this.edit('formatting');
    readonly joinLeaveEditButton = this.edit('joinLeave');
    readonly scrollPositionEditButton = this.edit('unread_scroll_position');
    readonly syncDraftsEditButton = this.edit('syncDrafts');
}

export class SettingsModal {
    readonly container: Locator;
    readonly closeButton: Locator;
    readonly tabs: Locator;
    readonly notificationsTab: Locator;
    readonly displayTab: Locator;
    readonly sidebarTab: Locator;
    readonly advancedTab: Locator;
    readonly notificationsSettings: NotificationsSettings;
    readonly displaySettings: DisplaySettings;
    readonly sidebarSettings: SidebarSettings;
    readonly advancedSettings: AdvancedSettings;

    constructor(private readonly app: App) {
        const modal = app.userSettingsModal;
        this.container = modal.locator;
        this.closeButton = modal.closeButton.locator;
        this.tabs = modal.tabs.tabItems;
        this.notificationsTab = modal.tabs.tab('notifications').locator;
        this.displayTab = modal.tabs.tab('display').locator;
        this.sidebarTab = modal.tabs.tab('sidebar').locator;
        this.advancedTab = modal.tabs.tab('advanced').locator;
        this.notificationsSettings = new NotificationsSettings(app);
        this.displaySettings = new DisplaySettings(app);
        this.sidebarSettings = new SidebarSettings(app);
        this.advancedSettings = new AdvancedSettings(app);
    }

    /** The modal's element id, for axe's `include()`. */
    getContainerId() {
        return this.container.getAttribute('id');
    }

    private async open(tab: Locator, settings: TabSettings) {
        await expect(tab).toBeVisible();
        await tab.click();
        await expect(settings.container).toBeVisible();
        return settings;
    }

    async openNotificationsTab() {
        return this.open(this.notificationsTab, this.notificationsSettings);
    }

    async openDisplayTab() {
        return this.open(this.displayTab, this.displaySettings);
    }

    async openSidebarTab() {
        return this.open(this.sidebarTab, this.sidebarSettings);
    }

    async openAdvancedTab() {
        return this.open(this.advancedTab, this.advancedSettings);
    }
}

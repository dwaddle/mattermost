// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, generated, pickDate, type App} from '@mattermost/playwright-lib';

/**
 * Scheduled messages on the generated page objects: the composers' schedule menu, the date/time dialog, the composer
 * indicator, the sidebar's count, and the scheduled posts page (rows by scheduled post, their actions and dialogs).
 */

export type Scheduled = {selectedDate: string; selectedTime: string};

/**
 * Picks a custom time in an open date/time dialog and confirms it: `dayFromToday` days ahead, the time menu's
 * `timeOptionIndex`th option, weekly when asked. Returns the date as the app shows it for today and tomorrow ("Today",
 * "Tomorrow"), else "<Month> <dd>", and the time as the menu showed it.
 */
export async function pickTime(
    modal: generated.DateTimePickerModal,
    dayFromToday = 0,
    timeOptionIndex = 0,
    repeatWeekly?: boolean,
): Promise<Scheduled> {
    await expect(modal.when.dateButton.locator).toBeVisible();
    if (typeof repeatWeekly === 'boolean') {
        await modal.setRepeatWeeklyCheckbox(repeatWeekly);
    }

    const target = new Date();
    target.setDate(target.getDate() + dayFromToday);
    await modal.when.dateButton.click();
    await pickDate(modal.when.calendar, target);
    await expect(modal.when.calendar.locator).not.toBeVisible();
    const dateText = (await modal.when.dateButton.locator.textContent()) ?? '';

    const menu = await modal.when.clickTimeButton();
    const option = menu.timeItems.nth(timeOptionIndex);
    await expect(option).toBeVisible();

    // read before clicking: the click closes the menu
    const selectedTime = ((await option.textContent()) ?? '').trim();
    await option.click();
    await modal.clickConfirmButton();
    await expect(modal.when.dateButton.locator).not.toBeVisible();

    let selectedDate = `${target.toLocaleString('default', {month: 'long'})} ${String(target.getDate()).padStart(2, '0')}`;
    if (dateText.includes('Today')) {
        selectedDate = 'Today';
    } else if (dateText.includes('Tomorrow')) {
        selectedDate = 'Tomorrow';
    }
    return {selectedDate, selectedTime};
}

/** Writes a message in a composer and schedules it from the send button's menu ("Choose a custom time"). */
export async function scheduleMessage(
    app: App,
    composer: generated.PostCreate,
    message: string,
    dayFromToday = 0,
    timeOptionIndex = 0,
    repeatWeekly?: boolean,
): Promise<Scheduled> {
    await composer.fillMessageTextbox(message);

    // the send options sit beside each composer's Send button; this composer's
    const options = new generated.SendPostOptions(app.page, 'send_post_options', composer.locator);
    await options.clickOpenMenuButton();
    const modal = await app.sendPostOptions.menu.clickCustomTimeMenuItem();
    return pickTime(modal, dayFromToday, timeOptionIndex, repeatWeekly);
}

/** Checks a composer's scheduled-post indicator shows the scheduled time and a date (or Today / Tomorrow). */
export async function expectIndicator(indicator: generated.PostCreateScheduledPostIndicator, scheduled: Scheduled) {
    await expect(indicator.icon.locator).toBeVisible();
    await expect(indicator.locator).toContainText(scheduled.selectedTime);
    await expect(indicator.locator).toContainText(new RegExp(`${scheduled.selectedDate}|Today|Tomorrow`, 'i'));
}

/** Checks the sidebar's scheduled-posts count. */
export async function expectSidebarCount(app: App, count: number) {
    await expect(app.lhs.drafts.scheduledPostBadgeText.locator).toHaveText(String(count));
}

/**
 * The scheduled posts page's only row, checked: its message, its time and date, the tab's count, and the weekly tag
 * when it repeats.
 */
export async function expectScheduledPost(
    app: App,
    expected: Scheduled & {message: string; count: number; repeatWeekly?: boolean},
) {
    const {scheduled, tabs} = app.drafts;

    // nothing hovered or focused (the reschedule modal hands focus back to the row), so the
    // row's actions aren't showing over its header
    await app.page.mouse.move(0, 0);
    await app.page.evaluate(() => (document.activeElement as HTMLElement | null)?.blur());
    await expect(tabs.scheduledCountText.locator).toHaveText(String(expected.count));
    await expect(scheduled.postItems).toHaveCount(expected.count);
    const id = (await scheduled.postKeys()).at(-1)!;
    const post = scheduled.post({id});
    await expect(post.message.locator).toContainText(expected.message);
    const time = post.header.timeText.locator;
    await expect(time).toContainText(expected.selectedTime);
    await expect(time).toContainText(new RegExp(`${expected.selectedDate}|Today|Tomorrow`, 'i'));
    if (expected.repeatWeekly) {
        await expect(post.header.repeatsWeeklyText.locator).toBeVisible();
    }
    return post;
}

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import type {Driver} from '@/aria/drivers';
import {duration, wait} from '@/util';

/** The parts of an open date picker's calendar that the generated `…calendar` scopes all have. */
export type Calendar = {
    day(key: string): Driver;
    dayKeys(): Promise<string[]>;
    readonly dayItems: Locator;
    nextMonth: Driver;
    previousMonth: Driver;
};

/** A day's key in a calendar's testids: its date as YYYY-MM-DD, in the browser's time zone. */
export function calendarDayKey(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** The year and month ("2026-11") a calendar shows: that of its middle row, which no outside day reaches. */
async function shownMonth(calendar: Calendar): Promise<string> {
    await calendar.dayItems.first().waitFor();
    const keys = await calendar.dayKeys();
    return keys[Math.min(14, keys.length - 1)].slice(0, 7);
}

/** Clicks next or previous month until the calendar shows `target`'s month. The calendar has to be open. */
export async function showMonth(calendar: Calendar, target: Date): Promise<void> {
    const wanted = calendarDayKey(target).slice(0, 7);
    for (let i = 0; i < 24; i++) {
        const shown = await shownMonth(calendar);
        if (shown === wanted) {
            return;
        }
        await (shown < wanted ? calendar.nextMonth : calendar.previousMonth).locator.click();

        // the calendar redraws the days in place: wait until it shows another month
        const deadline = Date.now() + duration.ten_sec;
        while ((await shownMonth(calendar)) === shown) {
            if (Date.now() > deadline) {
                throw new Error(`The calendar still shows ${shown} after clicking to ${wanted}`);
            }
            await wait(100);
        }
    }
    throw new Error(`The calendar did not reach ${wanted}`);
}

/** Shows `date`'s month and clicks its day. The calendar has to be open. */
export async function pickDate(calendar: Calendar, date: Date): Promise<void> {
    await showMonth(calendar, date);
    await calendar.day(calendarDayKey(date)).locator.click();
}

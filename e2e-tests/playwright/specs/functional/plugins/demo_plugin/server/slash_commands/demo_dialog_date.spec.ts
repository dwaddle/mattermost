// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, getDayPickerDayCell, test} from '@mattermost/playwright-lib';

import {openChannel} from '../../../../channels/burn_on_read/support';
import {sendDemoSlashCommand} from '../../helpers';

import {fieldLabelled, postContaining, sendCommand} from './support';

test('should open /dialog date and post submit confirmation after selecting dates', async ({pw}) => {
    // # Setup
    const {user, team} = await pw.initSetup();
    await pw.ensureDemoPlugin();

    // # Log in and open Town Square
    const app = await openChannel(pw, user, team, 'town-square');

    // # Send /dialog date command
    const form = app.appsForm;
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/dialog date'));
    await expect(form.titleText.locator).toBeVisible();

    // * The dialog opens with title "Date & DateTime Test Dialog"
    await expect(form.titleText.locator).toContainText('Date & DateTime Test Dialog');

    // * The three fields show, with Event Title's default value
    const date = await fieldLabelled(app, 'Meeting Date *');
    const dateTime = await fieldLabelled(app, 'Meeting Date & Time *');
    const title = await fieldLabelled(app, 'Event Title *');
    await expect(title.valueTextbox.locator).toHaveValue('Team Meeting');

    // # Pick the 20th for the meeting date (any month has one)
    await date.clickDateButton();
    await expect(date.calendar.locator).toBeVisible();
    await getDayPickerDayCell(date.calendar.locator, 20).click();

    // # Pick the 22nd at 3:00 PM for the meeting date and time
    await dateTime.clickDateButton();
    await expect(dateTime.calendar.locator).toBeVisible();
    await getDayPickerDayCell(dateTime.calendar.locator, 22).click();
    const times = await dateTime.clickTimeButton();
    await times.time('1500').click();

    // # Submit ("Create Event")
    await expect(form.submitButton.locator).toHaveText('Create Event');
    await form.clickSubmitButton();
    await expect(form.titleText.locator).not.toBeVisible();

    // * The plugin posts the submission
    await postContaining(app, 'submitted a Date Dialog');
});

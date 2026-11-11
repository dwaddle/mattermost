// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, openChannel, type PlaywrightExtended, test, Msg} from '@mattermost/playwright-lib';

import {fieldContaining, openDialog, postContaining, radioFieldWith} from './support';

/** Sets up the demo plugin, opens Town Square and runs a /dialog command. */
async function openDemoDialog(pw: PlaywrightExtended, command: string) {
    const {user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: townSquare});
    const form = await openDialog(app, command);
    return {app, form};
}

test('should open /dialog and post submit confirmation on submit', async ({pw}) => {
    const {app, form} = await openDemoDialog(pw, '/dialog');
    await expect(form.titleText.locator).toContainText('Test Title');

    // # Fill the required fields. Display Name has a default ("default text"): overwrite it
    await form.field({name: 'realname'}).fillValueTextbox('Test Input');
    await form.field({name: 'someemail'}).fillValueTextbox('test@example.com');
    await form.field({name: 'somepassword'}).fillValueTextbox('testpassword123');
    await form.field({name: 'somenumber'}).fillValueSpinButton('42');
    await form.field({name: 'someoptionselector'}).valueCombobox.choose('Option1');

    // # The two required checkboxes, and the radio choice
    await (await fieldContaining(app, 'Agree to the terms of service')).setValueCheckbox(true);
    await (await fieldContaining(app, 'Agree to the annoying terms of service')).setValueCheckbox(true);
    const option1 = (await radioFieldWith(app, 'Option1')).optionItems.first();
    await expect(option1).toHaveAccessibleName('Option1');
    await option1.check();

    // # Submit
    await form.clickSubmitButton();
    await expect(form.titleText.locator).not.toBeVisible();

    // * The plugin posts the submission ("Interative" is the demo plugin's typo)
    await postContaining(app, 'submitted an Interative Dialog');
});

test('should post cancellation notification when /dialog is cancelled', async ({pw}) => {
    const {app, form} = await openDemoDialog(pw, '/dialog');

    // * The dialog offers Cancel and Submit
    await expect(form.titleText.locator).toContainText('Test Title');
    await expect(form.cancelButton.locator).toBeVisible();
    await expect(form.submitButton.locator).toHaveMessage(Msg.interactive_dialog.submit);

    // # Cancel
    await form.clickCancelButton();
    await expect(form.titleText.locator).not.toBeVisible();

    // * The plugin posts the cancellation ("Interative" is the demo plugin's typo)
    await postContaining(app, 'canceled an Interative Dialog');
});

test('should show validation errors when required fields are submitted empty', async ({pw}) => {
    const {form} = await openDemoDialog(pw, '/dialog');
    await expect(form.titleText.locator).toContainText('Test Title');

    // # Clear the required Number field and submit
    const number = form.field({name: 'somenumber'});
    await number.fillValueSpinButton('');
    await form.clickSubmitButton();

    // * The dialog stays open with a form error and the field's own
    await expect(form.titleText.locator).toBeVisible();
    await expect(form.errorText.locator).toHaveMessage(Msg.apps.error.form.required_fields_empty);
    await expect(number.locator).toContainMessage(Msg.interactive_dialog.error.required);
});

test('should show general error and keep dialog open on /dialog error submit', async ({pw}) => {
    const {form} = await openDemoDialog(pw, '/dialog error');

    // * The simple dialog offers Cancel and Submit Test
    await expect(form.titleText.locator).toContainText('Simple Dialog Test');
    await expect(form.cancelButton.locator).toBeVisible();
    await expect(form.submitButton.locator).toHaveText('Submit Test');

    // # Fill its only field and submit
    const [name] = await form.fieldKeys();
    const field = form.field({name});
    await field.fillValueTextbox('sample test input');
    await form.clickSubmitButton();

    // * The general error shows, and the dialog stays open with the input kept
    await expect(form.errorText.locator).toHaveText('some error');
    await expect(field.valueTextbox.locator).toHaveValue('sample test input');
    await expect(form.titleText.locator).toBeVisible();
});

test('should show general error on /dialog error-no-elements confirm', async ({pw}) => {
    const {form} = await openDemoDialog(pw, '/dialog error-no-elements');

    // * The confirmation offers Cancel and Confirm, and no fields
    await expect(form.titleText.locator).toContainText('Sample Confirmation Dialog');
    await expect(form.cancelButton.locator).toBeVisible();
    await expect(form.submitButton.locator).toHaveText('Confirm');
    await expect(form.fieldItems).toHaveCount(0);

    // # Confirm
    await form.clickSubmitButton();

    // * The general error shows and the dialog stays open
    await expect(form.errorText.locator).toHaveText('some error');
    await expect(form.cancelButton.locator).toBeVisible();
    await expect(form.submitButton.locator).toHaveText('Confirm');
});

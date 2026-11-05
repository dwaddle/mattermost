// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- cases quote template-literal syntax */

import {RuleTester} from 'eslint';

import noExpectInPageObjects from './e2e-no-expect-in-page-objects.js';
import noLiteralLocators from './e2e-no-literal-locators.js';
import noWaitForTimeout from './e2e-no-wait-for-timeout.js';

const ruleTester = new RuleTester({languageOptions: {ecmaVersion: 2022, sourceType: 'module'}});

ruleTester.run('e2e-no-literal-locators', noLiteralLocators, {
    valid: [
        {code: 'await app.channelHeader.clickOpenMenuButton();'},
        {code: 'await expect(app.center.postList).toContainMessage(Msg.x.y, {u});'},
        {code: 'page.getByTestId(id);'},
        {code: 'page.getByRole("button");'},
        {code: 'page.getByRole("button", {name: label});'},
        {code: 'page.locator(`#post_${id}`);'},
        {code: 'await composer.fillMessageTextbox("text a user types");'},
    ],
    invalid: [
        {code: 'page.getByTestId("channel_view");', errors: [{message: /getByTestId\(\)` with a literal/}]},
        {code: 'page.locator("#searchBox");', errors: [{message: /locator\(\)` with a literal/}]},
        {code: 'page.getByText(`Save`);', errors: [{message: /getByText/}]},
        {code: 'page.getByTestId(/^center\\.post_list/);', errors: [{message: /getByTestId/}]},
        {code: 'page.getByRole("button", {name: "Save"});', errors: [{message: /literal name/}]},
    ],
});

ruleTester.run('e2e-no-wait-for-timeout', noWaitForTimeout, {
    valid: [{code: 'await settle(el, (b) => b.click(), {wait: Api.CreatePost});'}],
    invalid: [{code: 'await page.waitForTimeout(1000);', errors: [{message: /No fixed sleeps/}]}],
});

ruleTester.run('e2e-no-expect-in-page-objects', noExpectInPageObjects, {
    valid: [{code: 'const el = this.locator;'}],
    invalid: [
        {code: 'await expect(this.locator).toBeVisible();', errors: 1},
        {code: 'await expect.poll(() => 1).toBe(1);', errors: 1},
    ],
});

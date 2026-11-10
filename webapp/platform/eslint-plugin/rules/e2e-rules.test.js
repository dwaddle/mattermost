// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/* eslint-disable no-template-curly-in-string -- cases quote template-literal syntax */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import {RuleTester} from 'eslint';

import commitSettles from './e2e-commit-settles.js';
import namedTimeouts from './e2e-named-timeouts.js';
import noCatalogText from './e2e-no-catalog-text.js';
import noExpectInPageObjects from './e2e-no-expect-in-page-objects.js';
import noInstantCheck from './e2e-no-instant-check.js';
import noLiteralLocators from './e2e-no-literal-locators.js';
import noLocatorAction from './e2e-no-locator-action.js';
import noWaitForTimeout from './e2e-no-wait-for-timeout.js';

const ruleTester = new RuleTester({languageOptions: {ecmaVersion: 2022, sourceType: 'module'}});

ruleTester.run('e2e-no-literal-locators', noLiteralLocators, {
    valid: [
        {code: 'await app.channelHeader.clickOpenMenuButton();'},
        {code: 'await expect(app.center.postList).toContainMessage(Msg.x.y, {u});'},
        {code: 'page.getByTestId(id);'},
        {code: 'page.getByRole("button");'},
        {code: 'page.getByRole("button", {name: label});'},
        {code: 'page.getByRole("button", {name: formatMessage(Msg.x)});'},
        {code: 'await composer.fillMessageTextbox("text a user types");'},
        {code: 'let name = "Save"; name = other; page.getByRole("button", {name});'},
        {code: 'items.filter({has: app.x.locator});'},
        {code: 'items.filter({hasText: user.username});'},
        {code: 'page.locator(`#post_${id}`);', options: [{templates: false}]},
        {code: 'const SAVE = "Save"; page.getByRole("button", {name: SAVE});', options: [{variables: false}]},
        {code: 'rows.filter({hasText: "Town Square"});', options: [{hasText: false}]},
        {code: 'page.evaluate(() => document.querySelector("[data-testid=x]"));', options: [{selectors: false}]},
    ],
    invalid: [
        {code: 'page.getByTestId("channel_view");', errors: [{message: /getByTestId\(\)` with a literal/}]},
        {code: 'page.locator("#searchBox");', errors: [{message: /locator\(\)` with a literal/}]},
        {code: 'page.getByText(`Save`);', errors: [{message: /getByText/}]},
        {code: 'page.getByTestId(/^center\\.post_list/);', errors: [{message: /getByTestId/}]},
        {code: 'page.getByRole("button", {name: "Save"});', errors: [{message: /literal name/}]},

        // templated locators
        {code: 'page.locator(`#post_${id}`);', errors: [{message: /locator\(\)` with a template literal/}]},
        {code: 'page.getByTestId(`center.post:${id}--button`);', errors: [{message: /template literal/}]},

        // names held in variables
        {code: 'const SAVE = "Save"; page.getByRole("button", {name: SAVE});', errors: [{message: /string held in a const as the name/}]},
        {code: 'const ID = "channel_view"; page.getByTestId(ID);', errors: [{message: /string held in a const/}]},

        // text filters
        {code: 'rows.filter({hasText: "Town Square"});', errors: [{message: /filter\(\{hasText\}\)/}]},
        {code: 'rows.filter({hasNotText: /Archived/});', errors: [{message: /filter\(\{hasNotText\}\)/}]},

        // testid selectors anywhere, including inside evaluate
        {code: 'page.evaluate(() => document.querySelector("[data-testid=\\"post_list\\"]"));', errors: [{message: /data-testid` selector/}]},
        {code: 'page.$$(`[data-testid^="${prefix}"]`);', errors: [{message: /data-testid` selector/}]},
        {code: 'page.locator("[data-testid=x]");', errors: [{message: /locator\(\)` with a literal/}]},
    ],
});

ruleTester.run('e2e-no-wait-for-timeout', noWaitForTimeout, {
    valid: [
        {code: 'await settle(el, (b) => b.click(), {wait: Api.CreatePost});'},
        {code: 'test.setTimeout(duration.two_min);'},
        {code: 'await expect.poll(() => api.getPosts(), {message: "posts"}).toHaveLength(2);'},
        {code: 'const id = setTimeout(() => done(), 10); clearTimeout(id);'},
        {code: 'import {wait} from "./local"; await wait(5);'},
        {code: 'await page.evaluate(() => { window.setTimeout(() => el.click(), 0); });'},
    ],
    invalid: [
        {code: 'await page.waitForTimeout(1000);', errors: [{message: /No fixed sleeps/}]},
        {code: 'await pw.wait(pw.duration.one_sec);', errors: [{message: /No fixed sleeps/}]},
        {code: 'import {wait} from "@mattermost/playwright-lib"; await wait(500);', errors: [{message: /No fixed sleeps/}]},
        {code: 'await new Promise((resolve) => setTimeout(resolve, 2000));', errors: [{message: /timer wrapped in a promise/}]},
        {code: 'function sleep(ms) { return new Promise(function (r) { window.setTimeout(r, ms); }); }', errors: [{message: /timer wrapped in a promise/}]},
        {code: 'await page.evaluate(() => new Promise((resolve) => setTimeout(() => requestAnimationFrame(() => resolve(null)))));', errors: [{message: /timer wrapped in a promise/}]},
    ],
});

ruleTester.run('e2e-no-expect-in-page-objects', noExpectInPageObjects, {
    valid: [{code: 'const el = this.locator;'}],
    invalid: [
        {code: 'await expect(this.locator).toBeVisible();', errors: 1},
        {code: 'await expect.poll(() => 1).toBe(1);', errors: 1},
    ],
});

ruleTester.run('e2e-no-locator-action', noLocatorAction, {
    valid: [
        {code: 'await app.composer.sendButton.click();'},
        {code: 'await expect(app.composer.sendButton.locator).toBeVisible();'},
        {code: 'await page.locator(x).click();'},
        {code: 'await post.locator.hover();'}, // a scope: no driver to act through yet
        {code: 'await app.header.titleText.locator.click();'}, // a text driver can't click
        {code: 'await app.x.nameCombobox.locator.fill("a");'}, // a combobox can't fill yet
        {code: 'const box = await app.x.saveButton.locator.boundingBox();'},
    ],
    invalid: [
        {code: 'await app.composer.sendButton.locator.click();', errors: [{message: 'Act through the driver: `app.composer.sendButton.click(…)`, not `app.composer.sendButton.locator.click(…)`.'}]},
        {code: 'await app.x.nameTextbox.locator.fill("a");', errors: [{message: /nameTextbox\.fill/}]},
        {code: 'await app.x.nameTextbox.locator.pressSequentially("a");', errors: [{message: /nameTextbox\.type/}]},
        {code: 'await app.x.agreeCheckbox.locator.check();', errors: [{message: /agreeCheckbox\.check/}]},
        {code: 'await app.x.generalTab.locator.click();', errors: [{message: /generalTab\.select/}]},
        {code: 'await app.menu.leaveItem.locator.click();', errors: [{message: /leaveItem\.click/}]},
        {code: 'await app.list.channelLink("town-square").locator.click();', errors: [{message: /channelLink\("town-square"\)\.click/}]},
        {code: 'await app.header.titleText.locator.hover();', errors: [{message: /titleText\.hover/}]},
        {code: 'await app.x.saveButton.locator.focus();', errors: [{message: /saveButton\.focus/}]},
    ],
});

ruleTester.run('e2e-named-timeouts', namedTimeouts, {
    valid: [
        {code: 'await expect(x.locator).toBeVisible({timeout: duration.half_min});'},
        {code: 'test.setTimeout(duration.four_min);'},
        {code: 'await x.locator.waitFor({timeout: pw.duration.one_min});'},
        {code: 'await expect(x.locator).toBeVisible({timeout: 0});'},
        {code: 'window.setTimeout(() => x(), 100);'},
        {code: 'const t = setTimeout(fn, 100);'},
    ],
    invalid: [
        {code: 'await expect(x.locator).toBeVisible({timeout: 15000});', errors: [{message: 'Hard-coded timeout 15000 ms: use `duration.half_min`.'}]},
        {code: 'await expect(x.locator).toBeVisible({timeout: 5000});', errors: [{message: 'Hard-coded timeout 5000 ms: drop it (the expect default is 10 s) or use `duration.ten_sec`.'}]},
        {code: 'await expect(x.locator).not.toBeVisible({timeout: 10000});', errors: [{message: /drop it/}]},
        {code: 'test.setTimeout(90000);', errors: [{message: /use `duration.two_min`/}]},
        {code: 'test.setTimeout(3 * 60 * 1000);', errors: [{message: /180000 ms: use `duration.four_min`/}]},
        {code: 'await x.locator.waitFor({state: "visible", timeout: 2000});', errors: [{message: /2000 ms: use `duration.two_sec`/}]},
        {code: 'await expect.poll(fn, {timeout: 45000}).toBe(1);', errors: [{message: /use `duration.one_min`/}]},
    ],
});

// A generated directory with one saving element, one reading element, and one with no effects.
const generated = fs.mkdtempSync(path.join(os.tmpdir(), 'e2e-commit-settles-'));
fs.writeFileSync(path.join(generated, 'settings.ts'), `export class Settings extends Scope {
    get saveButton() {
        return drivers.button(this.byTestId(\`\${this.scope}.save--button\`), {
            testId: \`\${this.scope}.save--button\`,
            role: 'button',
            effects: [Api.PatchChannel, Api.GetChannel],
            unknownEffects: false,
        });
    }

    get refreshButton() {
        return drivers.button(this.byTestId(\`\${this.scope}.refresh--button\`), {
            testId: \`\${this.scope}.refresh--button\`,
            role: 'button',
            effects: [Api.GetChannel],
            unknownEffects: false,
        });
    }

    removeButton(key: string) {
        return drivers.button(this.byTestId(\`\${this.scope}.remove:\${key}--button\`), {
            testId: \`\${this.scope}.remove:{key}--button\`,
            role: 'button',
            effects: [Api.DeleteChannel],
            unknownEffects: false,
        });
    }

    get headerTextbox() {
        return drivers.textbox(this.byTestId(\`\${this.scope}.header--textbox\`), {
            testId: \`\${this.scope}.header--textbox\`,
            role: 'textbox',
            effects: [Api.PatchChannel],
            unknownEffects: false,
        });
    }

    get deleteButton() {
        return drivers.button(this.byTestId(\`\${this.scope}.delete--button\`), {
            testId: \`\${this.scope}.delete--button\`,
            role: 'button',
            effects: [],
            unknownEffects: false,
        });
    }

    async clickSaveButton(): Promise<void> {
        await this.saveButton.click();
    }
}
`);
process.on('exit', () => fs.rmSync(generated, {recursive: true, force: true}));
const withIndex = [{generated}];

ruleTester.run('e2e-commit-settles', commitSettles, {
    valid: [
        {code: 'await settings.saveButton.commit();', options: withIndex},
        {code: 'await settings.refreshButton.click();', options: withIndex},
        {code: 'await settings.deleteButton.click();', options: withIndex}, // no listed effect: by the generated metadata it doesn't save
        {code: 'await settle(settings.saveButton, (b) => b.click(), {wait: Api.PatchChannel});', options: withIndex},
        {code: 'await settings.saveButton.click();\nawait expect(settings.saveButton.locator).toBeSaved();', options: withIndex},
        {code: 'await settings.saveButton.click();\nawait expect(panel.messageText).toHaveMessage(Msg.saveChangesPanel.saved);', options: withIndex},
        {code: 'await Promise.all([page.waitForResponse(isPatch), settings.saveButton.click()]);', options: withIndex},
        {code: 'await settings.headerTextbox.press("Escape");', options: withIndex},
        {code: 'await settings.headerTextbox.submit();', options: withIndex},
        {code: 'await modal.openButton.click();'}, // by name: not a saving verb
        {code: 'await modal.saveLink.click();'}, // by name: only buttons
    ],
    invalid: [
        {code: 'await settings.saveButton.click();', options: withIndex, errors: [{message: /`saveButton` saves: use `saveButton.commit\(\)`/}]},
        {code: 'await settings.saveButton.locator.click();', options: withIndex, errors: 1},
        {code: 'await settings.clickSaveButton();', options: withIndex, errors: [{message: /`saveButton` saves/}]},
        {code: 'await settings.removeButton(channel.id).click();', options: withIndex, errors: [{message: /`removeButton` saves/}]},
        {code: 'await settings.headerTextbox.press("Enter");', options: withIndex, errors: [{message: /use `headerTextbox.submit\(\)`/}]},
        {code: 'await settings.saveButton.click();\nawait expect(settings.saveButton.locator).toBeDisabled();', options: withIndex, errors: 1},

        // without the generated index, by name
        {code: 'await modal.confirmDeleteButton.click();', errors: [{message: /`confirmDeleteButton` saves/}]},
        {code: 'await modal.clickCreateButton();', errors: [{message: /`createButton` saves/}]},
    ],
});

ruleTester.run('e2e-no-catalog-text', noCatalogText, {
    valid: [
        {code: 'await expect(x.titleText.locator).toHaveMessage(Msg.team_settings.title);', options: [{messages: {'team_settings.title': 'Team Settings'}}]},
        {code: 'await expect(x.locator).toHaveText("A message I posted");', options: [{messages: {'team_settings.title': 'Team Settings'}}]},
        {code: 'await composer.fill("Team Settings"); await expect(post.locator).toHaveText("Team Settings");', options: [{messages: {'team_settings.title': 'Team Settings'}}]},
        {code: 'await expect(x.locator).toContainText("Settings");', options: [{messages: {'team_settings.title': 'Team Settings'}}]},
        {code: 'page.getByRole("button", {name: "Team Settings"});', options: [{messages: {'team_settings.title': 'Team Settings'}}]},
        {code: 'await expect(x.locator).toHaveText("1");', options: [{messages: {count: '{count}'}}]},
        {code: 'await expect(x.locator).toHaveValue("Team Settings");', options: [{messages: {'team_settings.title': 'Team Settings'}}]},
    ],
    invalid: [
        {
            code: 'await expect(x.titleText.locator).toHaveText("Team Settings");',
            options: [{messages: {'team_settings.title': 'Team Settings'}}],
            errors: [{message: '"Team Settings" is catalog text: assert `Msg.team_settings.title` with `toHaveMessage` / `toContainMessage` (or `formatMessage`).'}],
        },
        {
            code: 'await expect(x.locator).toHaveText(["Save", "Cancel"]);',
            options: [{messages: {'a.save': 'Save', 'b.save': 'Save', 'a.cancel': 'Cancel'}}],
            errors: [{message: /one of `Msg.a.save`, `Msg.b.save`/}, {message: /`Msg.a.cancel`/}],
        },
        {
            code: 'await expect(x.locator).toHaveText("Click Save to continue");',
            options: [{messages: {'x.help': 'Click <b>Save</b> to continue'}}],
            errors: [{message: /`Msg.x.help`/}],
        },
        {
            code: 'await expect(x.locator).toHaveText("3 members in this channel");',
            options: [{messages: {'x.members': '{count, plural, one {# member} other {# members}} in this channel'}}],
            errors: [{message: /fills the catalog message `Msg.x.members`/}],
        },
        {
            code: 'const TITLE = "Team Settings"; await expect(x.locator).toHaveAccessibleName(TITLE);',
            options: [{messages: {'team_settings.title': 'Team Settings'}}],
            errors: 1,
        },
        {
            code: 'await expect(x.locator).toHaveAttribute("placeholder", "Search channels");',
            options: [{messages: {'search.placeholder': 'Search channels'}}],
            errors: 1,
        },
        {
            code: 'expect(await x.titleText.text()).toBe("Team Settings");',
            options: [{messages: {'team_settings.title': 'Team Settings'}}],
            errors: 1,
        },
        {
            code: 'page.getByRole("button", {name: "Team Settings"}); rows.filter({hasText: "Team Settings"});',
            options: [{messages: {'team_settings.title': 'Team Settings'}, locators: true}],
            errors: 2,
        },
    ],
});

ruleTester.run('e2e-no-instant-check', noInstantCheck, {
    valid: [
        {code: 'await x.saveButton.click();\nawait expect(x.saveButton.locator).toBeDisabled();'},
        {code: 'const n = await x.locator.count();\nexpect(n).toBe(3);'},
        {code: 'await x.saveButton.click();\nawait expect.poll(() => x.locator.count()).toBe(2);'},
        {code: 'await x.saveButton.click();\nexpect(watcher.isVisible()).toBe(true);'},
    ],
    invalid: [
        {code: 'await x.saveButton.click();\nexpect(await x.saveButton.locator.isDisabled()).toBe(true);', errors: [{message: /`isDisabled\(\)` reads the state once.*toBeDisabled\(\)/}]},
        {code: 'await x.agreeCheckbox.check();\nexpect(await x.agreeCheckbox.isChecked()).toBe(true);', errors: [{message: /toBeChecked/}]},
        {code: 'await x.nameTextbox.fill("a");\nexpect(await x.nameTextbox.locator.inputValue()).not.toBe("");', errors: [{message: /toHaveValue/}]},
        {code: 'await app.clickSaveButton();\nexpect(await rows.count()).toBeGreaterThan(0);', errors: [{message: /toHaveCount/}]},
        {code: 'await expect(x.locator).toBeVisible();\nexpect(await x.dropdown.isDisabled()).toBe(true);\nexpect(await x.input.isDisabled()).toBe(true);', errors: 2},
    ],
});

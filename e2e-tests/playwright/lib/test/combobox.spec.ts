// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@playwright/test';

import {drivers} from '../src/aria/drivers';

import {metaOf, serve} from './serve';

/**
 * Two react-select-like comboboxes whose menus are both open and offer the same option text: the input names its menu
 * with aria-controls once open (the menu sits in a portal, outside the combobox), and choosing writes the result.
 */
const twoSelects = `
<div data-testid="x.first--combobox"><input role="combobox" aria-expanded="false" id="in1" data-menu="menu1"></div>
<div data-testid="x.second--combobox"><input role="combobox" aria-expanded="false" id="in2" data-menu="menu2"></div>
<output id="result"></output>
<div id="portal">
    <div role="listbox" id="menu1" hidden>
        <div role="option" onclick="document.getElementById('result').textContent = 'first:' + this.textContent">Alpha</div>
        <div role="option" onclick="document.getElementById('result').textContent = 'first:' + this.textContent">Beta</div>
    </div>
    <div role="listbox" id="menu2" hidden>
        <div role="option" onclick="document.getElementById('result').textContent = 'second:' + this.textContent">Alpha</div>
        <div role="option" onclick="document.getElementById('result').textContent = 'second:' + this.textContent">Gamma</div>
    </div>
</div>
<script>
    for (const input of document.querySelectorAll('input[role=combobox]')) {
        input.addEventListener('keydown', (e) => {
            if (e.key !== 'ArrowDown') return;
            // the menu opens a render later, and then the input names it
            setTimeout(() => {
                document.getElementById(input.dataset.menu).hidden = false;
                input.setAttribute('aria-expanded', 'true');
                input.setAttribute('aria-controls', input.dataset.menu);
            }, 50);
        });
    }
</script>`;

test.describe('ComboboxDriver.choose', () => {
    test("picks the option from the element's own list, not another open list", async ({page}) => {
        await serve(page, twoSelects);

        // the first list is open too, and holds an option with the same text
        await page.locator('#in1').press('ArrowDown');
        await expect(page.locator('#menu1')).toBeVisible();

        const second = drivers.combobox(
            page.getByTestId('x.second--combobox'),
            metaOf('x.second--combobox', 'combobox', []),
        );
        await second.choose('Alpha');
        await expect(page.locator('#result')).toHaveText('second:Alpha');
    });

    test('lists the options when none matches', async ({page}) => {
        await serve(page, twoSelects);
        const first = drivers.combobox(
            page.getByTestId('x.first--combobox'),
            metaOf('x.first--combobox', 'combobox', []),
        );
        const error = await first.choose(/Delta/).catch((e) => e);
        expect(error.message).toContain('no option of "x.first--combobox" matches /Delta/; options: "Alpha", "Beta"');
        expect(error.message).toContain('element: x.first--combobox (test/fixture.tsx#x)');
    });

    test('a listbox chooses among its own options', async ({page}) => {
        await serve(
            page,
            `<div role="listbox" data-testid="x.list--listbox">
                <div role="option" onclick="this.setAttribute('aria-selected', 'true')">One</div>
                <div role="option">Two</div>
            </div>
            <select><option>One</option></select>`,
        );
        const list = drivers.listbox(page.getByTestId('x.list--listbox'), metaOf('x.list--listbox', 'listbox', []));
        await list.choose('One');
        await expect(page.getByRole('option', {name: 'One'}).first()).toHaveAttribute('aria-selected', 'true');
    });

    test('a native select picks by label, and lists its options when a pattern matches none', async ({page}) => {
        await serve(
            page,
            '<select data-testid="x.size--combobox"><option value="s">Small</option><option value="l">Large</option></select>',
        );
        const select = drivers.combobox(
            page.getByTestId('x.size--combobox'),
            metaOf('x.size--combobox', 'combobox', []),
        );
        await select.choose(/large/i);
        await expect(select.locator).toHaveValue('l');
        await select.choose('Small');
        await expect(select.locator).toHaveValue('s');

        const started = Date.now();
        const error = await select.choose(/medium/).catch((e) => e);
        expect(error.message).toContain('no option of "x.size--combobox" matches /medium/; options: "Small", "Large"');
        expect(Date.now() - started).toBeGreaterThan(5_000);
    });

    test('without aria-controls, the first visible match on the page', async ({page}) => {
        await serve(
            page,
            `<div data-testid="x.plain--combobox"><input role="combobox" aria-expanded="true"></div>
             <div role="listbox"><div role="option" onclick="this.dataset.chosen = 'yes'">Only</div></div>`,
        );
        const plain = drivers.combobox(
            page.getByTestId('x.plain--combobox'),
            metaOf('x.plain--combobox', 'combobox', []),
        );
        await plain.choose('Only');
        await expect(page.getByRole('option', {name: 'Only'})).toHaveAttribute('data-chosen', 'yes');
    });
});

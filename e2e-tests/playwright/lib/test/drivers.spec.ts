// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {test, expect as baseExpect} from '@playwright/test';

import {drivers} from '../src/aria/drivers';
import {expect} from '../src/aria/matchers';

import {metaOf, serve} from './serve';

const meta = (testId: string, role: string) => metaOf(testId, role, []);

test.describe('state-setting drivers check the new state', () => {
    test('a native switch turns on and off, and toBeOn reads its checked state', async ({page}) => {
        await serve(
            page,
            '<label><input type="checkbox" role="switch" data-testid="x.notify--switch" style="opacity:0;position:absolute"> Notify</label>',
        );
        const sw = drivers.switch(page.getByTestId('x.notify--switch'), meta('x.notify--switch', 'switch'));
        await sw.turnOn();
        await expect(sw).toBeOn();
        await sw.turnOn();
        await expect(sw).toBeOn();
        await sw.set(false);
        await expect(sw).not.toBeOn();
    });

    test('an aria switch works with toBeOn', async ({page}) => {
        await serve(
            page,
            '<button role="switch" aria-checked="false" data-testid="x.dark--switch" onclick="this.setAttribute(\'aria-checked\', String(this.getAttribute(\'aria-checked\') !== \'true\'))">Dark</button>',
        );
        const sw = drivers.switch(page.getByTestId('x.dark--switch'), meta('x.dark--switch', 'switch'));
        await sw.turnOn();
        await expect(sw).toBeOn();
        await sw.turnOff();
        await expect(sw).not.toBeOn();
    });

    test('a switch whose state never changes fails, naming the element', async ({page}) => {
        await serve(
            page,
            '<input type="checkbox" role="switch" data-testid="x.stuck--switch" onclick="event.preventDefault()">',
        );
        const sw = drivers.switch(page.getByTestId('x.stuck--switch'), meta('x.stuck--switch', 'switch'));
        const error = await sw.turnOn().catch((e) => e);
        baseExpect(error.message).toContain('element: x.stuck--switch (test/fixture.tsx#x)');
        baseExpect(error.message).toMatch(/toBeChecked/);
    });

    test('a switch whose state arrives late is waited for', async ({page}) => {
        await serve(
            page,
            '<button role="switch" aria-checked="false" data-testid="x.slow--switch" onclick="setTimeout(() => this.setAttribute(\'aria-checked\', \'true\'), 500)">Slow</button>',
        );
        const sw = drivers.switch(page.getByTestId('x.slow--switch'), meta('x.slow--switch', 'switch'));
        await sw.turnOn();
        baseExpect(await sw.isOn()).toBe(true);
    });

    test('a switch beside a <label for> whose id needs escaping', async ({page}) => {
        await serve(
            page,
            '<input type="checkbox" role="switch" id=\'a"b\\c\' data-testid="x.labelled--switch" style="pointer-events:none"><label for=\'a"b\\c\'>Labelled</label>',
        );
        const sw = drivers.switch(page.getByTestId('x.labelled--switch'), meta('x.labelled--switch', 'switch'));
        await sw.turnOn();
        await expect(sw).toBeOn();
    });

    test('a toggle button sets aria-pressed, and checks it', async ({page}) => {
        await serve(
            page,
            `<button aria-pressed="false" data-testid="x.bold--togglebutton" onclick="this.setAttribute('aria-pressed', String(this.getAttribute('aria-pressed') !== 'true'))">B</button>
             <button aria-pressed="false" data-testid="x.stuck--togglebutton">S</button>`,
        );
        const bold = drivers.togglebutton(
            page.getByTestId('x.bold--togglebutton'),
            meta('x.bold--togglebutton', 'togglebutton'),
        );
        await bold.setPressed(true);
        await expect(bold).toBePressed();
        await bold.setPressed(true);
        await expect(bold).toBePressed();

        await bold.setPressed(false);
        await expect(bold).not.toBePressed();

        // a key press, like every driver
        await bold.press('Enter');
        await expect(bold).toBePressed();

        const stuck = drivers.togglebutton(
            page.getByTestId('x.stuck--togglebutton'),
            meta('x.stuck--togglebutton', 'togglebutton'),
        );
        const error = await stuck.setPressed(true).catch((e) => e);
        baseExpect(error.message).toContain('aria-pressed');
        baseExpect(error.message).toContain('element: x.stuck--togglebutton (test/fixture.tsx#x)');
    });

    test('a radio group chooses by name, and lists its radios when none matches', async ({page}) => {
        await serve(
            page,
            `<div role="radiogroup" data-testid="x.mode--radiogroup">
                <label><input type="radio" name="m" value="on"> Yes</label>
                <label><input type="radio" name="m" value="off"> No</label>
            </div>`,
        );
        const group = drivers.radiogroup(
            page.getByTestId('x.mode--radiogroup'),
            meta('x.mode--radiogroup', 'radiogroup'),
        );
        await group.choose('No');
        baseExpect(await group.isChosen('No')).toBe(true);
        await group.choose(/yes/i);
        baseExpect(await group.isChosen('Yes')).toBe(true);
        const error = await group.choose('Maybe').catch((e) => e);
        baseExpect(error.message).toContain('no radio of "x.mode--radiogroup" matches Maybe');
        baseExpect(error.message).toContain('Yes');
    });
});

test.describe('every driver', () => {
    test('can hover, focus, press and blur', async ({page}) => {
        await serve(
            page,
            `<div tabindex="0" data-testid="x.row" onmouseenter="this.dataset.hovered = 'yes'" onkeydown="this.dataset.key = event.key"
                 onblur="this.dataset.blurred = 'yes'">Row</div>`,
        );
        const row = drivers.container(page.getByTestId('x.row'), meta('x.row', 'container'));
        await row.hover();
        await baseExpect(row.locator).toHaveAttribute('data-hovered', 'yes');
        await row.focus();
        await baseExpect(row.locator).toBeFocused();
        await row.press('Escape');
        await baseExpect(row.locator).toHaveAttribute('data-key', 'Escape');
        await row.blur();
        await baseExpect(row.locator).toHaveAttribute('data-blurred', 'yes');
    });

    test('failures name the testid and the source', async ({page}) => {
        await serve(page, '<p>nothing here</p>');
        const missing = drivers.button(page.getByTestId('x.gone--button'), {
            ...meta('x.gone--button', 'button'),
            source: 'channels/src/components/gone.tsx:12',
        });
        const error = await missing.click().catch((e) => e);
        baseExpect(error.message).toContain('element: x.gone--button (channels/src/components/gone.tsx:12)');
        baseExpect(error.stack).toContain('element: x.gone--button');

        const matcher = await expect(missing)
            .toBePressed({timeout: 200})
            .catch((e) => e);
        baseExpect(matcher.message).toContain('element: x.gone--button (channels/src/components/gone.tsx:12)');

        // render conditions, when the metadata has them
        const conditional = drivers.button(page.getByTestId('x.hint--button'), {
            ...meta('x.hint--button', 'button'),
            when: 'showSearchHintToast',
        });
        const hidden = await conditional.click().catch((e) => e);
        baseExpect(hidden.message).toContain(
            'element: x.hint--button (test/fixture.tsx#x); renders only when showSearchHintToast',
        );
    });
});

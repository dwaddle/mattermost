// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator, Page} from '@playwright/test';

import type {Meta} from './effects';

/**
 * A driver operates one ARIA pattern (button, switch, tabs…). Generated page objects return a driver
 * bound to an element's locator, carrying the element's metadata (testid, role, effects, source).
 * Drivers read state from ARIA attributes, never from CSS classes, and never assert or wait on their own.
 */
export class Driver<M extends Meta = Meta> {
    readonly locator: Locator;
    readonly meta: M;

    constructor(locator: Locator, meta: M) {
        this.locator = locator;
        this.meta = meta;
    }

    get page(): Page {
        return this.locator.page();
    }

    isVisible(): Promise<boolean> {
        return this.locator.isVisible();
    }

    async isDisabled(): Promise<boolean> {
        if (await this.locator.isDisabled()) {
            return true;
        }
        return (await this.locator.getAttribute('aria-disabled')) === 'true';
    }

    scrollIntoView(): Promise<void> {
        return this.locator.scrollIntoViewIfNeeded();
    }
}

/** Container (no role): a region of the page. */
export class ContainerDriver<M extends Meta = Meta> extends Driver<M> {}

/** button, link, menuitem: things you click. */
export class ButtonDriver<M extends Meta = Meta> extends Driver<M> {
    click(): Promise<void> {
        return this.locator.click();
    }

    hover(): Promise<void> {
        return this.locator.hover();
    }
}

export class LinkDriver<M extends Meta = Meta> extends ButtonDriver<M> {
    href(): Promise<string | null> {
        return this.locator.getAttribute('href');
    }
}

export class MenuitemDriver<M extends Meta = Meta> extends ButtonDriver<M> {}

/** menuitemcheckbox / menuitemradio: a menu item with aria-checked. */
export class MenuitemCheckDriver<M extends Meta = Meta> extends ButtonDriver<M> {
    async isChecked(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-checked')) === 'true';
    }
}

/** A button with aria-pressed. */
export class TogglebuttonDriver<M extends Meta = Meta> extends Driver<M> {
    async isPressed(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-pressed')) === 'true';
    }

    /** Clicks only when the toggle isn't already in the wanted state. */
    async press(on = true): Promise<void> {
        if ((await this.isPressed()) !== on) {
            await this.locator.click();
        }
    }

    turnOn(): Promise<void> {
        return this.press(true);
    }

    turnOff(): Promise<void> {
        return this.press(false);
    }

    toggle(): Promise<void> {
        return this.locator.click();
    }
}

/** role="switch": aria-checked, or a native checkbox's checked state. */
export class SwitchDriver<M extends Meta = Meta> extends Driver<M> {
    isOn(): Promise<boolean> {
        return this.locator.isChecked();
    }

    async turnOn(): Promise<void> {
        if (!(await this.isOn())) {
            await this.toggle();
        }
    }

    async turnOff(): Promise<void> {
        if (await this.isOn()) {
            await this.toggle();
        }
    }

    /**
     * Flips the switch. A native switch is often a visually hidden input inside its <label>, or beside a
     * <label for> (compass's Switch), and the label takes the pointer.
     */
    async toggle(): Promise<void> {
        const label = this.locator.locator('xpath=ancestor::label[1]');
        if (await label.count()) {
            await label.click();
            return;
        }
        const id = await this.locator.getAttribute('id');
        const labelFor = id ? this.locator.page().locator(`label[for="${id}"]`) : null;
        if (labelFor && (await labelFor.count())) {
            await labelFor.click();
        } else {
            await this.locator.click();
        }
    }

    set(on: boolean): Promise<void> {
        return on ? this.turnOn() : this.turnOff();
    }
}

/** Native checkbox or role="checkbox". */
export class CheckboxDriver<M extends Meta = Meta> extends Driver<M> {
    isChecked(): Promise<boolean> {
        return this.locator.isChecked();
    }

    check(): Promise<void> {
        return this.locator.check();
    }

    uncheck(): Promise<void> {
        return this.locator.uncheck();
    }

    set(checked: boolean): Promise<void> {
        return this.locator.setChecked(checked);
    }
}

export class RadioDriver<M extends Meta = Meta> extends CheckboxDriver<M> {}

/** textbox / searchbox: inputs, textareas and contenteditable editors. */
export class TextboxDriver<M extends Meta = Meta> extends Driver<M> {
    fill(value: string): Promise<void> {
        return this.locator.fill(value);
    }

    clear(): Promise<void> {
        return this.locator.clear();
    }

    /** Types like a user (fires key events per character), for inputs that react to keystrokes. */
    type(value: string): Promise<void> {
        return this.locator.pressSequentially(value);
    }

    press(key: string): Promise<void> {
        return this.locator.press(key);
    }

    focus(): Promise<void> {
        return this.locator.focus();
    }

    async value(): Promise<string> {
        const editable = await this.locator.getAttribute('contenteditable');
        return editable === 'true' ? this.locator.innerText() : this.locator.inputValue();
    }
}

/** role="tab" with aria-selected. */
export class TabDriver<M extends Meta = Meta> extends Driver<M> {
    select(): Promise<void> {
        return this.locator.click();
    }

    async isSelected(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-selected')) === 'true';
    }
}

/** combobox / listbox: choose an option by its visible text. */
export class ComboboxDriver<M extends Meta = Meta> extends Driver<M> {
    async choose(option: string | RegExp): Promise<void> {
        // A native <select> has no clickable options; pick by label instead.
        if (await this.locator.evaluate((el) => el.tagName === 'SELECT')) {
            const labels = await this.locator.locator('option').allInnerTexts();
            const label = typeof option === 'string' ? option : labels.find((text) => option.test(text));
            await this.locator.selectOption({label: label ?? String(option)});
            return;
        }
        // Open the list from the keyboard rather than by clicking: a select's placeholder (react-select) can sit over
        // its input and take the click. A listbox is already open.
        if (this.meta.role !== 'listbox' && !(await this.isExpanded())) {
            await this.locator.focus();
            await this.locator.press('ArrowDown');
        }
        // Only the visible options: another select on the page can hold a native <option> with the same text.
        await this.page
            .getByRole('option', {name: option, exact: typeof option === 'string'})
            .filter({visible: true})
            .first()
            .click();
    }

    async isExpanded(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-expanded')) === 'true';
    }
}

/** Read-only content (`--text`) and anything else with a role we don't operate. */
export class TextDriver<M extends Meta = Meta> extends Driver<M> {
    text(): Promise<string> {
        return this.locator.innerText();
    }

    /** The text, or `null` when the element isn't rendered (doesn't wait for it). */
    async textIfPresent(): Promise<string | null> {
        return (await this.locator.count()) ? this.locator.innerText() : null;
    }
}

/** role="option" in a listbox or a select's menu: read like text, and selected by clicking. */
export class OptionDriver<M extends Meta = Meta> extends TextDriver<M> {
    select(): Promise<void> {
        return this.locator.click();
    }

    async isSelected(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-selected')) === 'true';
    }
}

/** One factory per role suffix; the generator calls these from element getters. */
export const drivers = {
    container: <const M extends Meta>(locator: Locator, meta: M) => new ContainerDriver<M>(locator, meta),
    button: <const M extends Meta>(locator: Locator, meta: M) => new ButtonDriver<M>(locator, meta),
    link: <const M extends Meta>(locator: Locator, meta: M) => new LinkDriver<M>(locator, meta),
    menuitem: <const M extends Meta>(locator: Locator, meta: M) => new MenuitemDriver<M>(locator, meta),
    menuitemcheckbox: <const M extends Meta>(locator: Locator, meta: M) => new MenuitemCheckDriver<M>(locator, meta),
    menuitemradio: <const M extends Meta>(locator: Locator, meta: M) => new MenuitemCheckDriver<M>(locator, meta),
    togglebutton: <const M extends Meta>(locator: Locator, meta: M) => new TogglebuttonDriver<M>(locator, meta),
    switch: <const M extends Meta>(locator: Locator, meta: M) => new SwitchDriver<M>(locator, meta),
    checkbox: <const M extends Meta>(locator: Locator, meta: M) => new CheckboxDriver<M>(locator, meta),
    radio: <const M extends Meta>(locator: Locator, meta: M) => new RadioDriver<M>(locator, meta),
    textbox: <const M extends Meta>(locator: Locator, meta: M) => new TextboxDriver<M>(locator, meta),
    searchbox: <const M extends Meta>(locator: Locator, meta: M) => new TextboxDriver<M>(locator, meta),
    tab: <const M extends Meta>(locator: Locator, meta: M) => new TabDriver<M>(locator, meta),
    combobox: <const M extends Meta>(locator: Locator, meta: M) => new ComboboxDriver<M>(locator, meta),
    listbox: <const M extends Meta>(locator: Locator, meta: M) => new ComboboxDriver<M>(locator, meta),
    option: <const M extends Meta>(locator: Locator, meta: M) => new OptionDriver<M>(locator, meta),
    text: <const M extends Meta>(locator: Locator, meta: M) => new TextDriver<M>(locator, meta),
};

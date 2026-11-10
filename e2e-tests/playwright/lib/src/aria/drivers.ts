// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator, Page} from '@playwright/test';
import {expect as baseExpect} from '@playwright/test';

import type {BodyOf, Effect, Meta, PathParamsOf} from './effects';
import {
    type AnyOptions,
    type EffectOf,
    type Element,
    type Known,
    type Multi,
    type SettleOptions,
    type Single,
    type Unknown,
    type Unlisted,
    type WaitFor,
    settle,
} from './settle';

type AnyEffect = Effect<unknown, string, string>;

/** How long `choose` waits for a matching option to show before listing the ones it found. */
const OPTION_TIMEOUT = 10_000;

/**
 * A driver operates one ARIA pattern (button, switch, tabs…). Generated page objects return a driver
 * bound to an element's locator, carrying the element's metadata (testid, role, effects, source).
 * Drivers read state from ARIA attributes, never from CSS classes. They don't wait before acting (Playwright's
 * actions wait for the element), but a method that sets state (`turnOn`, `setPressed`, `set`) checks the state
 * changed, and every failure names the element's testid and where it is emitted.
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
        return this.act(() => this.locator.scrollIntoViewIfNeeded());
    }

    hover(): Promise<void> {
        return this.act(() => this.locator.hover());
    }

    /** Presses a key (or a chord, `Control+Enter`) with the element focused. */
    press(key: string): Promise<void> {
        return this.act(() => this.locator.press(key));
    }

    focus(): Promise<void> {
        return this.act(() => this.locator.focus());
    }

    blur(): Promise<void> {
        return this.act(() => this.locator.blur());
    }

    /** Runs a step on the element; a failure says which element (its testid and source). */
    protected async act<T>(step: () => Promise<T>): Promise<T> {
        try {
            return await step();
        } catch (e) {
            throw withElement(e, this.meta);
        }
    }
}

/**
 * Adds the element's testid and source to an error (once), keeping its type and stack. For drivers, matchers and
 * page objects that report on an element.
 */
export function withElement(e: unknown, meta: ElementInfo): unknown {
    if (!(e instanceof Error)) {
        return e;
    }
    const line = elementLine(meta);
    if (!e.message.includes(line)) {
        const before = e.message;
        e.message = `${before}\n${line}`;
        if (e.stack?.includes(before)) {
            e.stack = e.stack.replace(before, e.message);
        }
    }
    return e;
}

/** What failures say about an element. */
export type ElementInfo = Pick<Meta, 'testId' | 'source' | 'when'>;

/**
 * `  element: center.post_create.send--button (channels/src/…/file.tsx#Component)` (or `file.tsx:51`, before manifest
 * v2), plus `; renders only when …` when the metadata has render conditions.
 */
export function elementLine(meta: ElementInfo): string {
    return `  element: ${meta.testId} (${meta.source})${meta.when ? `; renders only when ${meta.when}` : ''}`;
}

/** Container (no role): a region of the page. */
export class ContainerDriver<M extends Meta = Meta> extends Driver<M> {}

/** button, link, menuitem: things you click. */
export class ButtonDriver<M extends Meta = Meta> extends Driver<M> {
    click(): Promise<void> {
        return this.act(() => this.locator.click());
    }

    /**
     * Clicks and waits for the save the element declares (its `meta.effects`), returning the response body: the
     * explicit "click and wait until done" for buttons that save. One effect: no option needed. Several, or unknown:
     * `wait` names the request. None: doesn't compile (assert with a matcher, or `{wait, unlisted: true}` for a
     * request the scanner missed). See `settle` for what is waited for.
     *
     *   const channel = await settings.savePanel.saveButton.commit();
     *   const post = await composer.sendButton.commit({wait: Api.CreatePost});
     */
    commit<D extends Single>(
        this: D,
        opts?: SettleOptions & {wait?: EffectOf<D>; params?: PathParamsOf<EffectOf<D>>},
    ): Promise<BodyOf<EffectOf<D>>>;
    commit<D extends Multi, W extends D['meta']['effects'][number]>(
        this: D,
        opts: SettleOptions & WaitFor<W>,
    ): Promise<BodyOf<W>>;
    commit<D extends Unknown, W extends AnyEffect>(this: D, opts: SettleOptions & WaitFor<W>): Promise<BodyOf<W>>;
    commit<D extends Known, W extends D['meta']['effects'][number]>(
        this: D,
        opts: SettleOptions & WaitFor<W>,
    ): Promise<BodyOf<W>>;
    commit<D extends Element, W extends AnyEffect>(this: D, opts: SettleOptions & Unlisted<W>): Promise<BodyOf<W>>;
    commit(opts?: AnyOptions): Promise<unknown> {
        return settle(this as Element as Single, (b) => (b as unknown as ButtonDriver).click(), opts as any);
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

    /** Clicks only when the toggle isn't already in the wanted state, then checks it is. */
    setPressed(on = true): Promise<void> {
        return this.act(async () => {
            if ((await this.isPressed()) !== on) {
                await this.locator.click();
            }
            await baseExpect(this.locator, `${this.meta.testId} pressed=${on}`).toHaveAttribute(
                'aria-pressed',
                String(on),
            );
        });
    }

    turnOn(): Promise<void> {
        return this.setPressed(true);
    }

    turnOff(): Promise<void> {
        return this.setPressed(false);
    }

    /** One click, whatever the state (doesn't check the result: use `setPressed` for a known end state). */
    toggle(): Promise<void> {
        return this.act(() => this.locator.click());
    }
}

/** role="switch": aria-checked, or a native checkbox's checked state. */
export class SwitchDriver<M extends Meta = Meta> extends Driver<M> {
    isOn(): Promise<boolean> {
        return this.locator.isChecked();
    }

    turnOn(): Promise<void> {
        return this.set(true);
    }

    turnOff(): Promise<void> {
        return this.set(false);
    }

    /**
     * Flips the switch, whatever its state (doesn't check the result: use `set` for a known end state). A native
     * switch is often a visually hidden input inside its <label>, or beside a <label for> (compass's Switch), and the
     * label takes the pointer.
     */
    toggle(): Promise<void> {
        return this.act(async () => {
            const label = this.locator.locator('xpath=ancestor::label[1]');
            if (await label.count()) {
                await label.click();
                return;
            }
            const id = await this.locator.getAttribute('id');
            const labelFor = id ? this.page.locator(`label[for="${cssString(id)}"]`) : null;
            if (labelFor && (await labelFor.count())) {
                await labelFor.click();
            } else {
                await this.locator.click();
            }
        });
    }

    /** Flips the switch only when it isn't already in the wanted state, then checks it is. */
    set(on: boolean): Promise<void> {
        return this.act(async () => {
            if ((await this.isOn()) !== on) {
                await this.toggle();
            }
            await baseExpect(this.locator, `${this.meta.testId} on=${on}`).toBeChecked({checked: on});
        });
    }
}

/** Native checkbox or role="checkbox". */
export class CheckboxDriver<M extends Meta = Meta> extends Driver<M> {
    isChecked(): Promise<boolean> {
        return this.locator.isChecked();
    }

    /** `check`, `uncheck` and `set` check the state changed (Playwright's `setChecked` does). */
    check(): Promise<void> {
        return this.act(() => this.locator.check());
    }

    uncheck(): Promise<void> {
        return this.act(() => this.locator.uncheck());
    }

    set(checked: boolean): Promise<void> {
        return this.act(() => this.locator.setChecked(checked));
    }
}

export class RadioDriver<M extends Meta = Meta> extends CheckboxDriver<M> {}

/** role="radiogroup": one of its radios, by accessible name. */
export class RadiogroupDriver<M extends Meta = Meta> extends Driver<M> {
    /** A radio of the group by its accessible name (exact for a string). */
    radio(option: string | RegExp): Locator {
        return this.locator.getByRole('radio', {name: option, exact: typeof option === 'string'});
    }

    /** Checks the radio named `option` (and that it's checked); lists the radios when none matches. */
    choose(option: string | RegExp): Promise<void> {
        return this.act(async () => {
            const radio = this.radio(option);
            try {
                await radio.waitFor({state: 'attached', timeout: OPTION_TIMEOUT});
            } catch {
                const names = await this.locator
                    .getByRole('radio')
                    .evaluateAll((els) =>
                        els.map(
                            (el) =>
                                el.getAttribute('aria-label') ??
                                el.closest('label')?.textContent ??
                                el.getAttribute('value') ??
                                '',
                        ),
                    );
                throw new Error(
                    `choose: no radio of "${this.meta.testId}" matches ${String(option)}; radios: ${listOf(names)}`,
                );
            }
            await radio.check();
        });
    }

    /** Whether the radio named `option` is checked. */
    isChosen(option: string | RegExp): Promise<boolean> {
        return this.radio(option).isChecked();
    }
}

/** textbox / searchbox: inputs, textareas and contenteditable editors. */
export class TextboxDriver<M extends Meta = Meta> extends Driver<M> {
    fill(value: string): Promise<void> {
        return this.act(() => this.locator.fill(value));
    }

    clear(): Promise<void> {
        return this.act(() => this.locator.clear());
    }

    /** Types like a user (fires key events per character), for inputs that react to keystrokes. */
    type(value: string): Promise<void> {
        return this.act(() => this.locator.pressSequentially(value));
    }

    async value(): Promise<string> {
        const editable = await this.locator.getAttribute('contenteditable');
        return editable === 'true' ? this.locator.innerText() : this.locator.inputValue();
    }

    /**
     * Presses `key` (Enter) and waits for the save the textbox declares, returning the response body: `commit()` for
     * inputs that save on a key. `wait` names the request when the textbox can fire several (see `ButtonDriver.commit`).
     *
     *   const post = await composer.messageTextbox.submit('Enter', {wait: Api.CreatePost});
     */
    submit<D extends Single>(
        this: D,
        key?: string,
        opts?: SettleOptions & {wait?: EffectOf<D>; params?: PathParamsOf<EffectOf<D>>},
    ): Promise<BodyOf<EffectOf<D>>>;
    submit<D extends Multi, W extends D['meta']['effects'][number]>(
        this: D,
        key: string,
        opts: SettleOptions & WaitFor<W>,
    ): Promise<BodyOf<W>>;
    submit<D extends Unknown, W extends AnyEffect>(
        this: D,
        key: string,
        opts: SettleOptions & WaitFor<W>,
    ): Promise<BodyOf<W>>;
    submit<D extends Known, W extends D['meta']['effects'][number]>(
        this: D,
        key: string,
        opts: SettleOptions & WaitFor<W>,
    ): Promise<BodyOf<W>>;
    submit<D extends Element, W extends AnyEffect>(
        this: D,
        key: string,
        opts: SettleOptions & Unlisted<W>,
    ): Promise<BodyOf<W>>;
    submit(key = 'Enter', opts?: AnyOptions): Promise<unknown> {
        return settle(this as Element as Single, (t) => (t as unknown as TextboxDriver).press(key), opts as any);
    }
}

/** role="tab" with aria-selected. */
export class TabDriver<M extends Meta = Meta> extends Driver<M> {
    select(): Promise<void> {
        return this.act(() => this.locator.click());
    }

    async isSelected(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-selected')) === 'true';
    }
}

/** combobox / listbox: choose an option by its visible text. */
export class ComboboxDriver<M extends Meta = Meta> extends Driver<M> {
    choose(option: string | RegExp): Promise<void> {
        return this.act(async () => {
            if (await this.locator.evaluate((el) => el.tagName === 'SELECT')) {
                await this.chooseNative(option);
                return;
            }

            // Open the list from the keyboard rather than by clicking: a select's placeholder (react-select) can sit
            // over its input and take the click. A listbox is already open.
            // (on the element's input when the testid is on a wrapper, like react-select's container)
            if (this.meta.role !== 'listbox') {
                const input = this.locator
                    .locator('xpath=descendant-or-self::*[self::input or @role="combobox"]')
                    .first();
                const target = (await input.count()) ? input : this.locator;
                if ((await target.getAttribute('aria-expanded')) !== 'true' && !(await this.isExpanded())) {
                    await target.focus();
                    await target.press('ArrowDown');
                }
            }

            // The options of this element's own list: a listbox's children, or the list its aria-controls names
            // (react-select renders it in a portal). Only the visible ones: another select on the page can hold a
            // native <option> with the same text. Without aria-controls, the first visible match on the page.
            const host = await this.optionsHost();
            const matching = (host ?? this.page.locator(':root'))
                .getByRole('option', {name: option, exact: typeof option === 'string'})
                .filter({visible: true});
            const target = host ? matching : matching.first();
            try {
                await target.first().waitFor({state: 'visible', timeout: OPTION_TIMEOUT});
            } catch {
                const labels = await (host ?? this.page.locator(':root'))
                    .getByRole('option')
                    .filter({visible: true})
                    .allInnerTexts();
                throw new Error(
                    `choose: no option of "${this.meta.testId}" matches ${String(option)}; options: ${listOf(labels)}`,
                );
            }
            await target.click();
        });
    }

    async isExpanded(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-expanded')) === 'true';
    }

    /** A native <select>: pick by label (it has no clickable options). */
    private async chooseNative(option: string | RegExp): Promise<void> {
        if (typeof option === 'string') {
            await this.locator.selectOption({label: option});
            return;
        }
        // options can load after the select renders: look for a match for a while before giving up
        const deadline = Date.now() + OPTION_TIMEOUT;
        for (;;) {
            const labels = (await this.locator.locator('option').allInnerTexts()).map((text) => text.trim());
            const label = labels.find((text) => option.test(text));
            if (label !== undefined) {
                await this.locator.selectOption({label});
                return;
            }
            if (Date.now() > deadline) {
                throw new Error(
                    `choose: no option of "${this.meta.testId}" matches ${String(option)}; options: ${listOf(labels)}`,
                );
            }
            await new Promise((resolve) => setTimeout(resolve, 100));
        }
    }

    /** The element that holds this element's options, or null when it doesn't say (no aria-controls/aria-owns). */
    private async optionsHost(): Promise<Locator | null> {
        if (this.meta.role === 'listbox' || (await this.locator.getAttribute('role')) === 'listbox') {
            return this.locator;
        }
        // on the element, or on its input when the testid is on a wrapper (react-select's container)
        const owner = this.locator
            .locator('xpath=self::*[@aria-controls or @aria-owns] | descendant::*[@aria-controls or @aria-owns]')
            .first();
        try {
            // react-select sets aria-controls once the menu is open, a render after the key press
            await owner.waitFor({state: 'attached', timeout: 1000});
        } catch {
            return null;
        }
        const id = (await owner.getAttribute('aria-controls')) || (await owner.getAttribute('aria-owns'));
        const first = id?.trim().split(/\s+/)[0];
        return first ? this.page.locator(`[id="${cssString(first)}"]`) : null;
    }
}

/** Read-only content (`--text`) and anything else with a role we don't operate. */
export class TextDriver<M extends Meta = Meta> extends Driver<M> {
    text(): Promise<string> {
        return this.act(() => this.locator.innerText());
    }

    /** The text, or `null` when the element isn't rendered (doesn't wait for it). */
    async textIfPresent(): Promise<string | null> {
        return (await this.locator.count()) ? this.locator.innerText() : null;
    }
}

/** role="option" in a listbox or a select's menu: read like text, and selected by clicking. */
export class OptionDriver<M extends Meta = Meta> extends TextDriver<M> {
    select(): Promise<void> {
        return this.act(() => this.locator.click());
    }

    async isSelected(): Promise<boolean> {
        return (await this.locator.getAttribute('aria-selected')) === 'true';
    }
}

/** A string inside a CSS attribute selector's double quotes. */
function cssString(s: string): string {
    return s.replace(/["\\]/g, '\\$&');
}

function listOf(labels: string[]): string {
    const names = labels.map((l) => l.trim()).filter(Boolean);
    return names.length ? names.map((l) => `"${l}"`).join(', ') : '(none visible)';
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
    radiogroup: <const M extends Meta>(locator: Locator, meta: M) => new RadiogroupDriver<M>(locator, meta),
    textbox: <const M extends Meta>(locator: Locator, meta: M) => new TextboxDriver<M>(locator, meta),
    searchbox: <const M extends Meta>(locator: Locator, meta: M) => new TextboxDriver<M>(locator, meta),
    tab: <const M extends Meta>(locator: Locator, meta: M) => new TabDriver<M>(locator, meta),
    combobox: <const M extends Meta>(locator: Locator, meta: M) => new ComboboxDriver<M>(locator, meta),
    listbox: <const M extends Meta>(locator: Locator, meta: M) => new ComboboxDriver<M>(locator, meta),
    option: <const M extends Meta>(locator: Locator, meta: M) => new OptionDriver<M>(locator, meta),
    text: <const M extends Meta>(locator: Locator, meta: M) => new TextDriver<M>(locator, meta),
};

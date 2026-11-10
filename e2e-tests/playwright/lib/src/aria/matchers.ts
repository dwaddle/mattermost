// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {ExpectMatcherState, Locator} from '@playwright/test';
import {expect as baseExpect} from '@playwright/test';

import {expect as subpathExpect} from '../expect';

import {Driver, elementLine} from './drivers';
import type {Meta} from './effects';
import {formatMessage, type Message, type ParamsOf} from './msg';
import {Scope} from './scope';

type HasLocator = Driver | Scope | Locator;
type Options = {timeout?: number};

/** The element to assert on, and (for a driver) its metadata, so a failure says which element and where it comes from. */
function locatorOf(received: HasLocator): {locator: Locator; meta?: Pick<Meta, 'testId' | 'source'>} {
    if (received instanceof Driver) {
        return {locator: received.locator, meta: received.meta};
    }
    if (received instanceof Scope) {
        return {
            locator: received.locator,
            meta: {testId: received.scope, source: `class ${received.constructor.name}`},
        };
    }
    return {locator: received};
}

/** The line a failure ends with: the element's testid and source, when known. */
function where(meta?: Pick<Meta, 'testId' | 'source'>): string {
    return meta ? `\n${elementLine(meta)}` : '';
}

/**
 * Retrying matchers over driver state. They read the ARIA attribute the pattern requires and retry like
 * `toBeVisible()`, so tests never write `expect(await x.isOn()).toBe(true)`.
 */
// extends the subpath-aware expect (toHavePath, toHaveHrefPath), so tests get one expect with every matcher
export const expect = subpathExpect.extend({
    /** A switch or checkbox that is on: `aria-checked="true"`, or a native input's checked state (compass's Switch). */
    async toBeOn(this: ExpectMatcherState, received: HasLocator, options?: Options) {
        const {locator, meta} = locatorOf(received);
        try {
            await baseExpect(locator).toBeChecked({checked: !this.isNot, ...options});
            return {pass: !this.isNot, name: 'toBeOn', message: () => `toBeOn: is ${this.isNot ? 'off' : 'on'}`};
        } catch (e) {
            return {
                pass: this.isNot,
                name: 'toBeOn',
                message: () => `toBeOn: expected ${this.isNot ? 'off' : 'on'}${where(meta)}\n${(e as Error).message}`,
            };
        }
    },
    async toBePressed(this: ExpectMatcherState, received: HasLocator, options?: Options) {
        return attribute.call(this, 'toBePressed', locatorOf(received), 'aria-pressed', 'true', options);
    },
    async toBeSelected(this: ExpectMatcherState, received: HasLocator, options?: Options) {
        return attribute.call(this, 'toBeSelected', locatorOf(received), 'aria-selected', 'true', options);
    },
    async toBeExpanded(this: ExpectMatcherState, received: HasLocator, options?: Options) {
        return attribute.call(this, 'toBeExpanded', locatorOf(received), 'aria-expanded', 'true', options);
    },
    /**
     * A save button whose save has finished: disabled again and no longer busy. It's disabled while it saves too,
     * so `toBeDisabled()` alone passes mid-save, and a reload then drops the save.
     */
    async toBeSaved(this: ExpectMatcherState, received: HasLocator, options?: Options) {
        if (this.isNot) {
            throw new Error('not.toBeSaved() is ambiguous (unsaved, or still saving?): assert toBeEnabled() instead');
        }
        const {locator, meta} = locatorOf(received);
        try {
            await baseExpect(locator).toBeDisabled(options);
            await baseExpect(locator).not.toHaveAttribute('aria-busy', 'true', options);
            return {pass: true, name: 'toBeSaved', message: () => 'toBeSaved: disabled and not busy'};
        } catch (e) {
            return {
                pass: false,
                name: 'toBeSaved',
                message: () =>
                    `toBeSaved: expected the save to finish (disabled, not busy)${where(meta)}\n${(e as Error).message}`,
            };
        }
    },

    /** The element's text contains the catalog message, formatted with `values`. */
    async toContainMessage<M extends Message<any>>(
        this: ExpectMatcherState,
        received: HasLocator,
        message: M,
        values?: ParamsOf<M>,
        options?: Options,
    ) {
        return messageText.call(
            this,
            'toContainMessage',
            locatorOf(received),
            formatMessage(message, values),
            message.id,
            false,
            options,
        );
    },

    /** The element's whole text is the catalog message (where one message's text contains another's: "Follow" / "Following"). */
    async toHaveMessage<M extends Message<any>>(
        this: ExpectMatcherState,
        received: HasLocator,
        message: M,
        values?: ParamsOf<M>,
        options?: Options,
    ) {
        return messageText.call(
            this,
            'toHaveMessage',
            locatorOf(received),
            formatMessage(message, values),
            message.id,
            true,
            options,
        );
    },
});

async function attribute(
    this: ExpectMatcherState,
    name: string,
    {locator, meta}: ReturnType<typeof locatorOf>,
    attr: string,
    value: string,
    options?: Options,
) {
    try {
        if (this.isNot) {
            await baseExpect(locator).not.toHaveAttribute(attr, value, options);
        } else {
            await baseExpect(locator).toHaveAttribute(attr, value, options);
        }
        return {pass: !this.isNot, name, message: () => `${name}: ${attr} is ${this.isNot ? 'not ' : ''}"${value}"`};
    } catch (e) {
        return {
            pass: this.isNot,
            name,
            message: () =>
                `${name}: expected ${attr}${this.isNot ? ' not' : ''} to be "${value}"${where(meta)}\n${(e as Error).message}`,
        };
    }
}

async function messageText(
    this: ExpectMatcherState,
    name: string,
    {locator, meta}: ReturnType<typeof locatorOf>,
    text: string,
    id: string,
    exact: boolean,
    options?: Options,
) {
    const verb = exact ? 'have' : 'contain';
    try {
        const e = this.isNot ? baseExpect(locator).not : baseExpect(locator);
        await (exact ? e.toHaveText(text, options) : e.toContainText(text, options));
        return {
            pass: !this.isNot,
            name,
            message: () => `expected ${this.isNot ? 'not ' : ''}to ${verb} "${text}" (${id})`,
        };
    } catch (e) {
        return {
            pass: this.isNot,
            name,
            message: () =>
                `${this.isNot ? 'expected not ' : 'expected '}to ${verb} message ${id}: "${text}"${where(meta)}\n${(e as Error).message}`,
        };
    }
}

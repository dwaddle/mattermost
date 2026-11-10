// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {TestIdRole} from '@mattermost/types/test_id';

import {KEY_PLACEHOLDER} from '../grammar.ts';
import {ROLE_TABLE} from '../role_table.ts';

/** `join_leave_messages` -> `joinLeaveMessages` */
export function camel(s: string): string {
    const p = pascal(s);
    return p.charAt(0).toLowerCase() + p.slice(1);
}

/** `join_leave_messages` -> `JoinLeaveMessages`; `access-rules` -> `AccessRules`; `9am` -> `N9am` */
export function pascal(s: string): string {
    const out = s.split(/[^A-Za-z0-9]+/).filter(Boolean).map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join('');
    return (/^[0-9]/).test(out) ? 'N' + out : out;
}

/** The role in member names: `Button` in `saveButton`; nothing for a container. */
export function roleWord(role: TestIdRole | null): string {
    return role ? ROLE_TABLE[role].word : '';
}

const RESERVED = new Set(['page', 'scope', 'root', 'container', 'constructor', 'byTestId', 'byTestIdPattern', 'keysOf', 'fill', 'read']);

/** A member name that can't clash with the Scope base class. */
export function memberName(name: string): string {
    return RESERVED.has(name) ? `${name}Element` : name;
}

export const isIdentifier = (s: string) => (/^[A-Za-z_$][A-Za-z0-9_$]*$/).test(s);

/** A property key, quoted when it isn't an identifier. */
export function propKey(s: string): string {
    return isIdentifier(s) || (/^(0|[1-9][0-9]*)$/).test(s) ? s : JSON.stringify(s);
}

/** `MFAPage` -> `mfaPage`, `ChannelsPage` -> `channelsPage` */
export function pageGetter(cls: string): string {
    const lead = (/^[A-Z]+(?=[A-Z][a-z]|$)/).exec(cls)?.[0] ?? cls.charAt(0);
    return lead.toLowerCase() + cls.slice(lead.length);
}

/**
 * The template around its key: a composite key (`group:{key}-{key}`, a nested group's `<parent>-<child>`) is one key,
 * from the first placeholder to the last, that the caller passes whole.
 */
export function splitAtKey(template: string): [string, string] {
    const first = template.indexOf(KEY_PLACEHOLDER);
    const last = template.lastIndexOf(KEY_PLACEHOLDER);
    return [template.slice(0, first), template.slice(last + KEY_PLACEHOLDER.length)];
}

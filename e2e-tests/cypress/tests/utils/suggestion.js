// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {suggestionTestKey} from '@mattermost/types/test_id';

// A suggestion list renders each item as `<list>.item:<key>--option`, where the key is the suggested term without its
// `@`/`~` prefix and with `.` and `:` turned into `_`: a channel name for `~` and `in:`, a username for `@`. The Find
// Channels switcher (`quick_switch_modal.suggestions`) keys its items by channel id instead, and a person by their
// user id.

export {suggestionTestKey};

/** A CSS selector for the item suggesting `term` in any suggestion list, for `cy.get(...)`. */
export function suggestionItemSelector(term) {
    return `[data-testid$=".suggestions.item:${suggestionTestKey(term)}--option"]`;
}

/** The Find Channels switcher's item for a channel. */
export function quickSwitchChannelItem(channel, options) {
    return cy.get(`[data-testid="quick_switch_modal.suggestions.item:${channel.id}--option"]`, options);
}

/**
 * The Find Channels switcher's item for a person, matched by the row showing `@username`, so callers that only know the
 * username (not the user id the row is keyed by) can use it.
 */
export function quickSwitchUserItem(user, options) {
    // one selector rather than get + filter, so `should('not.exist')` also passes when the list has no rows at all
    return cy.get(`[data-testid^="quick_switch_modal.suggestions.item:"]:contains("@${user.username}")`, options);
}

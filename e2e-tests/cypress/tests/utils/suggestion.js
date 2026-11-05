// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// A suggestion list renders each item as `<list>.item:<key>--option`, where the key is the suggested term without its
// `@`/`~` prefix and with `.` and `:` turned into `_`: a channel name for `~` and `in:`, a username for `@`. The Find
// Channels switcher (`quick_switch_modal.suggestions`) keys its items by channel id instead, and a person you have no
// direct message channel with yet by their user id.

export function suggestionTestKey(term) {
    return term.trim().replace(/^[@~/:]/, '').replace(/:$/, '').replace(/[.:]/g, '_').replace(/-{2,}/g, '-');
}

/** A CSS selector for the item suggesting `term` in any suggestion list, for `cy.get(...)`. */
export function suggestionItemSelector(term) {
    return `[data-testid$=".suggestions.item:${suggestionTestKey(term)}--option"]`;
}

/** The Find Channels switcher's item for a channel. */
export function quickSwitchChannelItem(channel, options) {
    return cy.get(`[data-testid="quick_switch_modal.suggestions.item:${channel.id}--option"]`, options);
}

/**
 * The Find Channels switcher's item for a person. Its key is the user id or, once a direct message channel exists, that
 * channel's id, so this matches the row showing `@username`.
 */
export function quickSwitchUserItem(user, options) {
    // one selector rather than get + filter, so `should('not.exist')` also passes when the list has no rows at all
    return cy.get(`[data-testid^="quick_switch_modal.suggestions.item:"]:contains("@${user.username}")`, options);
}

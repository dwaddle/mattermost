// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import type {MessageDescriptor} from 'react-intl';
import {useIntl} from 'react-intl';

import {part, suggestionTestKey, type TestId} from '@mattermost/shared/utils/test_id';

import LoadingSpinner from 'components/widgets/loading/loading_spinner';

import {formatAsComponent} from 'utils/i18n';

import {isItemLoaded, type SuggestionResults} from './suggestion_results';

export type SuggestionListContentsProps = {
    id: string;
    className?: string;
    style?: React.CSSProperties;

    results: SuggestionResults;
    selectedTerm: string;

    getItemId: (term: string) => string;
    setItemRef?: (term: string, ref: HTMLElement | null) => void;
    onItemClick: (term: string, matchedPretext: string) => void;
    onItemHover: (term: string) => void;
    onMouseDown?: () => void;

    // The list's scope: items are `<testId>.item:<suggestionTestKey(term)>--option`, keyed by what they suggest
    // (the list reorders as you type). Without it, the selected item is `suggestion-selected`.
    testId?: TestId;
};

const SuggestionListContents = React.forwardRef<HTMLElement, SuggestionListContentsProps>(({
    id,
    className,
    style,

    results,
    selectedTerm,

    getItemId,
    setItemRef,
    onItemClick,
    onItemHover,
    onMouseDown,
    testId,
}, ref) => {
    function renderItem(item: unknown, term: string, Component: React.ElementType<any>) {
        if (!isItemLoaded(item)) {
            return (
                <LoadingSpinner
                    key={term}
                    testId={part(testId, 'loading')}
                />
            );
        }

        const itemRef = setItemRef ? (ref: HTMLElement) => setItemRef(term, ref) : undefined;
        return (
            <Component
                key={term}
                ref={itemRef}
                id={getItemId(term)}
                item={item}
                term={term}
                matchedPretext={results.matchedPretext}
                isSelection={selectedTerm === term}
                onClick={onItemClick}
                onMouseMove={onItemHover}
                role='option'
                {...(testId ? {'data-testid': part(testId, 'item', {key: suggestionTestKey(term)}, 'option')} : {})}
            />
        );
    }

    if ('groups' in results) {
        const contents = [];

        for (const group of results.groups) {
            if (group.items.length === 0) {
                continue;
            }

            const items = group.items.map((item, i) => {
                return renderItem(item, group.terms[i], group.components[i]);
            });

            contents.push(
                <GroupedSuggestionsGroup
                    key={group.key}
                    groupKey={group.key}
                    labelMessage={group.label}
                    testId={testId}
                >
                    {items}
                </GroupedSuggestionsGroup>,
            );
        }

        return (
            <GroupedSuggestions
                ref={ref as React.ForwardedRef<HTMLDivElement>}

                id={id}
                className={className}
                style={style}

                onMouseDown={onMouseDown}
            >
                {contents}
            </GroupedSuggestions>
        );
    }

    const contents = [];
    for (let i = 0; i < results.items.length; i++) {
        contents.push(renderItem(results.items[i], results.terms[i], results.components[i]));
    }

    return (
        <UngroupedSuggestions
            ref={ref as React.ForwardedRef<HTMLUListElement>}
            id={id}
            className={className}
            style={style}

            onMouseDown={onMouseDown}
        >
            {contents}
        </UngroupedSuggestions>
    );
});
SuggestionListContents.displayName = 'SuggestionListContents';
export default SuggestionListContents;

type UngroupedSuggestionsProps = Omit<React.HTMLAttributes<HTMLUListElement>, 'aria-label' | 'id' | 'role'> & {
    id: string;
};

/**
 * The container for suggestions when those suggestions aren't grouped together with a visible header. Only components
 * which render to a `li` element (likely by using a `SuggestionContainer`) should be passed as children.
 *
 * When used correctly, this will render similarly to:
 * ```html
 * <ul role="listbox" aria-label="Users">
 *     <li>Alice</li>
 *     <li>Bob</li>
 *     <li>Charlie</li>
 * </ul>
 * ```
 */
export const UngroupedSuggestions = React.forwardRef<HTMLUListElement, UngroupedSuggestionsProps>(({
    id,
    ...otherProps
}: UngroupedSuggestionsProps, ref) => {
    const {formatMessage} = useIntl();

    return (
        <ul
            ref={ref}
            id={id}

            aria-label={formatMessage({id: 'suggestionList.label', defaultMessage: 'Suggestions'})}

            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
            role='listbox'

            {...otherProps}
        />
    );
});
UngroupedSuggestions.displayName = 'UngroupedSuggestions';

type GroupedSuggestionsProps = Omit<React.HTMLAttributes<HTMLDivElement>, 'aria-label' | 'id' | 'role'> & {
    id: string;
};

/**
 * The container for suggestions when those suggestions will be split into groups, each with a visible header. Only
 * `GroupedSuggestionsGroup` should be passed as children.
 *
 * When used correctly, this will render similarly to:
 * ```html
 * <div role="listbox" aria-label="Suggestions">
 *     <ul role="group" aria-labelledby="group1-label">
 *         <li id="group1-label" role="presentation">Channel Members</li>
 *         <li>Alice</li>
 *         <li>Bob</li>
 *     </ul>
 *     <ul role="group" aria-labelledby="group2-label">
 *         <li id="group2-label" role="presentation">Other Users</li>
 *         <li>Charlie</li>
 *     </ul>
 * </div>
 * ```
 */
const GroupedSuggestions = React.forwardRef<HTMLDivElement, GroupedSuggestionsProps>(({
    id,
    ...otherProps
}: GroupedSuggestionsProps, ref) => {
    const {formatMessage} = useIntl();

    return (
        <div
            ref={ref}
            id={id}

            aria-label={formatMessage({id: 'suggestionList.label', defaultMessage: 'Suggestions'})}

            // eslint-disable-next-line jsx-a11y/no-noninteractive-element-to-interactive-role
            role='listbox'

            {...otherProps}
        />
    );
});
GroupedSuggestions.displayName = 'GroupedSuggestions';

function GroupedSuggestionsGroup({
    children,
    groupKey,
    labelMessage,
    testId,
}: {
    children: React.ReactNode;
    groupKey: string | undefined;
    labelMessage?: MessageDescriptor | string;

    testId?: TestId;
}) {
    const groupTestId = testId && groupKey ? `${testId}.group:${groupKey}` : undefined;
    const labelId = `suggestionListGroup-${groupKey}`;

    // Without a label, the group renders without a header
    return (
        <ul
            role='group'
            aria-labelledby={labelMessage ? labelId : undefined}
            data-testid={groupTestId}
        >
            {labelMessage && (
                <li
                    id={labelId}
                    className='suggestion-list__divider'
                    role='presentation'
                >
                    {formatAsComponent(labelMessage)}
                </li>
            )}
            {children}
        </ul>
    );
}

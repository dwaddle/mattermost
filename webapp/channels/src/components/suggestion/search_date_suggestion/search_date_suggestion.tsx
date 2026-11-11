// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locale} from 'date-fns';
import React, {useCallback, useEffect, useState} from 'react';
import {DayPicker, useDayPicker} from 'react-day-picker';
import type {DayContentProps} from 'react-day-picker';

import Constants from 'utils/constants';
import * as Keyboard from 'utils/keyboard';
import * as Utils from 'utils/utils';

import type {SuggestionProps} from '../suggestion';

import 'react-day-picker/dist/style.css';

type Props = SuggestionProps<never> & {
    currentDate?: Date;
    handleEscape?: () => void;
    locale: string;
    preventClose?: () => void;
};

const IconLeft = () => {
    return (
        <i className='icon icon-chevron-left'/>
    );
};

const IconRight = () => {
    return (
        <i className='icon icon-chevron-right'/>
    );
};

/** The day's local date as `YYYY-MM-DD`: its testid key. */
const dayKey = (date: Date) => [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');

/**
 * The library's day label (its `formatDay`), in a span keyed by the day's date
 * (`search_box.date_picker.day:2020-06-15--text`). The library keeps rendering the day's button around it; the key
 * tells apart the same day number shown twice (outside days).
 */
const DayContent = (props: DayContentProps) => {
    const {locale, formatters: {formatDay}} = useDayPicker();
    return (
        <span data-testid={`search_box.date_picker.day:${dayKey(props.date)}--text`}>
            {formatDay(props.date, {locale})}
        </span>
    );
};

const DAY_PICKER_COMPONENTS = {IconRight, IconLeft, DayContent};

const SearchDateSuggestion = ({
    currentDate,
    handleEscape,
    locale,
    preventClose,
    matchedPretext,
    onClick,
}: Props) => {
    let loadedLocales: Record<string, Locale> = {};
    loadedLocales = Utils.getDatePickerLocalesForDateFns(locale, loadedLocales);
    const [datePickerFocused, setDatePickerFocused] = useState(false);

    const handleDayClick = useCallback((day: Date) => {
        const dayString = new Date(Date.UTC(day.getFullYear(), day.getMonth(), day.getDate())).toISOString().split('T')[0];
        onClick(dayString, matchedPretext);
    }, [onClick, matchedPretext]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (Keyboard.isKeyPressed(e, Constants.KeyCodes.DOWN) && document.activeElement?.id === 'searchBox') {
                setDatePickerFocused(true);
            } else if (Keyboard.isKeyPressed(e, Constants.KeyCodes.ESCAPE)) {
                handleEscape?.();
            }
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
        };
    }, [handleEscape]);

    return (
        <DayPicker
            onDayClick={handleDayClick}
            showOutsideDays={true}
            mode={'single'}
            locale={loadedLocales[locale]}
            initialFocus={datePickerFocused}
            onMonthChange={preventClose}
            id='searchDatePicker'
            selected={currentDate}
            components={DAY_PICKER_COMPONENTS}
        />
    );
};
export default React.memo(SearchDateSuggestion);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locale} from 'date-fns';
import React, {useCallback, useEffect, useRef, useState} from 'react';
import {Button, DayPicker, useDayRender} from 'react-day-picker';
import type {DayProps} from 'react-day-picker';

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
 * react-day-picker's own Day, plus a testid keyed by the day's date (`search_box.date_picker.day:2020-06-15--gridcell`;
 * the library makes each day button a grid cell).
 */
const Day = (props: DayProps) => {
    const buttonRef = useRef<HTMLButtonElement>(null) as React.RefObject<HTMLButtonElement>;
    const day = useDayRender(props.date, props.displayMonth, buttonRef);
    if (day.isHidden) {
        return <div role='gridcell'/>;
    }
    if (!day.isButton) {
        return <div {...day.divProps}/>;
    }
    return (
        <Button
            name='day'
            ref={buttonRef}
            role='gridcell'
            {...day.buttonProps}
            data-testid={`search_box.date_picker.day:${dayKey(props.date)}--gridcell`}
        />
    );
};

const DAY_PICKER_COMPONENTS = {IconRight, IconLeft, Day};

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

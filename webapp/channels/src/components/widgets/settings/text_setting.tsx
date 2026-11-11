// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import type {ChangeEvent, ReactNode} from 'react';

import type {TestId} from '@mattermost/shared/utils/test_id';

import Setting from './setting';

const INPUT_TYPES = ['text', 'textarea', 'number', 'email', 'tel', 'url', 'password'] as const;
export type InputTypes = typeof INPUT_TYPES[number];

export type Props = {
    id: string;
    label: ReactNode;
    labelClassName?: string;
    placeholder?: string;
    value: string | number | string[];
    helpText?: ReactNode;
    footer?: ReactNode;
    inputClassName?: string;
    maxLength?: number;
    resizable?: boolean;
    onChange(id: string, value: any): void;
    disabled?: boolean;

    // This is a custom prop that is not part of the HTML input element type
    type?: InputTypes;
    autoFocus?: boolean;
    multiple?: boolean;

    testIdScope?: TestId;

    /** The row's own testid when it isn't the scope (a keyed row). */
    testId?: TestId;
};

function TextSetting(props: Props) {
    const {labelClassName = '', inputClassName = '', maxLength = -1, resizable = true, type = 'text'} = props;

    function handleChange(event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) {
        if (props.type === 'number') {
            props.onChange(props.id, parseInt(event.target.value, 10));
        } else if (props.type === 'text' && props.multiple) {
            if (event.target.value === '') {
                props.onChange(props.id, []);
            } else {
                props.onChange(props.id, event.target.value.split(','));
            }
        } else {
            props.onChange(props.id, event.target.value);
        }
    }

    let input = null;
    if (type === 'textarea') {
        input = (
            <textarea
                id={props.id}
                data-testid={props.testIdScope ? `${props.testIdScope}.value--textbox` : `${props.id}input`} // legacy: e2e tests rely on 'input' in the test id
                className='form-control'
                autoFocus={props.autoFocus}
                dir='auto'
                rows={5}
                placeholder={props.placeholder}
                style={resizable === false ? {resize: 'none'} : undefined}
                value={props.value}
                maxLength={maxLength}
                onChange={handleChange}
                disabled={props.disabled}
            />
        );
    } else {
        const inputType = INPUT_TYPES.includes(type) ? type : 'text';

        // legacy (without testIdScope): e2e tests rely on 'input' being in the test id if it's a text/textarea input
        const legacyTestId = inputType === 'text' ? `${props.id}input` : `${props.id}${inputType}`;

        // An incomplete number like "-" parses to NaN. Rendering NaN makes React overwrite the input
        // and discard what was typed, while an empty value leaves the browser's in-progress text alone.
        const value = Number.isNaN(props.value) ? '' : props.value;

        const inputProps = {
            id: props.id,
            className: 'form-control',
            autoFocus: props.autoFocus,
            placeholder: props.placeholder,
            value,
            maxLength,
            onChange: handleChange,
            disabled: props.disabled,
        };

        // a number input is a spinbutton: its own element, so its testid's role matches
        input = inputType === 'number' ? (
            <input
                {...inputProps}
                type='number'
                data-testid={props.testIdScope ? `${props.testIdScope}.value--spinbutton` : legacyTestId}
            />
        ) : (
            <input
                {...inputProps}
                type={inputType}
                data-testid={props.testIdScope ? `${props.testIdScope}.value--textbox` : legacyTestId}
            />
        );
    }

    return (
        <Setting
            label={props.label}
            labelClassName={labelClassName}
            inputClassName={inputClassName}
            helpText={props.helpText}
            inputId={props.id}
            footer={props.footer}
            testIdScope={props.testIdScope}
            testId={props.testId}
        >
            {input}
        </Setting>
    );
}

export default TextSetting;

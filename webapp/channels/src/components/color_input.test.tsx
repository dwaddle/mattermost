// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback, useState} from 'react';

import {renderWithContext, userEvent, screen, act} from 'tests/react_testing_utils';

import ColorInput, {type ColorInputProps} from './color_input';

function ColorInputWrapper({onChange, value: initialValue, ...otherProps}: ColorInputProps) {
    const [value, setValue] = useState(initialValue);

    const handleChange = useCallback((value: string) => {
        setValue(value);
        onChange(value);
    }, [onChange]);

    return (
        <ColorInput
            value={value}
            onChange={handleChange}
            {...otherProps}
        />
    );
}

describe('components/ColorInput', () => {
    const baseProps = {
        id: 'sidebarBg',
        onChange: jest.fn(),
        testIdScope: 'settings.section.color' as const,
        value: '#ffffff',
    };

    test('should hide color picker when first rendered', () => {
        const {getByTestId} = renderWithContext(<ColorInputWrapper {...baseProps}/>);

        const inputElement = getByTestId('settings.section.color.value--textbox');

        expect(inputElement).toBeInTheDocument();
        expect(inputElement).toBeVisible();
        expect(screen.queryByTestId('settings.section.color.picker')).not.toBeInTheDocument();
    });

    test('should show color picker when color picker button is clicked', async () => {
        const {getByTestId} = renderWithContext(<ColorInputWrapper {...baseProps}/>);

        const colorPickerToggleButton = getByTestId('settings.section.color.toggle--button');

        await userEvent.click(colorPickerToggleButton);

        const colorPopover = getByTestId('settings.section.color.picker');

        expect(colorPopover).toBeInTheDocument();
        expect(colorPopover).toBeVisible();
        expect(document.activeElement).toBe(getByTestId('settings.section.color.value--textbox'));

        await userEvent.click(document.body);

        expect(screen.queryByTestId('settings.section.color.picker')).not.toBeInTheDocument();
    });

    test('should change color when the color picker is clicked', async () => {
        const {getByTestId} = renderWithContext(<ColorInputWrapper {...baseProps}/>);

        await userEvent.click(getByTestId('settings.section.color.toggle--button'));

        const colorPopover = getByTestId('settings.section.color.picker');

        await userEvent.click(colorPopover);

        expect(colorPopover).toBeInTheDocument();
        expect(baseProps.onChange).toHaveBeenCalledTimes(1);
    });

    test('should keep what the user types in the textbox until blur', async () => {
        const {getByTestId} = renderWithContext(<ColorInputWrapper{...baseProps}/>);

        const inputElement = getByTestId('settings.section.color.value--textbox');

        await userEvent.clear(inputElement);
        await userEvent.type(inputElement, '#abc');

        expect(inputElement).toHaveValue('#abc');

        // The RGB here is the equivalent of '#abc'.
        expect(getByTestId('settings.section.color.swatch').style.backgroundColor).toBe('rgb(170, 187, 204)');

        await act(() => {
            inputElement.blur();
        });

        expect(document.activeElement).not.toBe(inputElement);
        expect(inputElement).toHaveValue('#aabbcc');

        // The RGB value passed in the assertion is the equivalent of '#aabbcc'.
        expect(getByTestId('settings.section.color.swatch').style.backgroundColor).toBe('rgb(170, 187, 204)');
    });
});

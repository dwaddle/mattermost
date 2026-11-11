// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo, useCallback, useMemo} from 'react';
import type {ChangeEventHandler} from 'react';

import {part} from '@mattermost/shared/utils/test_id';
import type {TestId} from '@mattermost/shared/utils/test_id';
import type {MatrixConfig} from '@mattermost/types/apps';

type Props = {
    id: string;
    label: React.ReactNode;
    helpText?: React.ReactNode;
    matrixConfig: MatrixConfig;
    onChange(name: string, value: string[]): void;
    value?: string[];
    disabled?: boolean;

    /** The row's parts render under it (`${testIdScope}.cell:<row>_<column>--checkbox` or `--radio`); without it, none. */
    testIdScope?: TestId;

    /** The row's own testid when it isn't the scope (a keyed row). */
    testId?: TestId;
};

export function parseMatrixValue(entries: string[]): Map<string, Set<string>> {
    const selection = new Map<string, Set<string>>();
    for (const entry of entries) {
        const colonIndex = entry.indexOf(':');
        if (colonIndex <= 0) {
            continue;
        }
        const rowValue = entry.slice(0, colonIndex);
        const columns = entry.slice(colonIndex + 1).
            split(',').
            map((col) => col.trim()).
            filter(Boolean);
        if (columns.length > 0) {
            selection.set(rowValue, new Set(columns));
        }
    }
    return selection;
}

export function encodeMatrixValue(selection: Map<string, Set<string>>): string[] {
    const entries: string[] = [];
    selection.forEach((columns, rowValue) => {
        if (columns.size > 0) {
            entries.push(`${rowValue}:${Array.from(columns).join(',')}`);
        }
    });
    return entries;
}

const CheckboxMatrixSetting = ({
    id,
    label,
    helpText,
    matrixConfig,
    onChange,
    value,
    disabled,
    testIdScope,
    testId,
}: Props) => {
    const rows = matrixConfig.rows || [];
    const columns = matrixConfig.columns || [];
    const rowSelection = matrixConfig.row_selection || 'multiple';

    const selection = useMemo(() => parseMatrixValue(value || []), [value]);

    const updateSelection = useCallback((next: Map<string, Set<string>>) => {
        onChange(id, encodeMatrixValue(next));
    }, [id, onChange]);

    const handleCheckboxChange: ChangeEventHandler<HTMLInputElement> = useCallback((e) => {
        const rowValue = e.target.dataset.row || '';
        const columnValue = e.target.value;
        const next = new Map(selection);
        const rowColumns = new Set(next.get(rowValue) || []);
        if (e.target.checked) {
            rowColumns.add(columnValue);
        } else {
            rowColumns.delete(columnValue);
        }
        if (rowColumns.size === 0) {
            next.delete(rowValue);
        } else {
            next.set(rowValue, rowColumns);
        }
        updateSelection(next);
    }, [selection, updateSelection]);

    const handleRadioChange: ChangeEventHandler<HTMLInputElement> = useCallback((e) => {
        const rowValue = e.target.dataset.row || '';
        const columnValue = e.target.value;
        const next = new Map(selection);
        next.set(rowValue, new Set([columnValue]));
        updateSelection(next);
    }, [selection, updateSelection]);

    const handleChange = rowSelection === 'single' ? handleRadioChange : handleCheckboxChange;

    return (
        <div
            className='form-group'
            data-testid={testIdScope ? testId ?? testIdScope : undefined}
        >
            {label && (
                <label
                    className='control-label'
                    data-testid={part(testIdScope, 'label', 'text')}
                >
                    {label}
                </label>
            )}
            <table className='checkbox-matrix'>
                <thead>
                    <tr>
                        <th
                            scope='col'
                            className='checkbox-matrix__corner'
                        />
                        {columns.map((col) => (
                            <th
                                scope='col'
                                key={col.value}
                            >
                                {col.label}
                            </th>
                        ))}
                    </tr>
                </thead>
                <tbody>
                    {rows.map((row) => (
                        <tr key={row.value}>
                            <th scope='row'>{row.label}</th>
                            {columns.map((col) => {
                                const rowColumns = selection.get(row.value);
                                const checked = rowColumns?.has(col.value) || false;
                                return (
                                    <td key={col.value}>
                                        {rowSelection === 'single' ? (
                                            <input
                                                type='radio'
                                                name={`${id}:${row.value}`}
                                                value={col.value}
                                                data-row={row.value}
                                                data-testid={testIdScope ? `${testIdScope}.radio_cell:${row.value}_${col.value}--radio` : undefined}
                                                aria-label={`${row.label}, ${col.label}`}
                                                checked={checked}
                                                onChange={handleChange}
                                                disabled={disabled}
                                            />
                                        ) : (
                                            <input
                                                type='checkbox'
                                                value={col.value}
                                                data-row={row.value}
                                                data-testid={testIdScope ? `${testIdScope}.cell:${row.value}_${col.value}--checkbox` : undefined}
                                                aria-label={`${row.label}, ${col.label}`}
                                                checked={checked}
                                                onChange={handleChange}
                                                disabled={disabled}
                                            />
                                        )}
                                    </td>
                                );
                            })}
                        </tr>
                    ))}
                </tbody>
            </table>
            {helpText && (
                <div
                    className='help-text'
                    data-testid={part(testIdScope, 'help', 'text')}
                >
                    {helpText}
                </div>
            )}
        </div>
    );
};

export default memo(CheckboxMatrixSetting);

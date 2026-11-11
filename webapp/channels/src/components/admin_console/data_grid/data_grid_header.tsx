// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import type {CSSProperties} from 'react';

import type {TestId} from '@mattermost/shared/utils/test_id';

import type {Column} from './data_grid';

import './data_grid.scss';

type HeaderElementProps = {
    col: Column;
};

const HeaderElement = ({col}: HeaderElementProps) => {
    const style: CSSProperties = {};
    if (col.width) {
        style.flexGrow = col.width;
    }
    return (
        <div
            key={col.field}
            className='DataGrid_cell'
            style={style}
        >
            {col.name}
        </div>
    );
};

export type Props = {
    columns: Column[];
    testIdScope: TestId;
};

const DataGridHeader = ({columns, testIdScope}: Props) => {
    return (
        <div
            className='DataGrid_header'
            data-testid={`${testIdScope}.header`}
        >
            {columns.map((col) => (
                <HeaderElement
                    col={col}
                    key={col.field}
                />
            ))}
        </div>
    );
};

export default DataGridHeader;

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import type {ReactNode} from 'react';

import type {TestId} from '@mattermost/shared/utils/test_id';

import './separator.scss';

type Props = {
    children?: ReactNode;
    testId?: TestId;
};

const BasicSeparator = ({children, testId}: Props) => {
    return (
        <div
            data-testid={testId ?? 'basicSeparator'}
            className='Separator BasicSeparator'
        >
            <hr className='separator__hr'/>
            {children && (
                <div className='separator__text'>
                    {children}
                </div>
            )}
        </div>
    );
};

export default React.memo(BasicSeparator);

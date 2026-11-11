// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo, type JSX} from 'react';

import {withRole} from '@mattermost/shared/utils/test_id';
import type {TestId} from '@mattermost/shared/utils/test_id';

type ErrorLabelProps = {
    errorText?: string | JSX.Element;

    testId?: TestId;
};

const ErrorLabel = ({errorText, testId}: ErrorLabelProps) => (errorText ? (
    <div className='form-group has-error'>
        <label
            className='control-label'
            data-testid={withRole(testId, 'text')}
        >
            {errorText}
        </label>
    </div>
) : null);

export default memo(ErrorLabel);

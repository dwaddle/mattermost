// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type JSX} from 'react';

import type {TestId} from '@mattermost/shared/utils/test_id';

import CheckboxCheckedIcon from 'components/widgets/icons/checkbox_checked_icon';
import CheckboxPartialIcon from 'components/widgets/icons/checkbox_partial_icon';

type Props = {
    value?: string;

    // The checkbox is `<testIdScope>`, and shows `<testIdScope>.checked` when checked.
    testIdScope?: TestId;
};

const PermissionCheckbox = ({value = '', testIdScope}: Props): JSX.Element => {
    let icon = null;
    let extraClass = '';
    if (value === 'checked') {
        icon = (
            <span data-testid={testIdScope ? `${testIdScope}.checked` : undefined}>
                <CheckboxCheckedIcon/>
            </span>
        );
        extraClass = 'checked';
    } else if (value === 'intermediate') {
        icon = <CheckboxPartialIcon/>;
        extraClass = 'intermediate';
    }
    return (
        <div
            className={'permission-check ' + extraClass}
            data-testid={testIdScope}
        >
            {icon}
        </div>
    );
};

export default PermissionCheckbox;

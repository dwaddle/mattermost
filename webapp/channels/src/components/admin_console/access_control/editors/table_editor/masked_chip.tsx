// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type JSX} from 'react';
import {useIntl} from 'react-intl';

import {WithTooltip} from '@mattermost/shared/components/tooltip';
import {withRole, type TestId} from '@mattermost/shared/utils/test_id';

import './selector_menus.scss';

type Props = {

    testId?: TestId;
};

/** Non-interactive chip indicating hidden attribute values exist in this condition. */
const MaskedChip = ({testId}: Props): JSX.Element => {
    const {formatMessage} = useIntl();

    const tooltipText = formatMessage({
        id: 'admin.access_control.masked_chip.tooltip',
        defaultMessage: 'One or more restricted values',
    });

    const ariaLabel = formatMessage({
        id: 'admin.access_control.masked_chip.aria_label',
        defaultMessage: 'Hidden values that you do not have permission to view',
    });

    return (
        <WithTooltip title={tooltipText}>
            <div
                className='select__multi-value select__multi-value--masked'
                role='img'
                aria-label={ariaLabel}
                data-testid={withRole(testId, 'img')}
            >
                <div className='select__multi-value__label'>
                    {'••••••••'}
                </div>
            </div>
        </WithTooltip>
    );
};

export default MaskedChip;

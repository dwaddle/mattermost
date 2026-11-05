// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {type JSX, type ReactNode} from 'react';

import {Switch} from '@mattermost/compass-ui/components/switch';
import type {TestId} from '@mattermost/shared/utils/test_id';

type Props = {
    id: string;
    children: ReactNode;
    secondaryLabel: ReactNode;
    checked: boolean;
    onChange: () => void;
    last?: boolean;
    disabled?: boolean;

    /** Extra content rendered below the switch row (e.g. domain input). */
    footer?: ReactNode;

    /** The switch renders `${testId}--switch` and its help `${testId}_help--text` (without it, the legacy ids). */
    testId?: TestId;
};

/**
 * Admin Console settings row: Compass Switch with primary + secondary labels,
 * optional footer, and the legacy section separator between rows.
 *
 * Uses `size="medium"` + `semiBold` to match Channel Settings rows. The old
 * Toggle adapter defaulted to `btn-lg` → Compass `large` (16px label).
 *
 * Without `testId`, preserves both `data-testid={id}` (wrapper, for Cypress) and
 * `data-testid={`${id}-button`}` (on the switch input, for unit tests).
 */
const AdminSettingsSwitch = ({
    id,
    children,
    secondaryLabel,
    checked,
    onChange,
    last,
    disabled,
    footer,
    testId,
}: Props): JSX.Element => (
    <>
        <div data-testid={testId ? undefined : id}>
            <Switch
                id={id}
                size='medium'
                checked={checked}
                disabled={disabled}
                onChange={onChange}
                data-testid={testId ? `${testId}--switch` : `${id}-button`}
                tabIndex={0}
                semiBold={true}
                secondaryLabel={testId ? <span data-testid={`${testId}.help--text`}>{secondaryLabel}</span> : secondaryLabel}
            >
                {children}
            </Switch>
        </div>
        {footer}
        {!last && (
            <div className='section-separator'>
                <hr className='separator__hr'/>
            </div>
        )}
    </>
);

export default AdminSettingsSwitch;

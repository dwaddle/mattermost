// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {Button} from '@mattermost/compass-ui/components/button';
import {WithTooltip} from '@mattermost/shared/components/tooltip';
import type {TestId} from '@mattermost/shared/utils/test_id';

type Props = {
    title: React.ReactNode;
    subtitle?: React.ReactNode;
    buttonText?: React.ReactNode;
    isDisabled?: boolean;
    onClick?: () => void;
    tooltipText?: string;
    destructive?: boolean;

    // The button renders `<testId>--button`.
    testId?: TestId;
};

// This component can be used in the card header
const TitleAndButtonCardHeader: React.FC<Props> = (props: Props) => {
    let button = (
        <Button
            disabled={props.isDisabled}
            emphasis='primary'
            destructive={props.destructive}
            onClick={props.onClick}
            data-testid={props.testId ? `${props.testId}--button` : undefined}
        >
            {props.buttonText}
        </Button>
    );

    if (props.isDisabled && props.tooltipText) {
        button = (
            <WithTooltip
                title={props.tooltipText}
            >
                {button}
            </WithTooltip>
        );
    }

    return (
        <>
            <div>
                <div className='text-top'>
                    {props.title}
                </div>
                {
                    props.subtitle &&
                    <div className='text-bottom'>
                        {props.subtitle}
                    </div>
                }
            </div>
            {
                props.buttonText && props.onClick && button
            }
        </>
    );
};

export default TitleAndButtonCardHeader;

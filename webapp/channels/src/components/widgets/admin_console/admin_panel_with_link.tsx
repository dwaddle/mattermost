// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';
import type {MessageDescriptor} from 'react-intl';
import {FormattedMessage} from 'react-intl';
import {Link} from 'react-router-dom';

import {Button} from '@mattermost/compass-ui/components/button';
import type {TestId} from '@mattermost/shared/utils/test_id';

import AdminPanel from './admin_panel';

type Props = {
    children?: React.ReactNode;
    className?: string;
    id?: string;
    title: MessageDescriptor;
    subtitle: MessageDescriptor;
    subtitleValues?: Record<string, unknown>;
    url: string;
    disabled?: boolean;
    linkText: MessageDescriptor;

    // The panel's testid; its link is `<testId>.action--link`.
    testId: TestId;
};

const AdminPanelWithLink = ({
    className = '',
    linkText,
    subtitle,
    title,
    url,
    children,
    disabled,
    id,
    subtitleValues,
    testId,
}: Props) => {
    const button = (
        <Button
            asChild={true}
            emphasis='primary'
            disabled={disabled}
        >
            <Link
                to={url}
                data-testid={`${testId}.action--link`}
            >
                <FormattedMessage
                    {...linkText}
                />
            </Link>
        </Button>
    );

    return (
        <AdminPanel
            className={'AdminPanelWithLink ' + className}
            id={id}
            data-testid={testId}
            title={title}
            subtitle={subtitle}
            subtitleValues={subtitleValues}
            button={button}
        >
            {children}
        </AdminPanel>
    );
};

export default AdminPanelWithLink;

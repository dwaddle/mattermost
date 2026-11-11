// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import classNames from 'classnames';
import React, {useCallback, useMemo} from 'react';
import {FormattedMessage, useIntl} from 'react-intl';

import {WithTooltip} from '@mattermost/shared/components/tooltip';
import {part, withRole} from '@mattermost/shared/utils/test_id';
import type {TestId} from '@mattermost/shared/utils/test_id';

import useCopyText, {messages as copyMessages} from 'components/common/hooks/useCopyText';
import ExternalLink from 'components/external_link';

import './plugin_metadata_panel.scss';

export function formatPluginVersion(version: string): string {
    if (!version) {
        return version;
    }

    return (/^v/i).test(version) ? version : `v${version}`;
}

export type PluginMetadataPanelProps = {
    name: string;
    id: string;
    version: string;
    homepageUrl?: string;
    releaseNotesUrl?: string;
    className?: string;
    hideName?: boolean;

    // The panel's path; its parts are `.id--button` and `.version--link` (or `.version--text` without release notes).
    testIdScope: TestId;
};

const PluginMetadataId = ({id, testId}: {id: string; testId: TestId}) => {
    const intl = useIntl();
    const {copiedRecently, onClick: copyId} = useCopyText({
        text: id,
        successCopyTimeout: 2000,
    });

    const tooltipMessage = copiedRecently ? copyMessages.copied : copyMessages.copy;

    const handleCopy = useCallback((e: React.MouseEvent | React.KeyboardEvent) => {
        e.preventDefault();
        copyId();
    }, [copyId]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' || e.key === ' ') {
            handleCopy(e);
        }
    }, [handleCopy]);

    const tooltipTitle = useMemo(() => (
        <FormattedMessage {...tooltipMessage}/>
    ), [tooltipMessage]);

    return (
        <WithTooltip
            title={tooltipTitle}
        >
            <span
                className='PluginMetadataPanel__id'
                data-testid={withRole(testId, 'button')}
                onClick={handleCopy}
                onKeyDown={handleKeyDown}
                role='button'
                tabIndex={0}
                aria-label={intl.formatMessage(tooltipMessage)}
            >
                {id}
            </span>
        </WithTooltip>
    );
};

const PluginMetadataPanel = ({
    name,
    id,
    version,
    homepageUrl,
    releaseNotesUrl,
    className,
    hideName = false,
    testIdScope,
}: PluginMetadataPanelProps) => {
    const displayName = name.trim() || id;
    const formattedVersion = formatPluginVersion(version);

    let nameElement: React.ReactNode = <strong>{displayName}</strong>;
    if (homepageUrl) {
        nameElement = (
            <ExternalLink
                href={homepageUrl}
                location='plugin_metadata_panel'
            >
                <strong>{displayName}</strong>
            </ExternalLink>
        );
    }

    let versionElement: React.ReactNode = null;
    if (formattedVersion) {
        versionElement = (
            <>
                {hideName ? ' · ' : ' - '}
                {releaseNotesUrl ? (
                    <ExternalLink
                        href={releaseNotesUrl}
                        location='plugin_metadata_panel'
                        data-testid={part(testIdScope, 'version', 'link')}
                    >
                        {formattedVersion}
                    </ExternalLink>
                ) : (
                    <span data-testid={part(testIdScope, 'version', 'text')}>
                        {formattedVersion}
                    </span>
                )}
            </>
        );
    }

    return (
        <span
            className={classNames('PluginMetadataPanel', className)}
            data-testid={testIdScope}
        >
            {!hideName && nameElement}
            <span className='PluginMetadataPanel__metadata'>
                {!hideName && ' ('}
                <PluginMetadataId
                    id={id}
                    testId={part(testIdScope, 'id')}
                />
                {versionElement}
                {!hideName && ')'}
            </span>
        </span>
    );
};

export default PluginMetadataPanel;

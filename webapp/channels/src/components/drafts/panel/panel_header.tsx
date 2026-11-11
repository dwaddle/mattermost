// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useMemo} from 'react';
import type {ComponentProps} from 'react';
import {FormattedMessage} from 'react-intl';

import {SyncIcon} from '@mattermost/compass-icons/components';
import {WithTooltip} from '@mattermost/shared/components/tooltip';
import {part} from '@mattermost/shared/utils/test_id';
import type {TestId} from '@mattermost/shared/utils/test_id';

import Timestamp, {RelativeRanges} from 'components/timestamp';
import Tag from 'components/widgets/tag/tag';

import './panel_header.scss';
import {isToday} from 'utils/datetime';

const TIMESTAMP_PROPS: Partial<ComponentProps<typeof Timestamp>> = {
    day: 'numeric',
    useSemanticOutput: false,
    useTime: false,
    units: ['now', 'minute', 'hour', 'day', 'week', 'month', 'year'],
};

export const SCHEDULED_POST_TIME_RANGES = [
    RelativeRanges.TODAY_TITLE_CASE,
    RelativeRanges.YESTERDAY_TITLE_CASE,
    RelativeRanges.TOMORROW_TITLE_CASE,
];

export const scheduledPostTimeFormat: ComponentProps<typeof Timestamp>['useTime'] = (_, {hour, minute}) => ({hour, minute});

type Props = {
    kind: 'draft' | 'scheduledPost';

    testIdScope?: TestId;
    actions: React.ReactNode;
    timestamp: number;
    remote: boolean;
    title: React.ReactNode;
    error?: string;
    repeatsWeekly?: boolean;
};

function PanelHeader({
    kind,
    actions,
    timestamp,
    remote,
    title,
    error,
    repeatsWeekly,
    testIdScope,
}: Props) {
    const timestampDateObject = useMemo(() => new Date(timestamp), [timestamp]);

    return (
        <div
            className='PanelHeader'
            data-testid={part(testIdScope, 'header')}
        >
            <div className='PanelHeader__left'>{title}</div>
            <div className='PanelHeader__right'>
                <div className='PanelHeader__actions'>
                    {actions}
                </div>
                <div className='PanelHeader__info'>
                    {remote && (
                        <div className='PanelHeader__sync-icon'>
                            <WithTooltip
                                title={
                                    <FormattedMessage
                                        id='drafts.info.sync'
                                        defaultMessage='Updated from another device'
                                    />
                                }
                            >
                                <SyncIcon size={18}/>
                            </WithTooltip>
                        </div>
                    )}
                    <div
                        className='PanelHeader__timestamp'
                        data-testid={part(testIdScope, 'header.time', 'text')}
                    >
                        {
                            Boolean(timestamp) && kind === 'draft' && (
                                <Timestamp
                                    value={new Date(timestamp)}
                                    {...TIMESTAMP_PROPS}
                                />
                            )
                        }

                        {
                            Boolean(timestamp) && kind === 'scheduledPost' && (
                                <FormattedMessage
                                    id='scheduled_post.panel.header.time'
                                    defaultMessage='Send {isTodayOrTomorrow, select, true {} other {on}} {scheduledDateTime}'
                                    values={{
                                        scheduledDateTime: (
                                            <Timestamp
                                                value={timestamp}
                                                ranges={SCHEDULED_POST_TIME_RANGES}
                                                useSemanticOutput={false}
                                                useTime={scheduledPostTimeFormat}
                                            />
                                        ),
                                        isTodayOrTomorrow: isToday(timestampDateObject),
                                    }}
                                />
                            )
                        }
                    </div>

                    {kind === 'scheduledPost' && repeatsWeekly && !error && (
                        <Tag
                            data-testid={part(testIdScope, 'header.repeats_weekly', 'text')}
                            variant={'info'}
                            uppercase={false}
                            text={(
                                <FormattedMessage
                                    id='scheduled_post.panel.header.repeats_weekly'
                                    defaultMessage='Repeats weekly'
                                />
                            )}
                        />
                    )}
                    {kind === 'draft' && !error && (
                        <Tag
                            variant={'danger'}
                            uppercase={true}
                            text={'draft'}
                        />
                    )}
                    {error && (
                        <Tag
                            text={error}
                            variant={'danger'}
                            uppercase={true}
                            icon={'alert-outline'}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

export default PanelHeader;

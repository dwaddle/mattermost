// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {useCallback} from 'react';
import {useSelector} from 'react-redux';

import {part} from '@mattermost/shared/utils/test_id';
import type {TestId} from '@mattermost/shared/utils/test_id';
import type {PostPriorityMetadata} from '@mattermost/types/posts';
import type {UserProfile, UserStatus} from '@mattermost/types/users';

import {getCurrentRelativeTeamUrl} from 'mattermost-redux/selectors/entities/teams';

import {isBurnOnReadEnabled} from 'selectors/burn_on_read';

import PriorityLabels from 'components/advanced_text_editor/priority_labels';
import BurnOnReadLabel from 'components/burn_on_read/burn_on_read_label';
import FilePreview from 'components/file_preview';
import Markdown from 'components/markdown';
import ShowMore from 'components/post_view/show_more';
import ProfilePicture from 'components/profile_picture';

import {imageURLForUser, handleFormattedTextClick} from 'utils/utils';

import type {PostDraft} from 'types/store/draft';

import './panel_body.scss';

type Props = {
    channelId?: string;

    testIdScope?: TestId;
    displayName: string;
    fileInfos: PostDraft['fileInfos'];
    message: string;
    priority?: PostPriorityMetadata;
    burnOnRead?: {enabled: boolean};
    burnOnReadDurationMinutes?: number;
    status: UserStatus['status'];
    uploadsInProgress: PostDraft['uploadsInProgress'];
    userId: UserProfile['id'];
    username: UserProfile['username'];
};

const OPTIONS = {
    disableGroupHighlight: true,
    mentionHighlight: false,
};

function PanelBody({
    channelId,
    displayName,
    fileInfos,
    message,
    priority,
    burnOnRead,
    burnOnReadDurationMinutes = 10,
    status,
    uploadsInProgress,
    userId,
    username,
    testIdScope,
}: Props) {
    const currentRelativeTeamUrl = useSelector(getCurrentRelativeTeamUrl);
    const isBorFeatureEnabled = useSelector(isBurnOnReadEnabled);

    const handleClick = useCallback((e: React.MouseEvent<HTMLDivElement, MouseEvent>) => {
        handleFormattedTextClick(e, currentRelativeTeamUrl);
    }, [currentRelativeTeamUrl]);

    return (
        <div
            className='DraftPanelBody post'
            data-testid={part(testIdScope, 'body')}
        >
            <div
                className='DraftPanelBody__left post__img'
                data-testid={part(testIdScope, 'avatar')}
            >
                <ProfilePicture
                    status={status}
                    channelId={channelId}
                    username={username}
                    userId={userId}
                    size={'md'}
                    src={imageURLForUser(userId)}
                />
            </div>
            <div className='DraftPanelBody__post_body'>
                <ShowMore
                    text={message}
                >
                    <div
                        onClick={handleClick}
                        className='post__content'
                    >
                        <div className='DraftPanelBody__right'>
                            <div
                                className='post__header'
                                data-testid={part(testIdScope, 'post_header')}
                            >
                                <strong>{displayName}</strong>
                                {priority && (
                                    <PriorityLabels
                                        canRemove={false}
                                        hasError={false}
                                        persistentNotifications={priority.persistent_notifications}
                                        priority={priority.priority}
                                        requestedAck={priority.requested_ack}
                                        testIdScope={part(testIdScope, 'priority_labels')}
                                    />
                                )}
                                {burnOnRead?.enabled && isBorFeatureEnabled && (
                                    <BurnOnReadLabel
                                        canRemove={false}
                                        onRemove={() => {}}
                                        durationMinutes={burnOnReadDurationMinutes}
                                        testId={part(testIdScope, 'burn_on_read_label')}
                                    />
                                )}
                            </div>
                            <div
                                className='post__body'
                                data-testid={part(testIdScope, 'message')}
                            >
                                <Markdown
                                    options={OPTIONS}
                                    message={message}
                                />
                            </div>
                        </div>
                    </div>
                </ShowMore>
                {(fileInfos.length > 0 || uploadsInProgress?.length > 0) && (
                    <FilePreview
                        fileInfos={fileInfos}
                        uploadsInProgress={uploadsInProgress}
                    />
                )}
            </div>
        </div>
    );
}

export default PanelBody;

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {part} from '@mattermost/shared/utils/test_id';
import type {TestId} from '@mattermost/shared/utils/test_id';
import type {UserProfile} from '@mattermost/types/users';

import {Client4} from 'mattermost-redux/client';

import ProfilePicture from 'components/profile_picture';

type Props = {
    user: UserProfile;

    // The grid row: `.name`, `.display_name--text`, `.email--text`.
    testIdScope: TestId;
};

const UserGridName = ({
    user,
    testIdScope,
}: Props) => {
    return (
        <div className='UserGrid_nameRow'>
            <ProfilePicture
                src={Client4.getProfilePictureUrl(user.id, user.last_picture_update)}
                status={user.status}
                size='md'
            />

            <div
                className='UserGrid_name'
                data-testid={part(testIdScope, 'name')}
            >
                <span data-testid={part(testIdScope, 'display_name', 'text')}>
                    {`${user.username} - ${user.first_name} ${user.last_name}`}
                </span>
                <span
                    className='ug-email'
                    data-testid={part(testIdScope, 'email', 'text')}
                >
                    {user.email}
                </span>
            </div>
        </div>
    );
};

export default UserGridName;

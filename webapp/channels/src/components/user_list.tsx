// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React, {memo, useRef, type JSX} from 'react';
import {FormattedMessage} from 'react-intl';

import {part} from '@mattermost/shared/utils/test_id';
import type {TestIdScope} from '@mattermost/shared/utils/test_id';
import type {Channel, ChannelMembership} from '@mattermost/types/channels';
import type {TeamMembership} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';

import LoadingScreen from 'components/loading_screen';

import UserListRow from './user_list_row';

type Props = {
    actions?: Array<React.ComponentType<any>>;
    actionUserProps?: {
        [userId: string]: {
            channel?: Channel;
            teamMember: TeamMembership;
            channelMember?: ChannelMembership;
        };
    };
    users?: UserProfile[] | null;
    extraInfo?: {[key: string]: Array<string | JSX.Element>};
    actionProps?: {
        mfaEnabled: boolean;
        enableUserAccessTokens: boolean;
        experimentalEnableAuthenticationTransfer: boolean;
        doPasswordReset: (user: UserProfile) => void;
        doEmailReset: (user: UserProfile) => void;
        doManageTeams: (user: UserProfile) => void;
        doManageRoles: (user: UserProfile) => void;
        doManageTokens: (user: UserProfile) => void;
        isDisabled?: boolean;
    };

    testIdScope: TestIdScope;
};

const UserList = ({
    actionUserProps,
    actionProps,
    users: usersFromProps = [],
    extraInfo = {},
    actions = [],
    testIdScope,
}: Props) => {
    const containerRef = useRef(null);

    const users = usersFromProps;

    let content;
    if (users == null) {
        return <LoadingScreen/>;
    } else if (users.length > 0 && actionProps) {
        content = users.map((user: UserProfile, index: number) => {
            const userId = user.id;
            return (
                <UserListRow
                    key={user.id}
                    user={user}
                    extraInfo={extraInfo?.[userId]}
                    actions={actions}
                    actionProps={actionProps}
                    actionUserProps={actionUserProps?.[userId]}
                    index={index}
                    totalUsers={users.length}
                    userCount={index >= 0 ? index : -1}
                    testIdScope={part(testIdScope, 'user')}
                />
            );
        });
    } else {
        content = (
            <div
                key='no-users-found'
                className='more-modal__placeholder-row no-users-found'
                data-testid={part(testIdScope, 'no_users', 'text')}
            >
                <p>
                    <FormattedMessage
                        id='user_list.notFound'
                        defaultMessage='No users found'
                    />
                </p>
            </div>
        );
    }

    return (
        <div ref={containerRef}>
            {content}
        </div>
    );
};

export default memo(UserList);

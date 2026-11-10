// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {connect} from 'react-redux';
import type {ConnectedProps} from 'react-redux';

import type {TestId} from '@mattermost/shared/utils/test_id';
import type {PostAction} from '@mattermost/types/integration_actions';

import {secureGetFromRecord} from 'mattermost-redux/utils/post_utils';

import {autocompleteChannels} from 'actions/channel_actions';
import {autocompleteUsers} from 'actions/user_actions';
import {selectAttachmentMenuAction} from 'actions/views/posts';

import type {GlobalState} from 'types/store';

import ActionMenu from './action_menu';

export type OwnProps = {
    postId: string;
    action: PostAction;
    disabled?: boolean;

    /** The post's testid scope; the menu is `<testIdScope>.action_select:<action id>`. */
    testIdScope?: TestId;
};

function mapStateToProps(state: GlobalState, ownProps: OwnProps) {
    const actions = state.views.posts.menuActions[ownProps.postId];
    const selected = (ownProps.action?.id) ? secureGetFromRecord(actions, ownProps.action.id) : undefined;

    return {
        selected,
    };
}

const mapDispatchToProps = {
    selectAttachmentMenuAction,
    autocompleteChannels,
    autocompleteUsers,
};

const connector = connect(mapStateToProps, mapDispatchToProps);

export type PropsFromRedux = ConnectedProps<typeof connector>;

export default connector(ActionMenu);

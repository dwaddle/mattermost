// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Shared / Global Components
import GlobalHeader from './global_header';
import UserAccountMenu from './user_account_menu';
// Channels Components
import ChannelsCenterView from './channels/center_view';
import ChannelsHeader from './channels/header';
import ChannelsPost from './channels/post';
import ChannelsPostCreate from './channels/post_create';
import ChannelSettingsModal from './channels/channel_settings/channel_settings_modal';
import ChannelsSidebarLeft from './channels/sidebar_left';
import ChannelsSidebarRight from './channels/sidebar_right';
import AddPeopleToChannelModal from './channels/add_people_to_channel_modal';
import UserGroupsModal from './channels/user_groups_modal';
import ChannelMenu from './channels/channel_menu';
import NewChannelModal from './channels/new_channel_modal';
import LinkPreview from './channels/link_preview';
import SearchBox from './channels/search_box';
import SearchResultsPanel from './channels/search_results_panel';
import SwitchProductMenu from './channels/switch_product_menu';
// Burn-on-Read Components
import BurnOnReadConcealedPlaceholder from './channels/burn_on_read_concealed_placeholder';
// System Console Components
import SystemConsoleNavbar from './system_console/navbar';
import SystemConsoleSidebar from './system_console/sidebar';
import SystemConsoleSidebarHeader from './system_console/sidebar_header';
import Users from './system_console/sections/user_management/users';

export {
    // Shared / Global
    GlobalHeader,
    UserAccountMenu,

    // Channels Page
    ChannelsCenterView,
    ChannelsHeader,
    ChannelsPost,
    ChannelsPostCreate,
    ChannelSettingsModal,
    ChannelsSidebarLeft,
    ChannelsSidebarRight,
    AddPeopleToChannelModal,
    UserGroupsModal,
    ChannelMenu,
    NewChannelModal,
    LinkPreview,
    SearchBox,
    SearchResultsPanel,
    SwitchProductMenu,

    // Burn-on-Read
    BurnOnReadConcealedPlaceholder,

    // System Console
    SystemConsoleNavbar,
    SystemConsoleSidebar,
    SystemConsoleSidebarHeader,
    Users,
};

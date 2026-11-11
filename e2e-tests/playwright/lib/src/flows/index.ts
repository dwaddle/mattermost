// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Flows: short sequences on the generated page objects that many specs share. They act and wait for elements
// (`locator.waitFor()`); specs assert.

export {calendarDayKey, pickDate, showMonth, type Calendar} from './calendar';
export {removeChip} from './chips';
export {openChannel} from './channels';
export {lastPost, postsOf, postWith, type PostList} from './posts';
export {closeChannelSettings, closeTeamSettings, openChannelSettings, openTeamSettings} from './settings';
export {openSystemUsers, searchSystemUsers} from './system_console';

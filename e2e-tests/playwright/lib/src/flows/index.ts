// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Flows: short sequences on the generated page objects that many specs share. They act and wait for elements
// (`locator.waitFor()`); specs assert.

export {loginPageUrl, logIn, logInWithKeycloak, openLogin, openSignedOut, signedInUrl} from './auth';
export {
    attributeRow,
    attributeValue,
    labelChip,
    openAttributeControl,
    openChannelInfo,
    openNewChannelModal,
    pickListOption,
    type AttributeLabels,
    type EditableAttributes,
} from './attributes';
export {calendarDayKey, pickDate, showMonth, type Calendar} from './calendar';
export {chipSwatch, comboboxChips, comboboxSwatches, removeChip, removeComboboxChip} from './chips';
export {openChannel} from './channels';
export {lastPost, postsOf, postWith, type PostList} from './posts';
export {closeChannelSettings, closeTeamSettings, openChannelSettings, openTeamSettings} from './settings';
export {openSystemUsers, searchSystemUsers} from './system_console';

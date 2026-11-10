// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// Flows: short sequences on the generated page objects that many specs share. They act and wait for elements
// (`locator.waitFor()`); specs assert.

export {lastPost, postsOf, postWith, type PostList} from './posts';

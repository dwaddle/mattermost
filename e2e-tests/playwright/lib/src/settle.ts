// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// `settle` lives with the drivers (aria/settle.ts), whose `commit()`/`submit()` use it.
export {settle, settleAll, SettleError, type SettleOptions} from './aria/settle';

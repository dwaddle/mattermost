// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/** Orders strings by code unit, the same on every machine (unlike `localeCompare`), so outputs are stable. */
export function cmp(a: string, b: string): number {
    if (a < b) {
        return -1;
    }
    return a > b ? 1 : 0;
}

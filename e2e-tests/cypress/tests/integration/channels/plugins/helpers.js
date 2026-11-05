// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import * as TIMEOUTS from '@/fixtures/timeouts';

/** A plugin's row in Plugin Management: the plugin id with every character outside [a-z0-9_] made `_`. */
export function pluginRowTestId(pluginId) {
    return `admin.plugins.plugin:${pluginId.toLowerCase().replace(/[^a-z0-9_]/g, '_')}`;
}

export function waitForAlertMessage(pluginId, message) {
    const checkFn = () => {
        cy.log(`Waiting for ${message}`);
        return cy.findByTestId(pluginRowTestId(pluginId)).scrollIntoView().then((pluginEl) => {
            return pluginEl[0].innerText.includes(message);
        });
    };

    const options = {
        timeout: TIMEOUTS.TWO_MIN,
        interval: TIMEOUTS.FIVE_SEC,
        errorMsg: `Expected "${message}" to be in plugin status but not found.`,
    };

    return cy.waitUntil(checkFn, options);
}

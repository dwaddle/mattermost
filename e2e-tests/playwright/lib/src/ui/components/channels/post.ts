// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';

import BurnOnReadConcealedPlaceholder from './burn_on_read_concealed_placeholder';
import LinkPreview from './link_preview';

export default class ChannelsPost {
    readonly container: Locator;

    readonly body;
    readonly concealedPlaceholder;

    constructor(container: Locator) {
        this.container = container;

        this.body = container.getByTestId(/\.post\.body$/);
        this.concealedPlaceholder = new BurnOnReadConcealedPlaceholder(container.getByTestId(/\.reveal--button$/));
    }

    getLinkPreview() {
        return new LinkPreview(this.body.getByTestId(/\.link_preview--link$/));
    }
}

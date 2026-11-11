// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';

import {duration} from '@mattermost/playwright-lib';

/**
 * Run `send` (typically fill slash command + click Send) while waiting for
 * POST /api/v4/commands/execute so the server finishes the slash handler before assertions.
 */
export async function sendDemoSlashCommand(page: Page, send: () => Promise<void>) {
    // Accept any response status (including 5xx) so the 45 s timeout does not fire when the
    // plugin is transiently inactive and the server returns HTTP 500.  The caller is responsible
    // for detecting a failed command (e.g. via a retry loop or explicit status check).
    const responsePromise = page.waitForResponse(
        (r) => r.url().includes('/api/v4/commands/execute') && r.request().method() === 'POST',
        {timeout: duration.one_min},
    );
    await Promise.all([send(), responsePromise]);
}

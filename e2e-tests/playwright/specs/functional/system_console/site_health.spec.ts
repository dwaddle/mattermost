// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';
import type {PlaywrightExtended} from '@mattermost/playwright-lib';

// TODO: Add a full e2e test of the health dashboard with real findings once an admin can trigger a health check run.

async function skipUnlessEnterprise(pw: PlaywrightExtended) {
    const {adminClient} = await pw.getAdminClient();
    const license = await adminClient.getClientLicenseOld();

    test.skip(
        !['enterprise', 'advanced'].includes(license.SkuShortName),
        'Skipping test - server has no enterprise or enterprise advanced license',
    );
}

/**
 * @objective Verify a system admin can open the Site health page and it loads findings without an error.
 *
 * @precondition
 * Full (Testcontainers) mode, so the server can be restarted with the HealthDashboard feature flag on.
 */
test('shows the Site health page to a system admin', {tag: '@system_console'}, async ({pw}) => {
    await skipUnlessEnterprise(pw);
    await pw.ensureFeatureFlag('HealthDashboard', true);

    const {adminUser} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(adminUser);

    // # Open Reporting > Site health
    await app.adminConsolePage.goto();
    await app.admin.sidebar.category('reporting').section('site_health').clickTitleLink();

    // * Verify the page loaded from the findings API without an error: either not evaluated yet or evaluated
    const {health} = app.admin;
    await expect(app.admin.header.locator).toHaveText('Site health');
    await expect(health.notEvaluated.locator.or(health.lastEvaluatedText.locator)).toBeVisible();
    await expect(health.loadError.locator).toHaveCount(0);
});

/**
 * @objective Verify the Site health page is not listed when the HealthDashboard feature flag is off.
 */
test('hides Site health when the feature flag is off', {tag: '@system_console'}, async ({pw}) => {
    await skipUnlessEnterprise(pw);
    await pw.ensureFeatureFlag('HealthDashboard', false);

    const {adminUser} = await pw.initSetup();
    const {app} = await pw.testBrowser.login(adminUser);

    // # Open the System Console
    await app.adminConsolePage.goto();

    // * Verify Reporting is listed but Site health is not
    const reporting = app.admin.sidebar.category('reporting');
    await expect(reporting.section('system_analytics').titleLink.locator).toBeVisible();
    await expect(reporting.section('site_health').locator).toHaveCount(0);
});

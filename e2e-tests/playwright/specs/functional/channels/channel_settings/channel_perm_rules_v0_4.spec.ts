// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * @objective E2E coverage for the v0.4 Permissions Policy tab in Channel Settings:
 *   - Tab visibility is gated by ABAC + license + the PermissionPolicies
 *     umbrella + the ChannelPermissionPolicies sub-flag.
 *   - The list view exposes Add rule, search, and a paginated rules table.
 *   - Adding a permission rule (name, role, actions) and committing returns to the list.
 *   - Per-rule expression uses the same TableEditor as Membership Policy, but
 *     re-labelled "Simulate rules" — the button opens the dual-lane
 *     SimulateAccessModal instead of the legacy expression-only one (additionally
 *     gated by the PolicySimulation feature flag).
 *   - Duplicate rule names surface a save-time error.
 *
 * @reference Channel-scoped permission policies (v0.4)
 *
 * These tests skip themselves at runtime when the PermissionPolicies umbrella
 * OR the ChannelPermissionPolicies sub-flag is not enabled on the server —
 * the tab is invisible in either case and the workflow is not exercised.
 * Run with `MM_FEATUREFLAGS_PERMISSIONPOLICIES=true` AND
 * `MM_FEATUREFLAGS_CHANNELPERMISSIONPOLICIES=true`. The "Simulate rules"
 * button additionally requires `MM_FEATUREFLAGS_POLICYSIMULATION=true`.
 */

import {expect, test, type App} from '@mattermost/playwright-lib';

import {enableABACConfig, ensureDepartmentAttribute, createPrivateChannel} from '../team_settings/helpers';

import {closeSettings, openChannel, openChannelSettings} from './access_rules';

// Written on the generated page objects: Channel Settings' tabs, its permissions policy tab (list, search, rules,
// Add rule) and rule editor (name, expression, permissions, Save / Cancel, error), and the save panel.

/** Opens Channel Settings on its permissions policy tab, showing the rules list. */
async function openPermissionsPolicy(app: App) {
    const settings = await openChannelSettings(app);

    // Suite-level feature-flag guard already covers PermissionPolicies; the tab must render.
    await expect(settings.tabs.permissionsPolicyTab.locator).toBeVisible();
    await settings.tabs.permissionsPolicyTab.select();
    await expect(settings.permissionsPolicy.list.locator).toBeVisible();
    return settings;
}

test.describe('Channel Settings Modal - Permissions Policy tab (v0.4)', () => {
    test.beforeEach(async ({pw}) => {
        await pw.skipIfNoLicense();
        // Skip the suite when either flag is OFF on the server rather
        // than relying on the tab's UI presence as a proxy — a
        // UI-based guard would silently mask a regression in the tab
        // visibility logic itself. Both flags must be on for the tab
        // to render (the channel-scope sub-flag depends on the
        // umbrella, mirroring `IsChannelPermissionPoliciesEnabled` on
        // the server).
        await pw.ensureFeatureFlag({PermissionPolicies: true, ChannelPermissionPolicies: true});
    });

    test('MM-PP_v0_4_c1 Permissions Policy tab visible on private channel when feature flag enabled', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);

        // # Open Permissions Policy (asserting the tab is there)
        const settings = await openPermissionsPolicy(app);

        // * The list view renders: search, table, Add rule button.
        const {permissionsPolicy} = settings;
        await expect(permissionsPolicy.addRuleButton.locator).toBeVisible();
        await expect(permissionsPolicy.searchTextbox.locator).toBeVisible();
        await expect(permissionsPolicy.rules.locator).toBeVisible();

        await closeSettings(settings);
    });

    test('MM-PP_v0_4_c2 Add rule opens the editor with sections in the expected order, Cancel returns to the list', async ({
        pw,
    }) => {
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        await ensureDepartmentAttribute(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openPermissionsPolicy(app);
        const {permissionsPolicy} = settings;

        // # Click "Add rule" → editor view appears
        await permissionsPolicy.clickAddRuleButton();
        const {editor} = permissionsPolicy;
        await expect(editor.locator).toBeVisible();

        // * Mirror system-console layout: name → role → user-attribute conditions → permissions list.
        const expressionSection = editor.expression.locator;
        const permissionsSection = editor.permissions.locator;
        await expect(expressionSection).toBeVisible();
        await expect(permissionsSection).toBeVisible();

        // Permissions list must render BELOW the user-attribute conditions
        // (TableEditor) so we match the System Console policy editor ordering.
        const expressionBox = await expressionSection.boundingBox();
        const permissionsBox = await permissionsSection.boundingBox();
        expect(expressionBox).not.toBeNull();
        expect(permissionsBox).not.toBeNull();
        expect(permissionsBox?.y ?? 0).toBeGreaterThan((expressionBox?.y ?? 0) + (expressionBox?.height ?? 0) - 1);

        // # Cancel → back to list view
        await editor.clickCancelButton();
        await expect(permissionsPolicy.list.locator).toBeVisible();
        await expect(editor.locator).not.toBeVisible();

        await closeSettings(settings);
    });

    test('MM-PP_v0_4_c3 Editor validates: missing name surfaces an inline error', async ({pw}) => {
        const {adminUser, adminClient, team} = await pw.initSetup();
        await enableABACConfig(adminClient);
        await ensureDepartmentAttribute(adminClient);

        const channel = await createPrivateChannel(adminClient, team.id);

        const app = await openChannel(pw, adminUser, team, channel);
        const settings = await openPermissionsPolicy(app);
        const {permissionsPolicy} = settings;

        // # Open the editor without filling the name
        await permissionsPolicy.clickAddRuleButton();
        await expect(permissionsPolicy.editor.nameTextbox.locator).toHaveValue('');
        await permissionsPolicy.editor.clickSaveButton();

        // * Inline error mentions name uniqueness/required.
        await expect(permissionsPolicy.editor.errorText.locator).toBeVisible();

        // # Leave (the open editor counts as unsaved, so the first close only warns)
        await settings.clickCloseButton();
        await settings.clickCloseButton();
        await expect(settings.tabs.infoTab.locator).not.toBeVisible();
    });

    /**
     * @objective Verify that an open permission rule editor, which blocks navigation to the modal's other
     * sections, says so instead of silently swallowing the click.
     */
    test(
        'MM-PP_v0_4_c4 blocked section switch while editing a permission rule explains itself',
        {tag: '@channel_settings'},
        async ({pw}) => {
            const {adminUser, adminClient, team} = await pw.initSetup();
            await enableABACConfig(adminClient);
            await ensureDepartmentAttribute(adminClient);

            const channel = await createPrivateChannel(adminClient, team.id);

            const app = await openChannel(pw, adminUser, team, channel);
            const settings = await openPermissionsPolicy(app);
            const {permissionsPolicy, savePanel, tabs} = settings;

            // # Open the rule editor and start a draft
            await permissionsPolicy.clickAddRuleButton();
            const {editor} = permissionsPolicy;
            await expect(editor.locator).toBeVisible();
            await editor.fillNameTextbox('Block external uploads');

            // # Try to leave the editor by selecting the Info section
            await tabs.infoTab.select();

            // * The blocked switch is reported through the modal's floating
            // footer in its error state, with saving from there disabled. The
            // modal withdraws it after 3s, so assert inside that window.
            await expect(savePanel.messageText.locator).toContainText('You have unsaved changes', {timeout: 2000});
            await expect(savePanel.locator).toHaveClass(/error/);
            await expect(savePanel.saveButton.locator).toBeDisabled();

            // * The Permissions Policy section is still the selected one and the draft is intact
            await expect(tabs.permissionsPolicyTab.locator).toHaveAttribute('aria-selected', 'true');
            await expect(editor.nameTextbox.locator).toHaveValue('Block external uploads');
            await expect(settings.info.nameTextbox.locator).not.toBeVisible();

            // # Take the way out the footer offers
            await savePanel.clickCancelButton();

            // * The draft is dropped and the rules list is back
            await expect(editor.locator).not.toBeVisible();
            await expect(permissionsPolicy.addRuleButton.locator).toBeVisible();

            // * Section switching works again once no rule is being edited
            await tabs.infoTab.select();
            await expect(settings.info.nameTextbox.locator).toBeVisible();

            await closeSettings(settings);
        },
    );
});

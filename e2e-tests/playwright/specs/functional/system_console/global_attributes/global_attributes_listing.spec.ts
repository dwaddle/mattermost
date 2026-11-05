// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * System Console — Global Attributes access gate and attribute listing.
 * Visibility is gated by an Enterprise-tier license.
 * Once past the gate, the page lists every access_control/template property field on the server.
 *
 * Local runs: upload or use a license with SkuShortName `enterprise`, `entry`, or `advanced`.
 * Professional-only licenses hide this admin route (React Router redirects away).
 */

import {expect, test, DefaultChannel, Msg} from '@mattermost/playwright-lib';

import {
    GLOBAL_ATTRIBUTES_ADMIN_PATH,
    createGlobalAttributeField,
    createLinkedDependentField,
    deleteGlobalAttributeFieldIfExists,
    deleteLinkedDependentField,
    openAttributeManagement,
    requireGlobalAttributesEnabled,
    requireHierarchicalAttributesEnabled,
} from './global_attributes_helpers';

test.describe('System Console - Global Attributes listing', {tag: '@system_console'}, () => {
    test.describe.configure({mode: 'serial'});

    test.describe('access gate', () => {
        /**
         * @objective Ensure the Attribute Management page is reachable and shows its page frame
         * on an Enterprise+ license.
         */
        test('Enterprise+ license shows Attribute Management', async ({pw}) => {
            const {adminUser} = await requireGlobalAttributesEnabled(pw);

            // # Log in and open the Attribute Management URL
            const {app} = await pw.testBrowser.login(adminUser);
            await app.page.goto(GLOBAL_ATTRIBUTES_ADMIN_PATH);

            // * URL stays on the Attribute Management section
            await expect(app.page).toHaveURL(/manage_attributes/);
            // * Sidebar menu entry and page heading are both visible
            const systemAttributes = app.admin.sidebar.category('system_attributes');
            await expect(systemAttributes.section('global_attributes').locator).toHaveText('Attribute Management');
            await expect(app.admin.header.locator).toContainText('Attribute Management');
            // * The old User Attributes sidebar entry is replaced by Attribute Management
            await expect(systemAttributes.section('user_attributes_redirect').locator).not.toBeVisible();
            await expect(systemAttributes.section('user_attributes_feature_discovery').locator).not.toBeVisible();
            // * Page frame's static subtitle is present (renders regardless of fetch state)
            await expect(app.admin.attributes.subtitleText.locator).toHaveText(
                'Define an attribute once, then choose which resources can use it.',
            );
        });
    });

    test.describe('listing', () => {
        /**
         * @objective Ensure a real access_control/template attribute renders in the table with
         * its display name, type icon+label, source, and options count — across every field
         * type the Type column has a mapping for (Text/Phone/URL/Email/Select/Multiselect/Ranked),
         * plus one unmapped type (date) to prove the fallback also holds end-to-end.
         */
        test('renders one seeded field per type with correct Attribute/Type/Source/Options values', async ({pw}) => {
            const {adminUser, adminClient} = await requireGlobalAttributesEnabled(pw);

            const timestamp = Date.now();

            // Covers the "Managed here" Source branch (all of these) alongside every Type/Options
            // combination reachable through the admin API — the plugin+protected Source branch is
            // unit-test-only since the admin API blocks source_plugin_id/protected from non-plugin
            // callers, and rank uses type: 'rank' directly (the same type Classification Markings'
            // own saveCreateField creates), not the select-based seeding some older e2e helpers use.
            // Phone/URL/email are text-field subtypes (attrs.value_type); the create menu offers
            // Phone and URL, while email is API-only (hidden in the Type menu, still listed).
            // displayName embeds the same per-run timestamp as name — required so the row locator
            // below can't collide with another concurrently-running browser project's seeded row
            // (this suite's projects share one server/worker pool; see playwright.config.ts).
            const seeds = [
                {
                    name: `e2e_global_attribute_text_${timestamp}`,
                    displayName: `E2E Text Attribute ${timestamp}`,
                    type: 'text',
                    attrs: {},
                    expectedType: 'Text',
                    expectedOptions: 'Free Text',
                },
                {
                    name: `e2e_global_attribute_phone_${timestamp}`,
                    displayName: `E2E Phone Attribute ${timestamp}`,
                    type: 'text',
                    attrs: {value_type: 'phone'},
                    expectedType: 'Phone',
                    expectedOptions: 'Free Text',
                },
                {
                    name: `e2e_global_attribute_url_${timestamp}`,
                    displayName: `E2E URL Attribute ${timestamp}`,
                    type: 'text',
                    attrs: {value_type: 'url'},
                    expectedType: 'URL',
                    expectedOptions: 'Free Text',
                },
                {
                    name: `e2e_global_attribute_email_${timestamp}`,
                    displayName: `E2E Email Attribute ${timestamp}`,
                    type: 'text',
                    attrs: {value_type: 'email'},
                    expectedType: 'Email',
                    expectedOptions: 'Free Text',
                },
                {
                    name: `e2e_global_attribute_select_${timestamp}`,
                    displayName: `E2E Select Attribute ${timestamp}`,
                    type: 'select',
                    attrs: {
                        options: [
                            {id: '', name: 'Option A'},
                            {id: '', name: 'Option B'},
                        ],
                    },
                    expectedType: 'Select',
                    expectedOptions: '2 options',
                },
                {
                    name: `e2e_global_attribute_multiselect_${timestamp}`,
                    displayName: `E2E Multiselect Attribute ${timestamp}`,
                    type: 'multiselect',
                    attrs: {
                        options: [
                            {id: '', name: 'Option A'},
                            {id: '', name: 'Option B'},
                            {id: '', name: 'Option C'},
                        ],
                    },
                    expectedType: 'Multiselect',
                    expectedOptions: '3 options',
                },
                {
                    name: `e2e_global_attribute_rank_${timestamp}`,
                    displayName: `E2E Ranked Attribute ${timestamp}`,
                    type: 'rank',
                    attrs: {
                        options: [
                            {id: '', name: 'Low', rank: 1},
                            {id: '', name: 'High', rank: 2},
                        ],
                    },
                    expectedType: 'Ranked',
                    expectedOptions: '2 options',
                },
                {
                    name: `e2e_global_attribute_date_${timestamp}`,
                    displayName: `E2E Date Attribute ${timestamp}`,
                    type: 'date',
                    attrs: {},
                    expectedType: 'Other',
                    expectedOptions: 'Free Text',
                },
            ] as const;

            try {
                // # Seed every field inside the try block — if creation fails partway
                // through (e.g. field 3 of 8), the finally below still cleans up whatever
                // was already created instead of leaving it orphaned on the shared server.
                const fields = [];
                for (const seed of seeds) {
                    fields.push(
                        await createGlobalAttributeField(adminClient, seed.name, {
                            type: seed.type,
                            attrs: {display_name: seed.displayName, ...seed.attrs},
                        }),
                    );
                }

                // # Log in and open the Attribute Management page once every field is seeded
                const {app} = await pw.testBrowser.login(adminUser);
                const attributes = await openAttributeManagement(app);

                for (const [index, seed] of seeds.entries()) {
                    const field = fields[index];

                    // * Each seeded field's display name, type, source, and options render correctly
                    await expect(attributes.name(field).locator).toHaveText(seed.displayName);
                    await expect(attributes.type(field).locator).toContainText(seed.expectedType);
                    // * A leading icon renders alongside the label, including for the
                    // unmapped "date" type (fallback icon, not a blank cell)
                    await expect(attributes.typeIcon(field).locator).toBeVisible();
                    await expect(attributes.source(field).locator).toContainText('Managed here');
                    // * "Managed here" is the one source kind reachable through the admin
                    // API (plugin/ldap/saml require server-side attrs the API blocks from
                    // non-plugin callers — those icon mappings are unit-test-only) and it
                    // renders with no leading icon, unlike plugin/ldap/saml sources
                    await expect(attributes.sourcePluginIcon(field).locator).toHaveCount(0);
                    await expect(attributes.sourceSyncIcon(field).locator).toHaveCount(0);
                    await expect(attributes.options(field).locator).toContainText(seed.expectedOptions);
                }
            } finally {
                // # Clean up regardless of assertion outcome, so reruns start from a clean slate
                for (const seed of seeds) {
                    await deleteGlobalAttributeFieldIfExists(adminClient, seed.name);
                }
            }
        });

        /**
         * @objective Ensure the table sorts by the same value shown in the Attribute column
         * (display_name, falling back to name) rather than by the hidden internal name.
         */
        test('sorts rows by the displayed Attribute value, not the internal field name', async ({pw}) => {
            const {adminUser, adminClient} = await requireGlobalAttributesEnabled(pw);

            const timestamp = Date.now();

            // Internal names sort z-then-a; display names (what the table actually shows and
            // must sort by) sort a-then-z. If the table sorted by the internal name instead,
            // these rows would render in the opposite order.
            const firstName = `zzz_e2e_sort_${timestamp}`;
            const secondName = `aaa_e2e_sort_${timestamp}`;
            const firstDisplayName = `Aardvark E2E Sort Attribute ${timestamp}`;
            const secondDisplayName = `Zebra E2E Sort Attribute ${timestamp}`;

            // No display_name set — the rendered (and sorted-by) value falls back to this
            // internal name directly. Chosen to alphabetically land between the two display
            // names above, so its position in the rendered order proves the fallback value
            // participates in sorting correctly alongside explicit display names, not just
            // in isolation (the unit tests already cover the fallback alone).
            const thirdName = `mmm_e2e_sort_fallback_${timestamp}`;

            try {
                // # Seed all three fields inside the try block — if creation fails
                // partway through, the finally below still cleans up whatever was
                // already created instead of leaving it orphaned on the shared server.
                const first = await createGlobalAttributeField(adminClient, firstName, {
                    type: 'text',
                    attrs: {display_name: firstDisplayName},
                });
                const second = await createGlobalAttributeField(adminClient, secondName, {
                    type: 'text',
                    attrs: {display_name: secondDisplayName},
                });
                const third = await createGlobalAttributeField(adminClient, thirdName, {
                    type: 'text',
                    attrs: {},
                });

                const {app} = await pw.testBrowser.login(adminUser);
                const attributes = await openAttributeManagement(app);
                await expect(attributes.name(first).locator).toHaveText(firstDisplayName);

                // * The fallback field renders under its internal name, since no display_name was set
                await expect(attributes.name(third).locator).toHaveText(thirdName);

                // * Rendered order follows the displayed Attribute value (Aardvark, then the
                // fallback name, then Zebra) — not the internal name (which would put "aaa_..."
                // first if sorted that way)
                const ids = [first.id, third.id, second.id];
                expect((await attributes.nameKeys()).filter((id) => ids.includes(id))).toEqual(ids);
            } finally {
                await deleteGlobalAttributeFieldIfExists(adminClient, firstName);
                await deleteGlobalAttributeFieldIfExists(adminClient, secondName);
                await deleteGlobalAttributeFieldIfExists(adminClient, thirdName);
            }
        });

        /**
         * @objective Ensure a seeded graph field renders as Hierarchical with an options count,
         * not as Free Text or an unknown type.
         */
        test('renders a seeded graph field as Hierarchical with its option count', async ({pw}) => {
            await pw.ensureFeatureFlag('PropertyFieldGraph', true);
            const {adminUser, adminClient} = await requireHierarchicalAttributesEnabled(pw);

            const timestamp = Date.now();
            const name = `e2e_global_attribute_graph_${timestamp}`;
            const displayName = `E2E Hierarchical Attribute ${timestamp}`;

            try {
                const field = await createGlobalAttributeField(adminClient, name, {
                    type: 'graph',
                    attrs: {
                        display_name: displayName,
                        options: [
                            {id: '', name: 'Air', parents: []},
                            {id: '', name: 'Fighter', parents: ['Air']},
                        ],
                    },
                });

                const {app} = await pw.testBrowser.login(adminUser);
                const attributes = await openAttributeManagement(app);

                await expect(attributes.name(field).locator).toHaveText(displayName);
                await expect(attributes.type(field).locator).toContainText('Hierarchical');
                await expect(attributes.typeIcon(field).locator).toBeVisible();
                await expect(attributes.source(field).locator).toContainText('Managed here');
                await expect(attributes.options(field).locator).toContainText('2 options');
            } finally {
                await deleteGlobalAttributeFieldIfExists(adminClient, name);
            }
        });

        /**
         * @objective Verify each attribute's persisted sort_order propagates to profile settings
         * and popover ordering. The Manage Attributes table has no manual reorder control today,
         * so this sets sort_order directly via the API rather than through a UI action.
         */
        test("propagates each attribute's persisted sort_order to profile settings and popover ordering", async ({
            pw,
        }) => {
            await requireGlobalAttributesEnabled(pw);
            const {adminClient, team, user} = await pw.initSetup();

            const timestamp = Date.now();
            const labels = [`PW Sort First ${timestamp}`, `PW Sort Second ${timestamp}`, `PW Sort Third ${timestamp}`];
            const names = labels.map((_, index) => `e2e_global_attribute_sort_${index}_${timestamp}`);
            const linkedIds: string[] = [];

            try {
                // # Create three attributes with sort_order descending relative to creation
                // order, so the rendered order proves it follows sort_order, not insertion order.
                for (const [index, label] of labels.entries()) {
                    const template = await createGlobalAttributeField(adminClient, names[index], {
                        type: 'text',
                        attrs: {display_name: label, sort_order: (labels.length - index) * 10},
                    });
                    const linked = await createLinkedDependentField(
                        adminClient,
                        names[index],
                        template.id,
                        'text',
                        'user',
                        {display_name: label, sort_order: (labels.length - index) * 10, visibility: 'always'},
                    );
                    linkedIds.push(linked.id);

                    await adminClient.updateUserCustomProfileAttributesValues(user.id, {
                        [linked.id]: `Value ${index + 1}`,
                    });
                }

                // sort_order is 30/20/10 for First/Second/Third, so ascending order is
                // Third, Second, First.
                const expectedOrder = [linkedIds[2], linkedIds[1], linkedIds[0]];

                // * The expected order renders in profile settings (Settings > Profile), whose
                // sections are keyed `customAttribute_<field id>`
                const {app} = await pw.testBrowser.login(user);
                await app.channelsPage.goto({team, channel: 'town-square'});
                const settings = await (await app.globalHeader.clickOpenAccountMenuButton()).clickProfileMenuItem();
                const sectionKeys = expectedOrder.map((id) => `customAttribute_${id}`);
                await expect
                    .poll(async () => (await app.settings.sectionKeys()).filter((key) => sectionKeys.includes(key)))
                    .toEqual(sectionKeys);
                await settings.clickCloseButton();
                await expect(settings.locator).not.toBeVisible();

                // * The same order renders in the profile popover
                const message = `sort-order-${timestamp}`;
                await app.center.postCreate.fillMessageTextbox(message);
                await app.center.postCreate.clickSendButton();
                const {postList} = app.center;
                await expect
                    .poll(async () => {
                        const lastId = (await postList.postKeys()).at(-1);
                        return lastId ? postList.post({id: lastId}).messageText.locator.textContent() : '';
                    })
                    .toBe(message);
                await postList.post({id: (await postList.postKeys()).at(-1)!}).avatar.locator.click();
                await expect
                    .poll(async () => (await app.profilePopover.attributeKeys()).filter((id) => linkedIds.includes(id)))
                    .toEqual(expectedOrder);
            } finally {
                for (const linkedId of linkedIds) {
                    await deleteLinkedDependentField(adminClient, linkedId);
                }
                for (const name of names) {
                    await deleteGlobalAttributeFieldIfExists(adminClient, name);
                }
            }
        });
    });

    test.describe('delete attribute', () => {
        /**
         * @objective Ensure the row kebab's Delete action removes the attribute end-to-end:
         * the confirmation names the attribute, and confirming drops the row from the table.
         */
        test('deletes an attribute from the row menu after confirming, and the row disappears', async ({pw}) => {
            const {adminUser, adminClient} = await requireGlobalAttributesEnabled(pw);

            const timestamp = Date.now();
            const name = `e2e_global_attribute_delete_${timestamp}`;
            const displayName = `E2E Delete Attribute ${timestamp}`;

            try {
                const field = await createGlobalAttributeField(adminClient, name, {
                    type: 'text',
                    attrs: {display_name: displayName},
                });

                const {app} = await pw.testBrowser.login(adminUser);
                let attributes = await openAttributeManagement(app);
                await expect(attributes.name(field).locator).toHaveText(displayName);

                // # Open the row kebab and click Delete
                await attributes.actions(field).click();
                await attributes.actionsMenu.deleteMenuItem.click();

                // * The confirmation names the specific attribute rather than prompting generically
                await expect(attributes.deleteModal.locator).toContainText(`Delete ${displayName} attribute`);

                // # Confirm
                await attributes.deleteModal.clickConfirmButton();

                // * The row is gone and no error banner appeared
                await expect(attributes.name(field).locator).toHaveCount(0);
                await expect(attributes.deleteError.locator).toHaveCount(0);

                // * The delete really hit the server, not just the client store — a fresh
                // page load still doesn't show it
                attributes = await openAttributeManagement(app);
                await expect(attributes.nameItems.first()).toBeVisible();
                await expect(attributes.name(field).locator).toHaveCount(0);
            } finally {
                await deleteGlobalAttributeFieldIfExists(adminClient, name);
            }
        });

        /**
         * @objective Ensure cancelling the confirmation is a true no-op — no delete call fires
         * and the attribute survives a reload.
         */
        test('leaves the attribute in place when the confirmation is cancelled', async ({pw}) => {
            const {adminUser, adminClient} = await requireGlobalAttributesEnabled(pw);

            const timestamp = Date.now();
            const name = `e2e_global_attribute_cancel_${timestamp}`;
            const displayName = `E2E Cancel Attribute ${timestamp}`;

            try {
                const field = await createGlobalAttributeField(adminClient, name, {
                    type: 'text',
                    attrs: {display_name: displayName},
                });

                const {app} = await pw.testBrowser.login(adminUser);
                let attributes = await openAttributeManagement(app);
                await expect(attributes.name(field).locator).toHaveText(displayName);

                // # Open the row kebab, click Delete, then back out
                await attributes.actions(field).click();
                await attributes.actionsMenu.deleteMenuItem.click();
                await expect(attributes.deleteModal.locator).toContainText(`Delete ${displayName} attribute`);
                await attributes.deleteModal.clickCancelButton();

                // * The modal closed and the row survived
                await expect(attributes.deleteModal.locator).toHaveCount(0);
                await expect(attributes.name(field).locator).toHaveText(displayName);

                // * Nothing was deleted server-side either
                attributes = await openAttributeManagement(app);
                await expect(attributes.name(field).locator).toHaveText(displayName);
            } finally {
                await deleteGlobalAttributeFieldIfExists(adminClient, name);
            }
        });

        /**
         * @objective Ensure a server-side 409 (the attribute still has live linked dependents)
         * surfaces as the specific "still linked" banner above the table, not the generic error,
         * and leaves the row intact. Exercised against a real 409 from the server rather than a
         * stubbed rejection.
         */
        test('shows the linked-dependents banner and keeps the row when the server refuses the delete', async ({
            pw,
        }) => {
            const {adminUser, adminClient} = await requireGlobalAttributesEnabled(pw);

            const timestamp = Date.now();
            const name = `e2e_global_attribute_linked_${timestamp}`;
            const displayName = `E2E Linked Attribute ${timestamp}`;
            const dependentName = `e2e_global_attribute_dependent_${timestamp}`;

            let dependentFieldId: string | undefined;

            try {
                const field = await createGlobalAttributeField(adminClient, name, {
                    type: 'text',
                    attrs: {display_name: displayName},
                });

                // # Point a dependent field at it, which is what makes the server refuse the delete
                const dependent = await createLinkedDependentField(adminClient, dependentName, field.id, 'text');
                dependentFieldId = dependent.id;

                const {app} = await pw.testBrowser.login(adminUser);
                const attributes = await openAttributeManagement(app);
                await expect(attributes.name(field).locator).toHaveText(displayName);

                // # Try to delete it
                await attributes.actions(field).click();
                await attributes.actionsMenu.deleteMenuItem.click();
                await attributes.deleteModal.clickConfirmButton();

                // * The banner explains the blocking dependency instead of the generic failure
                const banner = attributes.deleteError;
                await expect(banner.locator).toBeVisible();
                await expect(banner.locator).toContainText('other attributes are still linked to it');
                await expect(banner.locator).not.toContainText('An error occurred while deleting this attribute');

                // * The row survived the rejected delete
                await expect(attributes.name(field).locator).toHaveText(displayName);

                // # The banner is dismissible
                await banner.clickCloseButton();
                await expect(banner.locator).toHaveCount(0);
            } finally {
                // Dependent first: the source delete stays blocked while it exists
                if (dependentFieldId) {
                    await deleteLinkedDependentField(adminClient, dependentFieldId);
                }
                await deleteGlobalAttributeFieldIfExists(adminClient, name);
            }
        });
    });

    test.describe('read-only for non-sysadmin', () => {
        /**
         * @objective Ensure a system_manager (non-sysadmin with System Console access) sees
         * Attribute Management as read-only: New attribute disabled, row menu offers View
         * instead of Edit, and Delete is disabled. The create/edit page they can still open
         * is already schema-gated as read-only; this covers the listing that previously
         * ignored isDisabled.
         */
        test('disables New attribute and Delete, and offers View, for a system_manager', async ({pw}) => {
            const {adminClient} = await requireGlobalAttributesEnabled(pw);
            const {user: systemManagerUser} = await pw.initSetup();

            const timestamp = Date.now();
            const name = `e2e_global_attribute_readonly_${timestamp}`;
            const displayName = `E2E Readonly Attribute ${timestamp}`;

            try {
                await adminClient.updateUserRoles(systemManagerUser.id, 'system_user system_manager');

                const field = await createGlobalAttributeField(adminClient, name, {
                    type: 'text',
                    attrs: {display_name: displayName},
                });

                const {app} = await pw.testBrowser.login(systemManagerUser);
                const attributes = await openAttributeManagement(app);
                await expect(app.page).toHaveURL(/manage_attributes/);

                // * New attribute is disabled — schema isDisabled wires through the listing
                await expect(attributes.newButton.locator).toBeDisabled();
                await expect(attributes.name(field).locator).toHaveText(displayName);

                // # Open the row actions menu
                await attributes.actions(field).click();

                // * View (not Edit) is offered and navigable; Delete stays disabled
                const viewItem = attributes.actionsMenu.editMenuItem;
                await expect(viewItem.locator).toContainText('View attribute');
                await expect(viewItem.locator).not.toHaveAttribute('aria-disabled', 'true');

                const deleteItem = attributes.actionsMenu.deleteMenuItem;
                await expect(deleteItem.locator).toContainText('Delete attribute');
                await expect(deleteItem.locator).toHaveAttribute('aria-disabled', 'true');

                // # View opens the details page (read-only via the same schema isDisabled)
                await viewItem.click();
                await expect(app.page).toHaveURL(new RegExp(`/attribute_details/${field.id}$`));
                await expect(app.admin.attribute.displayNameTextbox.locator).toBeDisabled();
            } finally {
                await deleteGlobalAttributeFieldIfExists(adminClient, name);
            }
        });
    });
});

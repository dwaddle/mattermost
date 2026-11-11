// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

/**
 * LOCALIZATION NOTE:
 * This test suite uses test attributes (data-testid, id) for buttons to avoid
 * language dependencies, but still has some localization dependencies:
 * - Error message text assertions (e.g., 'Invalid email address')
 * - Field labels (e.g., 'Username', 'Email')
 * - Test data values (e.g., 'JavaScript', 'Python' option names)
 *
 * Currently runs in English-only (locale: 'en-US' in playwright.config.ts).
 * For multi-language support, these assertions would need refactoring.
 */

import type {Team} from '@mattermost/types/teams';
import type {UserProfile} from '@mattermost/types/users';
import type {Client4} from '@mattermost/client';
import type {UserPropertyField} from '@mattermost/types/properties_user';

import {expect, generated, getRandomId, test, type App} from '@mattermost/playwright-lib';

import type {CustomProfileAttribute} from '../../channels/custom_profile_attributes/helpers';
import {
    setupCustomProfileAttributeFields,
    setupCustomProfileAttributeValuesForUser,
    deleteCustomProfileAttributes,
    getFieldIdByName,
} from '../../channels/custom_profile_attributes/helpers';
import {optionId} from '../../channels/channel_attributes/helpers';

import {search} from './support';

// Written on the generated page objects: System Console > Users' search and row by user id, and the user detail page
// (system fields, attribute rows by field id with their inputs and errors, the fields layout, Save with its
// confirmation dialog, Cancel).

/** Per-run CPA names — avoids reusing global fields (e.g. "Old Name") from other suites. */
let cpaFieldNames: {
    department: string;
    workEmail: string;
    personalWebsite: string;
    location: string;
    skills: string;
};

let testUserAttributes: CustomProfileAttribute[];

let team: Team;
let adminUser: UserProfile;
let testUser: UserProfile;
let attributeFieldsMap: Record<string, UserPropertyField> = {};
let adminClient: Client4;
let app: App | undefined;

/** A created attribute field by its name. */
function field(name: string): UserPropertyField {
    const found = Object.values(attributeFieldsMap).find((f) => !(f instanceof Set) && f.name === name);
    if (!found) {
        throw new Error(`No attribute field named ${name}`);
    }
    return found;
}

/** A text attribute's input on the user detail page. */
function attributeInput(name: string) {
    return app!.admin.user.attribute(field(name)).valueTextbox.locator;
}

test.describe('System Console - Admin User Profile Editing', () => {
    test.beforeEach(async ({pw}) => {
        // Ensure license for Custom Profile Attributes functionality.
        // isEnterpriseLicense() in the webapp only returns true for SKUs: enterprise, E20,
        // advanced, entry. If the CI license is a lower tier, CPA rendering is gated off.
        await pw.ensureLicense();
        await pw.skipIfNoLicense();

        // Self-isolating setup — avoid pw.initSetup()'s destructive
        // adminClient.updateConfig() full-config reset which wipes CPA fields mid-run
        // for other concurrent tests in the same worker pool. Create a uniquely-named
        // team and user per test instead.
        const clientInfo = await pw.getAdminClient();
        if (!clientInfo.adminUser) {
            throw new Error('Admin user not found');
        }
        adminClient = clientInfo.adminClient;
        adminUser = clientInfo.adminUser;
        const suffix = getRandomId();
        cpaFieldNames = {
            department: `UAAE_Department_${suffix}`,
            workEmail: `UAAE_Work_Email_${suffix}`,
            personalWebsite: `UAAE_Personal_Website_${suffix}`,
            location: `UAAE_Location_${suffix}`,
            skills: `UAAE_Skills_${suffix}`,
        };
        testUserAttributes = [
            {
                name: cpaFieldNames.department,
                value: 'Engineering',
                type: 'text',
                attrs: {
                    visibility: 'when_set',
                },
            },
            {
                name: cpaFieldNames.workEmail,
                value: 'work@company.com',
                type: 'text',
                attrs: {
                    value_type: 'email',
                    visibility: 'when_set',
                    display_name: 'Work Email',
                },
            },
            {
                name: cpaFieldNames.personalWebsite,
                value: 'https://johndoe.com',
                type: 'text',
                attrs: {
                    value_type: 'url',
                    visibility: 'when_set',
                    display_name: 'Personal Website',
                },
            },
            {
                name: cpaFieldNames.location,
                type: 'select',
                attrs: {
                    visibility: 'when_set',
                },
                options: [
                    {name: 'Remote', color: '#00FFFF'},
                    {name: 'Office', color: '#FF00FF'},
                    {name: 'Hybrid', color: '#FFFF00'},
                ],
            },
            {
                name: cpaFieldNames.skills,
                type: 'multiselect',
                attrs: {
                    visibility: 'when_set',
                },
                options: [
                    {name: 'JavaScript', color: '#F0DB4F'},
                    {name: 'React', color: '#61DAFB'},
                    {name: 'Python', color: '#3776AB'},
                    {name: 'Go', color: '#00ADD8'},
                ],
            },
        ];
        team = await adminClient.createTeam({
            name: `uaae-${suffix}`,
            display_name: `UAAE ${suffix}`,
            type: 'O',
        } as any);
        await adminClient.addToTeam(team.id, adminUser.id);

        // Create test user to edit
        testUser = await pw.createNewUserProfile(adminClient, {prefix: 'admin-edit-target-'});
        await adminClient.addToTeam(team.id, testUser.id);

        // Pre-cleanup: delete stale UAAE-prefixed fields from previous runs of
        // this suite. The prefix is unique to these tests; do not delete other
        // suites' fields. attribute_order_and_popover now cleans up its own.
        try {
            const existingFields = await adminClient.getCustomProfileAttributeFields();
            const staleUaaeFields = existingFields.filter((f) => f.name.startsWith('UAAE_'));
            if (staleUaaeFields.length > 0) {
                const staleMap: Record<string, UserPropertyField> = {};
                for (const f of staleUaaeFields) {
                    staleMap[f.id] = f;
                }
                await deleteCustomProfileAttributes(adminClient, staleMap);
            }
        } catch {
            // Best-effort — if cleanup fails, proceed and let the real error surface below.
        }

        // Set up custom user attribute fields
        attributeFieldsMap = await setupCustomProfileAttributeFields(adminClient, testUserAttributes);

        // Fail fast if any expected field was not created — setupCustomProfileAttributeFields
        // silently swallows 422 errors (e.g. 20-field server limit), leaving the map incomplete.
        // Without this check the test would only time out 30 s later at the UI assertion with a
        // misleading "element not found" error.
        const missingFields = testUserAttributes
            .map((a) => a.name)
            .filter((name) => !Object.values(attributeFieldsMap).some((f) => f.name === name));
        if (missingFields.length > 0) {
            const all = await adminClient.getCustomProfileAttributeFields().catch(() => []);
            throw new Error(
                `CPA field creation failed for: [${missingFields.join(', ')}]. ` +
                    `Server currently has ${all.length} fields: [${all.map((f) => f.name).join(', ')}]. ` +
                    'Possible 20-field limit breach — check for leaked fields from other test suites.',
            );
        }

        // Fields reused by name can still carry access_mode=source_only from another suite; the admin
        // user detail page hides those (system_user_detail.tsx) so no CPA labels ever appear.
        const refreshedFields = await adminClient.getCustomProfileAttributeFields();
        for (const attr of testUserAttributes) {
            const field = refreshedFields.find((f) => f.name === attr.name);
            if (field?.attrs?.access_mode === 'source_only') {
                await adminClient.patchCustomProfileAttributeField(field.id, {
                    attrs: {...field.attrs, access_mode: ''},
                } as any);
            }
        }

        // Set initial custom attribute values for the test user
        await setupCustomProfileAttributeValuesForUser(
            adminClient,
            testUserAttributes,
            attributeFieldsMap,
            testUser.id,
        );

        // Login as admin
        ({app} = await pw.testBrowser.login(adminUser));

        // Navigate to system console users
        await app.page.goto(`${generated.AdminConsolePage.path()}/user_management/users`);
        await expect(app.admin.users.searchTextbox.locator).toBeVisible();

        // Search for target user and navigate to user detail page
        await search(app, testUser.email, testUser);
        await app.admin.users.table.row(testUser.id).cell('emailColumn').locator.click();

        // Wait for the initial navigation to the user detail page.
        await app.page.waitForURL(`**/admin_console/user_management/user/${testUser.id}`);

        // Freeze the fields API so concurrent shard activity (field creates/deletes) cannot
        // trigger a WebSocket-driven re-fetch that wipes the CPA section from Redux mid-test.
        const frozenFields = Object.values(attributeFieldsMap);
        await app.page.route('**/api/v4/custom_profile_attributes/fields', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(frozenFields),
            });
        });

        // Reload the page to clear the Redux CPA field cache.
        //
        // system_user_detail.tsx componentDidMount only calls getCustomProfileAttributeFields()
        // when customProfileAttributeFields.length === 0 (line 226). Playwright reuses the same
        // browser context across beforeEach runs, so the in-memory Redux store from the previous
        // test still holds the OLD UAAE field definitions (e.g. UAAE_Department_fe45b8d). Even
        // though afterEach deleted those fields from the server, Redux never clears them. On the
        // next beforeEach the condition is false, the fetch is skipped, the stale labels render,
        // and span:text-is("UAAE_Department_<new-suffix>") never matches — causing a 30 s timeout.
        //
        // A full page reload tears down the React/Redux state so componentDidMount starts with an
        // empty store and unconditionally fetches the current (freshly created) fields.
        await app.page.reload();
        await app.page.waitForURL(`**/admin_console/user_management/user/${testUser.id}`);
        await expect(app.admin.user.emailTextbox.locator).toBeVisible();
        await expect(attributeInput(cpaFieldNames.department)).toBeVisible({timeout: 30_000});
        await expect(attributeInput(cpaFieldNames.workEmail)).toBeVisible({timeout: 30_000});

        // Remove the intercept now that field visibility is confirmed.
        // Keeping it active through the test body would intercept the save API call
        // (which also hits the /fields endpoint during submit), causing "Failed to update user".
        // Validation tests restore their own intercept via try/finally.
        await app.page.unroute('**/api/v4/custom_profile_attributes/fields').catch(() => {});
    });

    test.afterEach(async ({pw}) => {
        // When beforeEach was skipped (e.g. test.skip()), attributeFieldsMap stays
        // empty and there is nothing server-side to clean up.
        if (Object.keys(attributeFieldsMap).length === 0) {
            return;
        }
        // Safety-net unroute in case a validation test's try/finally was skipped by an
        // earlier error, or the beforeEach unroute was never reached.
        await app?.page.unroute('**/api/v4/custom_profile_attributes/fields').catch(() => {});
        // Clean up custom user attribute fields
        const {adminClient: cleanupClient} = await pw.getAdminClient();
        await deleteCustomProfileAttributes(cleanupClient, attributeFieldsMap);
    });

    test('MM-65126 Should edit custom user attributes from system console', async () => {
        const userDetail = app!.admin.user;

        // # Find and edit Department field (custom text attribute)
        const departmentInput = attributeInput(cpaFieldNames.department);
        await departmentInput.clear();
        await departmentInput.fill('Marketing');

        // # Click Save button and confirm
        const confirm = await userDetail.clickSaveButton();
        await confirm.clickConfirmButton();

        // * Verify success (no error message and field retains new value)
        await expect(userDetail.saveErrorText.locator).not.toBeVisible();
        await expect(departmentInput).toHaveValue('Marketing');

        // * Verify Save button becomes disabled after successful save
        await expect(userDetail.saveButton.locator).toBeSaved();
    });

    test('Should display user attributes in two-column layout', async () => {
        const userDetail = app!.admin.user;

        // * Verify two-column layout exists
        await expect(userDetail.fields.locator).toBeVisible();

        // * Verify system fields are present
        await expect(userDetail.usernameTextbox.locator).toBeVisible();
        await expect(userDetail.emailTextbox.locator).toBeVisible();
        await expect(userDetail.authMethodText.locator).toBeVisible();

        // * Verify custom user attributes are present
        for (const attribute of testUserAttributes) {
            const label = attribute.attrs?.display_name || attribute.name;
            await expect(userDetail.attribute(field(attribute.name)).locator).toContainText(label);
        }

        // * Verify fields are arranged in rows
        await expect(userDetail.fields.rowItems.first()).toBeVisible();
    });

    test('Should edit system email attribute and save', async () => {
        const userDetail = app!.admin.user;
        const emailInput = userDetail.emailTextbox.locator;

        // # Enter new valid email
        const newEmail = `updated-${testUser.email}`;
        await emailInput.clear();
        await emailInput.fill(newEmail);

        // # Click Save button and confirm
        const confirm = await userDetail.clickSaveButton();
        await confirm.clickConfirmButton();

        // * Verify success
        await expect(userDetail.saveErrorText.locator).not.toBeVisible();
        await expect(emailInput).toHaveValue(newEmail);
        await expect(userDetail.saveButton.locator).toBeSaved();
    });

    test('Should edit custom select attribute and save', async () => {
        const userDetail = app!.admin.user;

        // # Find Location select field
        const location = userDetail.attribute(field(cpaFieldNames.location)).valueCombobox;

        // # Pick an option
        await location.choose('Remote');

        // # Click Save button and confirm
        const confirm = await userDetail.clickSaveButton();
        await confirm.clickConfirmButton();

        // * Verify success and persistence
        await expect(userDetail.saveErrorText.locator).not.toBeVisible();
        // Don't check exact value since it's a generated ID, just verify it's not empty
        const selectedValue = await location.locator.inputValue();
        expect(selectedValue).toBeTruthy();
        await expect(userDetail.saveButton.locator).toBeSaved();
    });

    test('Should display custom multiselect attribute and save form', async () => {
        const userDetail = app!.admin.user;

        // * Verify Skills multiselect component is displayed
        const skillsColumn = userDetail.attribute(field(cpaFieldNames.skills)).locator;
        await expect(skillsColumn).toBeVisible();

        // # Make a change to a different field to trigger save state
        const departmentInput = attributeInput(cpaFieldNames.department);
        await departmentInput.fill('Engineering Updated');

        // # Verify save button becomes enabled
        await expect(userDetail.saveButton.locator).toBeEnabled();

        // # Save the form and confirm
        const confirm = await userDetail.clickSaveButton();
        await confirm.clickConfirmButton();

        // * Verify success (no error message)
        await expect(userDetail.saveErrorText.locator).not.toBeVisible();

        // * Verify save completed
        await expect(userDetail.saveButton.locator).toBeSaved();

        // * Verify the change persisted
        await expect(departmentInput).toHaveValue('Engineering Updated');
        await expect(chips).toHaveText(['JavaScript']);
        await expect
            .poll(() => adminClient.getUserCustomProfileAttributesValues(testUser.id))
            .toMatchObject({[skillsField.id]: [optionId(skillsField, 'JavaScript')]});
    });

    /**
     * @objective Verify clicking a multiselect attribute's field name focuses its combobox without removing a chip or changing the value.
     */
    test(
        'clicking a multiselect attribute name focuses its input and keeps its chips',
        {tag: '@user_management'},
        async () => {
            const {userDetail} = systemConsolePage!.users;
            const {userCard} = userDetail;
            const skills = cpaDisplayLabels.skills;
            const skillsFieldId = getFieldIdByName(attributeFieldsMap, cpaFieldNames.skills);
            const comboboxId = `user-detail-custom-attribute-combobox-${skillsFieldId}`;
            const skillsCombobox = userCard.getCpaCombobox(skills);
            const skillsLabel = userCard.getCpaFieldLabel(skills);
            const chips = userCard.getCpaChips(skills);

            // * Verify the field name is a label pointing at the combobox
            await expect(skillsCombobox).toHaveAttribute('id', comboboxId);
            await expect(skillsLabel).toHaveAttribute('for', comboboxId);

            // # Pick two skills and save them
            await userCard.selectCpaOption(skills, 'JavaScript');
            await userCard.selectCpaOption(skills, 'React');
            await expect(chips).toHaveText(['JavaScript', 'React']);
            await userDetail.save();
            await userDetail.saveChangesModal.confirm();
            await userDetail.waitForSaveComplete();

            // # Move focus to another field
            const departmentInput = userCard.getFieldInputByExactLabel(cpaDisplayLabels.department);
            await departmentInput.focus();
            await expect(skillsCombobox).not.toBeFocused();

            // # Click the Skills field name
            await skillsLabel.click();

            // * Verify the combobox is focused, both chips remain, and nothing changed
            await expect(skillsCombobox).toBeFocused();
            await expect(chips).toHaveText(['JavaScript', 'React']);
            await expect(userDetail.saveButton).toBeDisabled();
            await expect(userDetail.cancelButton).not.toBeVisible();
        },
    );

    test('Should validate invalid email and show error with cancel option', async () => {
        const userDetail = app!.admin.user;

        // Re-apply the fields intercept for this validation test.
        // Without it, a concurrent CPA test's afterEach can delete our fields via the
        // setupCustomProfileAttributeFields early-return bug. The server then emits
        // WebsocketEventCPAFieldDeleted; the browser re-fetches /fields; Redux clears;
        // handleCpaValueChange finds field===undefined and skips setting the error state,
        // so the field-error element never renders and the assertion times out.
        const frozenFields = Object.values(attributeFieldsMap);
        await app!.page.route('**/api/v4/custom_profile_attributes/fields', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(frozenFields),
            });
        });
        try {
            // # Find CPA email field (Work Email)
            const workEmailInput = attributeInput(cpaFieldNames.workEmail);
            await workEmailInput.scrollIntoViewIfNeeded();
            const originalEmail = await workEmailInput.inputValue();

            // # Enter invalid email
            await workEmailInput.clear();
            await workEmailInput.fill('not-an-email');

            // * Verify inline validation error appears
            const fieldError = userDetail.attribute(field(cpaFieldNames.workEmail)).errorAlert.locator;
            await expect(fieldError).toBeVisible({timeout: 30000});
            await expect(fieldError).toContainText('Invalid email address');

            // * Verify Save button is disabled due to validation error
            await expect(userDetail.saveButton.locator).toBeDisabled();

            // * Verify Cancel button is visible and enabled
            await expect(userDetail.cancelButton.locator).toBeVisible();
            await expect(userDetail.cancelButton.locator).toBeEnabled();

            // # Test the cancel functionality
            await userDetail.clickCancelButton();

            // * Verify email reverts to original value
            await expect(workEmailInput).toHaveValue(originalEmail);

            // * Verify validation error disappears
            await expect(fieldError).not.toBeVisible();

            // * Verify Cancel button disappears
            await expect(userDetail.cancelButton.locator).not.toBeVisible();

            // * Verify Save button remains disabled (no unsaved changes)
            await expect(userDetail.saveButton.locator).toBeDisabled();
        } finally {
            await app!.page.unroute('**/api/v4/custom_profile_attributes/fields').catch(() => {});
        }
    });

    test('Should validate invalid URL and show error with cancel option', async () => {
        const userDetail = app!.admin.user;

        // Re-apply the fields intercept — same race-condition guard as the email validation test.
        const frozenFields = Object.values(attributeFieldsMap);
        await app!.page.route('**/api/v4/custom_profile_attributes/fields', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(frozenFields),
            });
        });
        try {
            // # Find custom URL field (Personal Website)
            const urlInput = attributeInput(cpaFieldNames.personalWebsite);
            const originalUrl = await urlInput.inputValue();

            // # Enter invalid URL (specifically the one mentioned: "<%>")
            await urlInput.clear();
            await urlInput.fill('<%>');

            // * Verify inline validation error appears
            const fieldError = userDetail.attribute(field(cpaFieldNames.personalWebsite)).errorAlert.locator;
            await expect(fieldError).toBeVisible();
            await expect(fieldError).toContainText('Invalid URL');

            // * Verify Save button is disabled due to validation error
            await expect(userDetail.saveButton.locator).toBeDisabled();

            // * Verify Cancel button is visible
            await expect(userDetail.cancelButton.locator).toBeVisible();
            await expect(userDetail.cancelButton.locator).toBeEnabled();

            // # Test cancel functionality
            await userDetail.clickCancelButton();

            // * Verify URL reverts to original value
            await expect(urlInput).toHaveValue(originalUrl);

            // * Verify validation error disappears
            await expect(fieldError).not.toBeVisible();

            // * Verify Cancel button disappears
            await expect(userDetail.cancelButton.locator).not.toBeVisible();
        } finally {
            await app!.page.unroute('**/api/v4/custom_profile_attributes/fields').catch(() => {});
        }
    });

    test('Should validate invalid email in custom email attribute', async () => {
        const userDetail = app!.admin.user;

        // Re-apply the fields intercept — same race-condition guard as the other validation tests.
        const frozenFields = Object.values(attributeFieldsMap);
        await app!.page.route('**/api/v4/custom_profile_attributes/fields', async (route) => {
            await route.fulfill({
                status: 200,
                contentType: 'application/json',
                body: JSON.stringify(frozenFields),
            });
        });
        try {
            // # Find custom email field (Work Email)
            const workEmailInput = attributeInput(cpaFieldNames.workEmail);

            // # Enter invalid email
            await workEmailInput.clear();
            await workEmailInput.fill('not-an-email-either');

            // * Verify inline validation error appears
            const fieldError = userDetail.attribute(field(cpaFieldNames.workEmail)).errorAlert.locator;
            await expect(fieldError).toBeVisible();
            await expect(fieldError).toContainText('Invalid email address');

            // * Verify Save button is disabled due to validation error
            await expect(userDetail.saveButton.locator).toBeDisabled();

            // * Verify Cancel button is available
            await expect(userDetail.cancelButton.locator).toBeVisible();
        } finally {
            await app!.page.unroute('**/api/v4/custom_profile_attributes/fields').catch(() => {});
        }
    });

    test('Should show save/cancel buttons when changes are made', async () => {
        const userDetail = app!.admin.user;

        // * Initially, Save should be disabled and Cancel should not be visible
        await expect(userDetail.saveButton.locator).toBeDisabled();
        await expect(userDetail.cancelButton.locator).not.toBeVisible();

        // # Make a change to trigger save needed state
        const departmentInput = attributeInput(cpaFieldNames.department);
        const originalValue = await departmentInput.inputValue();
        await departmentInput.clear();
        await departmentInput.fill('Changed Value');

        // * Verify Save button becomes enabled and Cancel button appears
        await expect(userDetail.saveButton.locator).toBeEnabled();
        await expect(userDetail.cancelButton.locator).toBeVisible();
        await expect(userDetail.cancelButton.locator).toBeEnabled();

        // # Click Cancel
        await userDetail.clickCancelButton();

        // * Verify changes are reverted
        await expect(departmentInput).toHaveValue(originalValue);

        // * Verify Cancel button disappears
        await expect(userDetail.cancelButton.locator).not.toBeVisible();

        // * Verify Save button is disabled
        await expect(userDetail.saveButton.locator).toBeDisabled();
    });

    test('Should save all user attribute changes atomically', async () => {
        const userDetail = app!.admin.user;

        // # Make changes to both system and custom attributes
        const newEmail = `atomic-test-${testUser.email}`;
        await userDetail.emailTextbox.locator.clear();
        await userDetail.emailTextbox.locator.fill(newEmail);

        const departmentInput = attributeInput(cpaFieldNames.department);
        await departmentInput.clear();
        await departmentInput.fill('Sales');

        // # Click Save button and confirm
        const confirm = await userDetail.clickSaveButton();
        await confirm.clickConfirmButton();

        // * Verify both changes were saved successfully
        await expect(userDetail.saveErrorText.locator).not.toBeVisible();
        await expect(userDetail.emailTextbox.locator).toHaveValue(newEmail);
        await expect(departmentInput).toHaveValue('Sales');
        await expect(userDetail.saveButton.locator).toBeSaved();
    });
});

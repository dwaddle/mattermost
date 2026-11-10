// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

/**
 * @objective Verify arrow key navigation through all menu items in the team menu
 */
test(
    'navigate using arrow keys between menu items',
    {tag: ['@accessibility', '@team_menu', '@keyboard_navigation']},
    async ({pw}) => {
        // # Initialize setup and make the user a team admin to see all menu items
        const {user, team, adminClient} = await pw.initSetup();
        await adminClient.updateTeamMemberSchemeRoles(team.id, user.id, true, true);

        // # Create an open team the user is not on, since other specs may already have left one on the server
        const openTeam = await pw.random.team('open-team', 'Open Team');
        await adminClient.createTeam({...openTeam, allow_open_invite: true});

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const header = app.lhs.header;
        const teamMenu = app.lhs.teamMenu;

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Set focus on team menu button and press Enter to open the menu
        await header.openTeamMenuButton.locator.focus();
        await page.keyboard.press('Enter');

        await pw.logFocusedElement(page);

        // * Team menu should be visible, list "Join another team", and focus the first menu item - "Invite people"
        await expect(teamMenu.locator).toBeVisible();
        await expect(teamMenu.joinAnotherTeamMenuItem.locator).toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.invitePeopleMenuItem.locator)).toBe(true);

        // # Press ArrowDown to move focus to "Team settings" menu item
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.teamSettingsMenuItem.locator)).toBe(true);

        // # Press ArrowDown to move focus to "Manage members" menu item
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.membersMenuItem.locator)).toBe(true);

        // # Press ArrowDown to move focus to "Leave team" menu item
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.leaveTeamMenuItem.locator)).toBe(true);

        // # Press ArrowDown to move focus to "Join another team" menu item
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.joinAnotherTeamMenuItem.locator)).toBe(true);

        // # Press ArrowDown to move focus to "Create a team" menu item
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.createTeamMenuItem.locator)).toBe(true);

        // # Press ArrowDown to move focus to "Learn about teams" menu item
        await page.keyboard.press('ArrowDown');
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.learnAboutTeamsMenuItem.locator)).toBe(true);
    },
);

/**
 * @objective Verify Tab key navigation escapes menu and moves to next focusable element
 */
test(
    'navigate using Tab key to escape menu',
    {tag: ['@accessibility', '@team_menu', '@keyboard_navigation']},
    async ({pw}) => {
        // # Create and sign in a new user
        const {user} = await pw.initSetup();
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const header = app.lhs.header;
        const teamMenu = app.lhs.teamMenu;

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Set focus on team menu button and press Enter to open the menu
        await header.openTeamMenuButton.locator.focus();
        await page.keyboard.press('Enter');

        // * Team menu should be visible and focus should be on first menu item
        await expect(teamMenu.locator).toBeVisible();
        expect(await pw.toBeFocusedWithFocusVisible(teamMenu.invitePeopleMenuItem.locator)).toBe(true);

        // # Press Tab to exit menu and move to next focusable element outside menu
        await page.keyboard.press('Tab');

        // * Team menu should be closed and focus should move to next focusable element
        await expect(teamMenu.locator).not.toBeVisible();

        // * Focus should be on the next focusable element - "Browse or create channels" button
        await expect(header.openTeamMenuButton.locator).not.toBeFocused();
        await expect(header.openBrowseOrAddMenuButton.locator).toBeFocused();
    },
);

/**
 * @objective Verify menu items can be activated using Enter and Space keys
 */
test(
    'activate menu items using Enter and Space keys',
    {tag: ['@accessibility', '@team_menu', '@keyboard_navigation']},
    async ({pw}) => {
        // # Initialize setup and make the user a team admin to see all menu items
        const {user, team, adminClient} = await pw.initSetup();
        await adminClient.updateTeamMemberSchemeRoles(team.id, user.id, true, true);

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const header = app.lhs.header;
        const teamMenu = app.lhs.teamMenu;

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Click on team menu button to open the menu
        await header.openTeamMenuButton.locator.focus();
        await page.keyboard.press('Enter');

        // * Team menu should be visible
        await expect(teamMenu.locator).toBeVisible();

        // # Set focus on "Team settings" menu item and press Enter
        await teamMenu.teamSettingsMenuItem.locator.focus();
        await page.keyboard.press('Enter');

        // * Team settings modal should open (wait for navigation or modal)
        await expect(app.teamSettingsModal.locator).toBeVisible();

        // # Close the modal using Escape key
        await page.keyboard.press('Escape');

        await expect(app.teamSettingsModal.locator).not.toBeVisible();

        // # Reopen team menu
        await header.openTeamMenuButton.locator.focus();
        await page.keyboard.press('Enter');
        await expect(teamMenu.locator).toBeVisible();

        // # Set focus on "Learn about teams" menu item and press Space
        await teamMenu.invitePeopleMenuItem.locator.focus();
        await page.keyboard.press(' ');

        // * Should navigate to learn about teams documentation or open modal
        const invitePeopleModal = app.invitationModal;
        await expect(invitePeopleModal.locator).toBeVisible();
        await expect(invitePeopleModal.invite.titleText.locator).toContainText(team.display_name);
    },
);

/**
 * @objective Verify Escape key closes the team menu
 */
test('close menu using Escape key', {tag: ['@accessibility', '@team_menu', '@keyboard_navigation']}, async ({pw}) => {
    // # Create and sign in a new user
    const {user} = await pw.initSetup();
    const {app, page, channelsPage} = await pw.testBrowser.login(user);
    const header = app.lhs.header;
    const teamMenu = app.lhs.teamMenu;

    // # Visit a default channel page
    await channelsPage.goto();
    await channelsPage.toBeVisible();

    // # Click on team menu button to open the menu
    await header.openTeamMenuButton.locator.click();

    // * Team menu should be visible
    await expect(teamMenu.locator).toBeVisible();

    // # Press Escape key
    await page.keyboard.press('Escape');

    // * Team menu should be closed
    await expect(teamMenu.locator).not.toBeVisible();

    // * Focus should return to the team menu button
    expect(await pw.toBeFocusedWithFocusVisible(header.openTeamMenuButton.locator)).toBe(true);
});

/**
 * @objective Verify team menu accessibility compliance and aria-snapshot structure
 */
test(
    'accessibility scan and aria-snapshot of team menu',
    {tag: ['@accessibility', '@team_menu', '@snapshots']},
    async ({pw, axe}) => {
        // # Initialize setup and make the user a team admin to see all menu items
        const {user, team, adminClient} = await pw.initSetup();
        await adminClient.updateTeamMemberSchemeRoles(team.id, user.id, true, true);

        // # Log in a user in new browser context
        const {app, page, channelsPage} = await pw.testBrowser.login(user);
        const header = app.lhs.header;
        const teamMenu = app.lhs.teamMenu;

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Click on team menu button to open the menu
        await header.openTeamMenuButton.locator.click();

        // * Team menu should be visible
        await expect(teamMenu.locator).toBeVisible();

        // * Verify aria snapshot of team menu structure
        await expect(teamMenu.locator).toMatchAriaSnapshot();

        // # Analyze the team menu for accessibility issues
        const accessibilityScanResults = await axe
            .builder(page, {disableColorContrast: true})
            .include(`[data-testid="${teamMenu.scope}"]`)
            .analyze();

        // * Should have no violations
        expect(accessibilityScanResults.violations).toHaveLength(0);
    },
);

/**
 * @objective Verify menu items have proper ARIA attributes for screen readers
 */
test(
    'verify ARIA attributes and screen reader support',
    {tag: ['@accessibility', '@team_menu', '@screen_reader']},
    async ({pw}) => {
        // # Initialize setup and make the user a team admin to see all menu items
        const {user, team, adminClient} = await pw.initSetup();
        await adminClient.updateTeamMemberSchemeRoles(team.id, user.id, true, true);

        // # Log in a user in new browser context
        const {app, channelsPage} = await pw.testBrowser.login(user);
        const header = app.lhs.header;
        const teamMenu = app.lhs.teamMenu;

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Click on team menu button to open the menu
        await header.openTeamMenuButton.locator.click();

        // * Team menu should be visible
        await expect(teamMenu.locator).toBeVisible();

        // * Verify menu container has correct role
        await expect(teamMenu.locator).toHaveAttribute('role', 'menu');

        // * Verify menu items have correct roles and attributes
        await expect(teamMenu.invitePeopleMenuItem.locator).toHaveAttribute('role', 'menuitem');
        await expect(teamMenu.invitePeopleMenuItem.locator).toHaveAttribute('aria-haspopup', 'dialog');

        await expect(teamMenu.teamSettingsMenuItem.locator).toHaveAttribute('role', 'menuitem');
        await expect(teamMenu.teamSettingsMenuItem.locator).toHaveAttribute('aria-haspopup', 'dialog');

        await expect(teamMenu.membersMenuItem.locator).toHaveAttribute('role', 'menuitem');
        await expect(teamMenu.membersMenuItem.locator).toHaveAttribute('aria-haspopup', 'dialog');

        await expect(teamMenu.leaveTeamMenuItem.locator).toHaveAttribute('role', 'menuitem');
        await expect(teamMenu.leaveTeamMenuItem.locator).toHaveAttribute('aria-haspopup', 'dialog');

        await expect(teamMenu.createTeamMenuItem.locator).toHaveAttribute('role', 'menuitem');

        await expect(teamMenu.learnAboutTeamsMenuItem.locator).toHaveAttribute('role', 'menuitem');

        // * Verify menu items are focusable
        await expect(teamMenu.invitePeopleMenuItem.locator).toHaveAttribute('tabindex', '0');

        // * Verify menu items have accessible names
        await expect(teamMenu.invitePeopleMenuItem.locator).toHaveAccessibleName(
            'Invite people Add or invite people to the team',
        );
        await expect(teamMenu.teamSettingsMenuItem.locator).toHaveAccessibleName('Team settings');
        await expect(teamMenu.membersMenuItem.locator).toHaveAccessibleName('Manage members');
        await expect(teamMenu.leaveTeamMenuItem.locator).toHaveAccessibleName('Leave team');
        await expect(teamMenu.createTeamMenuItem.locator).toHaveAccessibleName('Create a team');
        await expect(teamMenu.learnAboutTeamsMenuItem.locator).toHaveAccessibleName('Learn about teams');
    },
);

/**
 * @objective Verify menu items with icons have proper visual indicators and alt text
 */
test(
    'verify visual indicators and icon accessibility',
    {tag: ['@accessibility', '@team_menu', '@visual_indicators']},
    async ({pw}) => {
        // # Initialize setup and make the user a team admin to see all menu items
        const {user, team, adminClient} = await pw.initSetup();
        await adminClient.updateTeamMemberSchemeRoles(team.id, user.id, true, true);

        // # Log in a user in new browser context
        const {app, channelsPage} = await pw.testBrowser.login(user);
        const header = app.lhs.header;
        const teamMenu = app.lhs.teamMenu;

        // # Visit a default channel page
        await channelsPage.goto();
        await channelsPage.toBeVisible();

        // # Open the menu from the keyboard (after a mouse click, a focused item never shows the keyboard focus ring)
        await header.openTeamMenuButton.locator.focus();
        await app.page.keyboard.press('Enter');

        // * Team menu should be visible
        await expect(teamMenu.locator).toBeVisible();

        // * Verify icons have aria-hidden attribute (decorative)
        const menuItems = [
            teamMenu.invitePeopleMenuItem.locator,
            teamMenu.teamSettingsMenuItem.locator,
            teamMenu.membersMenuItem.locator,
            teamMenu.leaveTeamMenuItem.locator,
            teamMenu.createTeamMenuItem.locator,
            teamMenu.learnAboutTeamsMenuItem.locator,
        ];

        for (const menuItem of menuItems) {
            // * Each menu item should contain an SVG icon with aria-hidden
            const icon = menuItem.getByRole('img', {includeHidden: true}).first();
            await expect(icon).toHaveAttribute('aria-hidden', 'true');

            // * Menu item should have visible focus indicator on focus
            await menuItem.focus();

            // * Verify the menu item is focused and has focus-visible styles
            expect(await pw.toBeFocusedWithFocusVisible(menuItem)).toBe(true);
        }
    },
);

// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, lastPost, setWysiwygUserPreference, test} from '@mattermost/playwright-lib';

/**
 * @objective Clicking a user at-mention in the composer preview opens the profile popover
 * and does not post the draft.
 *
 * @precondition Two users on the same team. The markdown composer preview is available
 * (WYSIWYG editor preference is off).
 *
 * The composer, its suggestions (by username), its preview toggle, the mention (by user id) and the popover are
 * the generated page objects.
 */
test(
    'MM-67123 clicking a user mention in composer preview opens the profile popover',
    {tag: '@mentions'},
    async ({pw}) => {
        // # Create two users on the same team and disable the WYSIWYG editor so preview is available
        const {adminClient, user, userClient, team, townSquare} = await pw.initSetup();
        await setWysiwygUserPreference(userClient, user.id, false);

        const mentionedUser = await adminClient.createUser(await pw.random.user('mentioned'), '', '');
        await adminClient.addToTeam(team.id, mentionedUser.id);
        await adminClient.addToChannel(mentionedUser.id, townSquare.id);

        const {app, channelsPage} = await pw.testBrowser.login(user);
        await app.channelsPage.goto({team, channel: townSquare});

        const unique = `preview-mention-${pw.random.id()}`;
        const composer = app.center.postCreate;
        const input = composer.messageTextbox.locator;
        const {previewArea} = channelsPage.centerView.postCreate;

        // # Type a draft that mentions the other user, picking them from the autocomplete so the mention resolves
        await input.pressSequentially(`@${mentionedUser.username}`);
        await composer.message.suggestions.item(`@${mentionedUser.username}`).select();
        await input.pressSequentially(` ${unique}`);
        const draft = await input.inputValue();

        // # Show the composer markdown preview
        await composer.clickPreviewButton();
        await expect(previewArea).toBeVisible();
        await expect(previewArea).toContainText(`@${mentionedUser.username}`);
        await expect(previewArea).toContainText(unique);

        // # Click the rendered mention in the preview
        await app.markdown.mention(mentionedUser).locator.click();

        // * The mentioned user's profile popover opens
        await expect(app.profilePopover.locator).toBeVisible();
        await expect(app.profilePopover.locator).toContainText(`@${mentionedUser.username}`);

        // * The draft remains in the composer and is not posted
        await expect(input).toHaveValue(draft);
        await expect(previewArea).toContainText(unique);

        const last = await lastPost(app.center.postList);
        await expect(last.locator).not.toContainText(unique);
    },
);

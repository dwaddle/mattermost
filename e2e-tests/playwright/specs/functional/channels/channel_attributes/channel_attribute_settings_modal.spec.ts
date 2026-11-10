// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {PropertyField} from '@mattermost/types/properties';
import type {Client4} from '@mattermost/client';
import type {Team} from '@mattermost/types/teams';

import type {PlaywrightExtended} from '@mattermost/playwright-lib';
import {expect, Msg, test} from '@mattermost/playwright-lib';

import {
    DISPLAY_LABEL_INFO,
    attributeName,
    createAttribute,
    createChannelForAttributes,
    deleteAttributes,
    purgeAttributes,
    readChannelValues,
    setChannelValue,
    valueFor,
} from './helpers';
import {add, editor, openChannel, openChannelSettingsInfo, row, setText} from './surface';

// Editing in Channel Info (and this same editor reused in Channel Settings) is
// admin-only, whatever an attribute's own setter tier says.
async function promoteToChannelAdmin(
    pw: PlaywrightExtended,
    adminClient: Client4,
    team: Team,
    channelId: string,
    prefix: string,
) {
    const channelAdmin = await pw.createNewUserProfile(adminClient, {prefix});
    await adminClient.addToTeam(team.id, channelAdmin.id);
    await adminClient.addToChannel(channelAdmin.id, channelId);
    await adminClient.updateChannelMemberSchemeRoles(channelId, channelAdmin.id, true, true);
    return channelAdmin;
}

test.describe('Channel attribute editing in Channel Settings', {tag: ['@channel_attributes']}, () => {
    test.describe.configure({mode: 'serial'});

    /**
     * @objective Verify an attribute edit made in the Channel Settings modal's Info
     * tab is staged locally -- not written until the tab's own Save is clicked --
     * unlike the same editor in the Channel Info RHS, which writes immediately.
     */
    test('stages an attribute edit and writes it only when Save is clicked', async ({pw}) => {
        await pw.ensureFeatureFlag('ChannelAttributes', true);
        await pw.skipIfNoLicense();

        const {adminClient, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const note = await createAttribute(adminClient, attributeName('modal_stage', suffix), {
                type: 'text',
                actions: [DISPLAY_LABEL_INFO],
            });
            created.push(note);

            const channel = await createChannelForAttributes(adminClient, team, `settings-stage-${suffix}`);
            const channelAdmin = await promoteToChannelAdmin(
                pw,
                adminClient,
                team,
                channel.id,
                `chanadmin-stage-${suffix}`,
            );

            const app = await openChannel(pw, channelAdmin, team, channel);

            const channelSettings = await openChannelSettingsInfo(app);
            const infoSettings = channelSettings.info;

            // # Add the unset attribute in the modal and commit with Enter, as the
            // # inline editor expects. An unset optional attribute has no row until added.
            await add(app, infoSettings.attributes, note);
            await editor(infoSettings.attributes, note).fill('drafted in modal');
            await editor(infoSettings.attributes, note).press('Enter');

            // * The row reflects the edit immediately, and the tab reports an unsaved
            // * change, but nothing has reached the server yet
            await expect(row(infoSettings.attributes, note).editButton.locator).toHaveText('drafted in modal');
            await expect(channelSettings.savePanel.messageText).toHaveMessage(Msg.saveChangesPanel.message);
            expect(valueFor(await readChannelValues(adminClient, channel.id), note)).toBeUndefined();

            // # Save the tab
            await channelSettings.savePanel.clickSaveButton();

            // * The panel leaves the unsaved state and the value is now stored
            await expect(channelSettings.savePanel.saveButton.locator).not.toBeVisible();
            await expect
                .poll(async () => {
                    return valueFor(await readChannelValues(adminClient, channel.id), note);
                })
                .toBe('drafted in modal');
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });

    /**
     * @objective Verify Reset in the Channel Settings modal discards a staged
     * attribute edit -- reverting the row in the UI -- without ever writing it.
     */
    test('Reset discards a staged attribute edit without writing it', async ({pw}) => {
        await pw.ensureFeatureFlag('ChannelAttributes', true);
        await pw.skipIfNoLicense();

        const {adminClient, team} = await pw.initSetup();
        const suffix = pw.random.id();
        const created: PropertyField[] = [];

        try {
            await purgeAttributes(adminClient);

            const note = await createAttribute(adminClient, attributeName('modal_reset', suffix), {
                type: 'text',
                actions: [DISPLAY_LABEL_INFO],
            });
            created.push(note);

            const channel = await createChannelForAttributes(adminClient, team, `settings-reset-${suffix}`);
            const channelAdmin = await promoteToChannelAdmin(
                pw,
                adminClient,
                team,
                channel.id,
                `chanadmin-reset-${suffix}`,
            );
            await setChannelValue(adminClient, channel.id, note, 'original');

            const app = await openChannel(pw, channelAdmin, team, channel);

            const channelSettings = await openChannelSettingsInfo(app);
            const infoSettings = channelSettings.info;
            await expect(row(infoSettings.attributes, note).editButton.locator).toHaveText('original');

            // # Edit the attribute, then discard it with Reset instead of Save
            await setText(app, infoSettings.attributes, note, 'discarded', 'enter');
            await expect(row(infoSettings.attributes, note).editButton.locator).toHaveText('discarded');
            await channelSettings.savePanel.clickCancelButton();

            // * The row reverts to the stored value, and the panel clears
            await expect(row(infoSettings.attributes, note).editButton.locator).toHaveText('original');
            await expect(channelSettings.savePanel.saveButton.locator).not.toBeVisible();

            // * The discarded edit never reached the server
            expect(valueFor(await readChannelValues(adminClient, channel.id), note)).toBe('original');
        } finally {
            await deleteAttributes(adminClient, created);
        }
    });
});

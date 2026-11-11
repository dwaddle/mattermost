// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {type App, expect, openChannel, test} from '@mattermost/playwright-lib';

import {sendDemoSlashCommand} from '../../helpers';

import {fieldLabelled, fieldLabels, postContaining, sendCommand} from './support';

/**
 * Picks a project type and checks which fields the dialog then shows (by label start: optional fields add
 * "(optional)") and which it doesn't.
 */
async function chooseProjectType(app: App, type: string, shown: string[], hidden: string[]) {
    const projectType = await fieldLabelled(app, 'Project Type *');
    await projectType.valueCombobox.choose(type);
    await expectFields(app, shown, hidden);
}

async function expectFields(app: App, shown: string[], hidden: string[]) {
    const has = (labels: string[], name: string) => labels.some((label) => label.startsWith(name));
    await expect
        .poll(async () => {
            const labels = await fieldLabels(app);
            return {shown: shown.filter((s) => !has(labels, s)), hidden: hidden.filter((h) => has(labels, h))};
        })
        .toEqual({shown: [], hidden: []});
}

test('should refresh dialog fields when Project Type changes via /dialog field-refresh', async ({pw}) => {
    // # Set up the demo plugin and open Town Square
    const {user, team, townSquare} = await pw.initSetup();
    await pw.ensureDemoPlugin();
    const app = await openChannel(pw, user, {team, channel: townSquare});

    // # Send /dialog field-refresh command
    const form = app.appsForm;
    await sendDemoSlashCommand(app.page, () => sendCommand(app, '/dialog field-refresh'));
    await expect(form.titleText.locator).toBeVisible();
    await expect(form.titleText.locator).toContainText('Project Configuration');

    // * At first only Project Type shows, with Cancel and Create Project
    await expectFields(app, ['Project Type *'], ['Frontend Framework', 'Platform', 'API Type']);
    await expect(form.cancelButton.locator).toBeVisible();
    await expect(form.submitButton.locator).toHaveText('Create Project');

    // * Each project type shows its own fields
    await chooseProjectType(
        app,
        'Web Application',
        ['Frontend Framework *', 'Enable PWA', 'Project Name *'],
        ['Platform', 'API Type'],
    );
    await chooseProjectType(
        app,
        'Mobile Application',
        ['Platform *', 'Minimum OS Version *', 'Project Name *'],
        ['Frontend Framework', 'Enable PWA', 'API Type'],
    );
    await chooseProjectType(
        app,
        'API Service',
        ['API Type *', 'Database *', 'Project Name *'],
        ['Platform', 'Minimum OS Version'],
    );

    // * API Type offers its three choices
    const apiType = await fieldLabelled(app, 'API Type *');
    for (const choice of ['REST API', 'GraphQL API', 'gRPC Service']) {
        await expect(apiType.locator).toContainText(choice);
    }

    // # Fill the required fields and submit
    await (await fieldLabelled(app, 'Project Name *')).fillValueTextbox('Test Project');
    const rest = apiType.optionItems.first();
    await expect(rest).toHaveAccessibleName('REST API');
    await rest.check();
    await (await fieldLabelled(app, 'Database *')).valueCombobox.choose('PostgreSQL');
    await form.clickSubmitButton();
    await expect(form.titleText.locator).not.toBeVisible();

    // * The plugin posts the new project
    await postContaining(app, 'api project: Test Project');
});

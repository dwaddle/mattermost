// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element ID when selecting an element. Create one if none.
// ***************************************************************

// Stage: @prod
// Group: @channels @not_cloud @system_console

import {settingPart} from '@/utils/admin_setting';

describe('Site URL', () => {
    before(() => {
        cy.shouldNotRunOnCloudEdition();
    });

    it('MM-T3279 - Don\'t allow clearing site URL in System Console', () => {
        // # Navigate to System Console -> Environment -> Web Server
        cy.visit('/admin_console/environment/web_server');

        // # Note the site URL value
        settingPart('ServiceSettings.SiteURL', 'value--textbox').invoke('val').then((originalSiteURLValue) => {
            // # Clear the Site URL
            settingPart('ServiceSettings.SiteURL', 'value--textbox').clear();

            // # Save
            cy.findAllByTestId('admin.save--button').click();
            cy.waitUntil(() => cy.findAllByTestId('admin.save--button').then((el) => {
                return el[0].innerText === 'Save';
            }));

            // * Check that the error message is present
            cy.findByTestId('admin.save_error').contains('Site URL cannot be cleared.');

            // # Reload the page
            cy.visit('/admin_console/environment/web_server');

            // * Check that the setting is the original value
            settingPart('ServiceSettings.SiteURL', 'value--textbox').should('have.value', originalSiteURLValue);
        });
    });
});

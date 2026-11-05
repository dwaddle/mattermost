// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element ID when selecting an element. Create one if none.
// ***************************************************************

// Stage: @prod
// Group: @channels @enterprise @not_cloud

import * as TIMEOUTS from '@/fixtures/timeouts';
import {settingPart} from '@/utils/admin_setting';

describe('Environment', () => {
    before(() => {
        cy.shouldNotRunOnCloudEdition();
        cy.apiInitSetup();
    });

    it('MM-T994 - Fields editable when enabled, but not saveable until validated', () => {
        // * Check if server has license for Elasticsearch
        cy.apiRequireLicenseForFeature('Elasticsearch');

        cy.visit('/admin_console/environment/elasticsearch');

        // * Verify the ElasticSearch fields are disabled
        settingPart('connectionUrl', 'value--textbox').should('be.disabled');
        settingPart('skipTLSVerification', 'false--radio').should('be.disabled');
        settingPart('username', 'value--textbox').should('be.disabled');
        settingPart('password', 'value--textbox').should('be.disabled');
        settingPart('sniff', 'true--radio').should('be.disabled');
        settingPart('sniff', 'false--radio').should('be.disabled');
        settingPart('enableSearching', 'true--radio').should('be.disabled');
        settingPart('enableSearching', 'false--radio').should('be.disabled');
        settingPart('enableAutocomplete', 'true--radio').should('be.disabled');
        settingPart('enableAutocomplete', 'false--radio').should('be.disabled');

        cy.visit('/admin_console/environment/elasticsearch');

        // # Enable Elasticsearch
        settingPart('enableIndexing', 'true--radio').check();

        // * Verify the ElasticSearch fields are enabled
        settingPart('connectionUrl', 'value--textbox').should('not.be.disabled');
        settingPart('skipTLSVerification', 'false--radio').should('not.be.disabled');
        settingPart('username', 'value--textbox').should('not.be.disabled');
        settingPart('password', 'value--textbox').should('not.be.disabled');
        settingPart('sniff', 'true--radio').should('not.be.disabled');
        settingPart('sniff', 'false--radio').should('not.be.disabled');

        cy.get('.sidebar-section').first().click();

        // * Verify the behavior when Yes, Discard button in the confirmation message is clicked
        cy.get('#confirmModalButton').should('be.visible').and('have.text', 'Yes, Discard').click().wait(TIMEOUTS.HALF_SEC);
        cy.get('.confirmModal').should('not.exist');
    });
});

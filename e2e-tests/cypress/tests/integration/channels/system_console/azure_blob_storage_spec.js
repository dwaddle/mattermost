// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {settingPart, settingSelector} from '@/utils/admin_setting';

// ***************************************************************
// - [#] indicates a test step (e.g. # Go to a page)
// - [*] indicates an assertion (e.g. * Check the title)
// - Use element ID when selecting an element. Create one if none.
// ***************************************************************

// Stage: @prod
// Group: @channels @not_cloud @system_console

describe('Environment - File Storage (Azure Blob Storage)', () => {
    before(() => {
        cy.shouldNotRunOnCloudEdition();
        cy.apiAdminLogin();
    });

    beforeEach(() => {
        cy.visit('/admin_console/environment/file_storage');
        settingPart('FileSettings.DriverName', 'value--combobox').should('be.visible');
    });

    it('shows the Azure Blob Storage option in the File Storage System dropdown', () => {
        // * Verify the Azure option is present alongside Local and S3
        settingPart('FileSettings.DriverName', 'value--combobox').
            find('option[value="azureblob"]').
            should('have.text', 'Azure Blob Storage');
    });

    it('enables Azure-only fields and hides S3-only fields when Azure is selected', () => {
        // # Select the Azure driver
        settingPart('FileSettings.DriverName', 'value--combobox').select('azureblob');

        // * Azure fields are enabled
        settingPart('FileSettings.AzureStorageAccount', 'value--textbox').should('not.be.disabled');
        settingPart('FileSettings.AzureContainer', 'value--textbox').should('not.be.disabled');
        settingPart('FileSettings.AzurePathPrefix', 'value--textbox').should('not.be.disabled');
        settingPart('FileSettings.AzureAuthMode', 'value--combobox').should('not.be.disabled');
        settingPart('FileSettings.AzureAccessKey', 'value--textbox').should('not.be.disabled');
        settingPart('FileSettings.AzureCloud', 'value--combobox').should('not.be.disabled');
        settingPart('FileSettings.AzureRequestTimeoutMilliseconds', 'value--spinbutton').should('not.be.disabled');

        // * The cloud dropdown exposes commercial / government / custom
        settingPart('FileSettings.AzureCloud', 'value--combobox').find('option[value="commercial"]').should('have.text', 'Azure Commercial');
        settingPart('FileSettings.AzureCloud', 'value--combobox').find('option[value="government"]').should('have.text', 'Azure Government');
        settingPart('FileSettings.AzureCloud', 'value--combobox').find('option[value="custom"]').should('have.text', 'Custom Endpoint');

        // * S3 fields are not rendered when the driver is not S3
        cy.get(settingSelector('FileSettings.AmazonS3Bucket', 'value--textbox')).should('not.exist');
        cy.get(settingSelector('FileSettings.AmazonS3AccessKeyId', 'value--textbox')).should('not.exist');

        // * Local directory is disabled (still rendered)
        settingPart('FileSettings.Directory', 'value--textbox').should('be.disabled');
    });

    it('shows the custom endpoint only for the Custom cloud and the SSL toggle only for the other clouds', () => {
        // # Select the Azure driver, then start on Commercial
        settingPart('FileSettings.DriverName', 'value--combobox').select('azureblob');
        settingPart('FileSettings.AzureCloud', 'value--combobox').select('commercial');

        // * Custom-only fields are hidden, SSL toggle is visible
        cy.get(settingSelector('FileSettings.AzureEndpoint', 'value--textbox')).should('not.exist');
        settingPart('FileSettings.AzureSSL', 'true--radio').should('not.be.disabled');

        // # Switch to Government
        settingPart('FileSettings.AzureCloud', 'value--combobox').select('government');
        cy.get(settingSelector('FileSettings.AzureEndpoint', 'value--textbox')).should('not.exist');
        settingPart('FileSettings.AzureSSL', 'true--radio').should('not.be.disabled');

        // # Switch to Custom
        settingPart('FileSettings.AzureCloud', 'value--combobox').select('custom');

        // * Custom endpoint becomes visible; SSL toggle goes away
        settingPart('FileSettings.AzureEndpoint', 'value--textbox').should('not.be.disabled');
        cy.get(settingSelector('FileSettings.AzureSSL', 'true--radio')).should('not.exist');
    });

    it('hides Azure-only fields when the S3 driver is selected', () => {
        // # Select the S3 driver
        settingPart('FileSettings.DriverName', 'value--combobox').select('amazons3');

        // * Azure fields are not rendered when the driver is not Azure
        cy.get(settingSelector('FileSettings.AzureStorageAccount', 'value--textbox')).should('not.exist');
        cy.get(settingSelector('FileSettings.AzureContainer', 'value--textbox')).should('not.exist');
        cy.get(settingSelector('FileSettings.AzureAuthMode', 'value--combobox')).should('not.exist');
        cy.get(settingSelector('FileSettings.AzureAccessKey', 'value--textbox')).should('not.exist');
        cy.get(settingSelector('FileSettings.AzureCloud', 'value--combobox')).should('not.exist');
        cy.get(settingSelector('FileSettings.AzureEndpoint', 'value--textbox')).should('not.exist');
    });

    it('hides the access key when the authentication mode is default credential', () => {
        // # Select the Azure driver
        settingPart('FileSettings.DriverName', 'value--combobox').select('azureblob');

        // * Shared key is the default and the access key is visible
        settingPart('FileSettings.AzureAuthMode', 'value--combobox').should('have.value', 'shared_key');
        settingPart('FileSettings.AzureAccessKey', 'value--textbox').scrollIntoView().should('be.visible');

        // # Switch to default credential
        settingPart('FileSettings.AzureAuthMode', 'value--combobox').select('default_credential');

        // * The access key field is removed from the DOM
        cy.get(settingSelector('FileSettings.AzureAccessKey', 'value--textbox')).should('not.exist');

        // # Switch back to shared key
        settingPart('FileSettings.AzureAuthMode', 'value--combobox').select('shared_key');

        // * The access key field reappears
        settingPart('FileSettings.AzureAccessKey', 'value--textbox').scrollIntoView().should('be.visible');
    });

    it('exposes the backend-agnostic Test Connection button when Azure is selected', () => {
        // # Select the Azure driver
        settingPart('FileSettings.DriverName', 'value--combobox').select('azureblob');

        // * The renamed button is rendered and is no longer S3-named
        cy.get('#TestFileStoreConnection').scrollIntoView().should('be.visible');
        cy.get('#TestFileStoreConnection').findByText('Test Connection').should('exist');
        cy.get('#TestS3Connection').should('not.exist');
    });
});

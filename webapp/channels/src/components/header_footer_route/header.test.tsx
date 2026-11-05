// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import React from 'react';

import {renderWithContext, screen} from 'tests/react_testing_utils';
import {LicenseSkus} from 'utils/constants';

import Header from './header';

describe('components/header_footer_route/header', () => {
    const renderHeader = (siteName: string, license: Record<string, string>) => renderWithContext(
        <Header/>,
        {entities: {general: {config: {SiteName: siteName}, license}}},
    );

    test('free edition, default name: the edition banner is the logo link', () => {
        renderHeader('Mattermost', {IsLicensed: 'false'});

        expect(screen.getByTestId('public.header.logo--link')).toHaveTextContent('TEAM EDITION');
        expect(screen.queryByTestId('public.header.site_name--link')).not.toBeInTheDocument();
    });

    test('free edition, custom name: the banner, then the site name', () => {
        renderHeader('Acme Chat', {IsLicensed: 'false'});

        expect(screen.getByTestId('public.header.logo--link')).toHaveTextContent('TEAM EDITION');
        expect(screen.getByTestId('public.header.site_name--link')).toHaveTextContent('Acme Chat');
    });

    test('entry edition, default name: the entry banner is the logo link', () => {
        renderHeader('Mattermost', {IsLicensed: 'true', SkuShortName: LicenseSkus.Entry});

        expect(screen.getByTestId('public.header.logo--link')).toHaveTextContent('ENTRY EDITION');
    });

    test('licensed, default name: the logo alone', () => {
        renderHeader('Mattermost', {IsLicensed: 'true', SkuShortName: LicenseSkus.Enterprise});

        expect(screen.getByTestId('public.header.logo--link').querySelector('svg')).toBeInTheDocument();
        expect(screen.queryByTestId('public.header.site_name--link')).not.toBeInTheDocument();
    });

    test('licensed, custom name: the site name alone', () => {
        renderHeader('Acme Chat', {IsLicensed: 'true', SkuShortName: LicenseSkus.Enterprise});

        expect(screen.queryByTestId('public.header.logo--link')).not.toBeInTheDocument();
        expect(screen.getByTestId('public.header.site_name--link')).toHaveTextContent('Acme Chat');
    });
});

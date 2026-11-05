// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import {expect, test} from '@mattermost/playwright-lib';

import {openSignup} from './support';

/**
 * @objective Verify all password-complexity requirements are enforced on signup.
 */
test(
    'MM-T1774 rejects signup passwords that miss a required character class',
    {tag: '@authentication'},
    async ({pw, page}) => {
        const {adminClient} = await pw.initSetup();

        await adminClient.patchConfig({
            PasswordSettings: {Lowercase: true, Number: true, Uppercase: true, Symbol: true},
        });

        const app = await openSignup(pw, page);
        const card = app.signup.card;
        await card.fillEmailTextbox(`test-${pw.random.id()}@example.com`);
        await card.fillUsernameTextbox(`user${pw.random.id()}`);
        await card.setTermsCheckbox(true);

        for (const password of ['NOLOWERCASE12345!', 'nouppercase12345!', 'NoNumberHere!!!', 'NoSymbol1234567']) {
            // # Submit a password missing a required character class
            await card.fillPasswordTextbox(password);
            await card.clickCreateAccountButton();

            // * Verify the complexity error is shown
            await expect(card.password.messageAlert.locator).toHaveText(
                /Your password must be \d+-72 characters long and include both lowercase and uppercase letters, numbers, and special characters\./,
            );
        }
    },
);

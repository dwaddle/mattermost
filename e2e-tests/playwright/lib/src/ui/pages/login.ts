// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Page} from '@playwright/test';
import {expect} from '@playwright/test';

export default class LoginPage {
    readonly page: Page;

    readonly title;
    readonly loginInput;
    readonly openIdLoginButton;
    readonly passwordInput;
    readonly signInButton;

    constructor(page: Page) {
        this.page = page;

        this.title = page.getByRole('heading', {name: 'Log in to your account'});
        this.loginInput = page.locator('#input_loginId');
        // Accessible name is the configurable ButtonText, so it isn't stable across tests.
        this.openIdLoginButton = page.locator('#openid');
        this.passwordInput = page.locator('#input_password-input');
        this.signInButton = page.getByRole('button', {name: 'Log in'});
    }

    async toBeVisible() {
        await this.page.waitForLoadState('networkidle');
        await expect(this.title).toBeVisible();
        await expect(this.loginInput).toBeVisible();
        await expect(this.passwordInput).toBeVisible();
    }

    async goto(url = '/login') {
        await this.page.goto(url, {waitUntil: 'domcontentloaded'});
    }

    async submitCredentials(loginId: string, password: string) {
        await this.loginInput.fill(loginId);
        await this.passwordInput.fill(password);
        await this.signInButton.click();
    }

    async expectNotOnLoginPage() {
        await expect(this.page).not.toHaveURL(/\/login/);
    }
}

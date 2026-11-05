// Copyright (c) 2015-present Mattermost, Inc. All Rights Reserved.
// See LICENSE.txt for license information.

import type {Locator} from '@playwright/test';
import {expect} from '@playwright/test';

/**
 * System Console -> Reporting -> Team Statistics
 */
export default class TeamStatistics {
    readonly container: Locator;
    readonly header: Locator;

    // Team filter
    readonly teamFilterDropdown: Locator;

    // Banner
    readonly banner: Locator;

    // Statistics cards
    readonly totalActivatedUsers: StatCard;
    readonly publicChannels: StatCard;
    readonly privateChannels: StatCard;
    readonly totalPosts: StatCard;

    // Charts
    readonly totalPostsChart: ChartSection;
    readonly activeUsersWithPostsChart: ChartSection;

    // Tables
    readonly recentActiveUsers: TableSection;
    readonly newlyCreatedUsers: TableSection;

    constructor(container: Locator) {
        this.container = container;
        this.header = container.getByTestId('admin.statistics.header--text');

        this.teamFilterDropdown = container.getByTestId('admin.statistics.team--combobox');

        this.banner = container.getByTestId('admin.statistics.banner');

        this.totalActivatedUsers = new StatCard(container.getByTestId('admin.statistics.stat:totalActiveUsers'));
        this.publicChannels = new StatCard(container.getByTestId('admin.statistics.stat:publicChannels'));
        this.privateChannels = new StatCard(container.getByTestId('admin.statistics.stat:privateChannels'));
        this.totalPosts = new StatCard(container.getByTestId('admin.statistics.stat:totalPosts'));

        this.totalPostsChart = new ChartSection(container.getByTestId('admin.statistics.chart:totalPosts'));
        this.activeUsersWithPostsChart = new ChartSection(
            container.getByTestId('admin.statistics.chart:activeUsersWithPosts'),
        );

        this.recentActiveUsers = new TableSection(container.getByTestId('admin.statistics.table:recentActiveUsers'));
        this.newlyCreatedUsers = new TableSection(container.getByTestId('admin.statistics.table:newlyCreatedUsers'));
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
        await expect(this.header).toBeVisible();
    }

    async selectTeam(teamName: string) {
        // Wait for the dropdown to be enabled (it may be disabled while loading)
        await expect(this.teamFilterDropdown).toBeEnabled();
        await this.teamFilterDropdown.selectOption({label: teamName});
    }

    async selectTeamById(teamId: string) {
        // Wait for the dropdown to be enabled (it may be disabled while loading)
        await expect(this.teamFilterDropdown).toBeEnabled();
        await this.teamFilterDropdown.selectOption({value: teamId});
    }

    async getSelectedTeam(): Promise<string> {
        return (await this.teamFilterDropdown.inputValue()) ?? '';
    }

    /**
     * Verify the team statistics header shows the expected team name
     */
    async toHaveTeamHeader(teamDisplayName: string) {
        const heading = this.container.getByText(`Team Statistics for ${teamDisplayName}`, {exact: true});
        await expect(heading).toBeVisible();
    }
}

class StatCard {
    readonly container: Locator;
    readonly title: Locator;
    readonly value: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.title = container.getByTestId('admin.statistics.stat.title--text');
        this.value = container.getByTestId('admin.statistics.stat.value--text');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async getValue(): Promise<string> {
        return (await this.value.textContent()) ?? '';
    }
}

class ChartSection {
    readonly container: Locator;
    readonly title: Locator;
    readonly content: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.title = container.getByTestId('admin.statistics.chart.title--text');
        this.content = container.getByTestId('admin.statistics.chart.content');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }

    async hasNoData(): Promise<boolean> {
        const text = await this.content.textContent();
        return text?.includes('Not enough data') ?? false;
    }
}

class TableSection {
    readonly container: Locator;
    readonly title: Locator;
    readonly table: Locator;

    constructor(container: Locator) {
        this.container = container;
        this.title = container.getByTestId('admin.statistics.table.title--text');
        this.table = container.getByTestId('admin.statistics.table.content').locator('table');
    }

    async toBeVisible() {
        await expect(this.container).toBeVisible();
    }
}

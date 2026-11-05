// e2e code the stale-reference check reads (not part of the scanned app)
declare const page: {getByTestId: (id: string | RegExp) => unknown; locator: (s: string) => unknown};

page.getByTestId('live.row');
page.getByTestId('live.renamed_row');
page.locator('[data-testid^="lazy.label"]');
page.getByTestId(/^lazy\.label--text$/);
page.getByTestId('computed-at-runtime');
const scope = 'lazy';
page.getByTestId(`${scope}.chip:0`);

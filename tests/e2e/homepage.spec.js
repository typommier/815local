const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

test.describe('Homepage', () => {
  test.beforeEach(async ({ page }) => {
    // Intercept the Supabase CDN request so the mock runs instead
    await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
    // Inject mock before any scripts run
    await page.addInitScript({ path: SUPABASE_MOCK });
    await page.goto('/');
  });

  test('nav renders with key links', async ({ page }) => {
    const nav = page.locator('#main-nav');
    await expect(nav).toBeVisible();
    await expect(nav.getByRole('link', { name: /explore/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /browse/i })).toBeVisible();
    await expect(nav.getByRole('link', { name: /events/i })).toBeVisible();
  });

  test('hero section renders', async ({ page }) => {
    await expect(page.locator('#hero-stat-line')).toBeVisible();
    await expect(page.getByRole('link', { name: /browse businesses/i })).toBeVisible();
  });

  test('trust stats update from mock data', async ({ page }) => {
    // stat-businesses is populated from businesses_with_ratings count
    const stat = page.locator('#stat-businesses');
    await expect(stat).toBeVisible();
    await page.waitForFunction(
      () => {
        const el = document.getElementById('stat-businesses');
        return el && el.textContent.trim() !== '…';
      },
      { timeout: 8000 }
    );
    const text = await stat.textContent();
    expect(parseInt(text, 10)).toBeGreaterThan(0);
  });

  test('community picks grid renders businesses', async ({ page }) => {
    const grid = page.locator('#community-picks-grid');
    await expect(grid).toBeVisible();

    // Grid should be populated, either cards or an empty-state message
    await expect(grid).not.toBeEmpty({ timeout: 8000 });

    const cards = grid.locator('a.biz-card');
    const emptyMsg = grid.locator('text=No businesses yet');
    const count = await cards.count();
    const hasEmpty = await emptyMsg.isVisible().catch(() => false);

    expect(count > 0 || hasEmpty).toBe(true);
  });

  test('community picks cards link to business detail pages', async ({ page }) => {
    const grid = page.locator('#community-picks-grid');
    await expect(grid.locator('a.biz-card').first()).toBeVisible({ timeout: 8000 });
    const href = await grid.locator('a.biz-card').first().getAttribute('href');
    expect(href).toMatch(/\/pages\/business\.html\?id=.+/);
  });

  test('newsletter form is present', async ({ page }) => {
    await expect(page.locator('#newsletter-email')).toBeVisible();
    await expect(page.locator('#newsletter-btn, button[type="submit"]')).toBeVisible();
  });

  test('Organization/WebSite JSON-LD is present in the head', async ({ page }) => {
    const blocks = await page.locator('script[type="application/ld+json"]').allTextContents();
    expect(blocks.length).toBeGreaterThan(0);
    const graph = blocks.map(b => JSON.parse(b)).flatMap(d => d['@graph'] || [d]);
    const types = graph.map(n => n['@type']);
    expect(types).toContain('Organization');
    expect(types).toContain('WebSite');
  });

  test('no fatal JS errors crash the page', async ({ page }) => {
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.waitForTimeout(3000);
    const fatal = errors.filter(m =>
      !m.includes('Failed to fetch') &&
      !m.includes('net::ERR') &&
      !m.includes('analytics') &&
      !m.includes('SecurityError')
    );
    expect(fatal, `JS errors: ${fatal.join('\n')}`).toHaveLength(0);
  });
});

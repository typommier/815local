const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

async function stub(page) {
  await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
  await page.addInitScript({ path: SUPABASE_MOCK });
}

// The dev server (`npx serve`) rewrites /pages/x.html to /pages/x with a 301 that
// drops the query string, so page.url() after a click never shows the params.
// Capture the outgoing request instead, which is what the browser actually asked for.
// Cloudflare Pages serves the .html path directly, so production keeps the query.
async function searchTo(page, act) {
  const [req] = await Promise.all([
    page.waitForRequest(r => r.isNavigationRequest() && r.url().includes('/pages/directory')),
    act(),
  ]);
  return new URL(req.url()).search;
}

test.describe('Hero search hands off to the directory', () => {
  test.beforeEach(async ({ page }) => {
    await stub(page);
    await page.goto('/');
  });

  test('a term with no town', async ({ page }) => {
    await page.fill('#hero-q', 'pizza');
    expect(await searchTo(page, () => page.click('.search-go'))).toBe('?q=pizza');
  });

  test('a town with no term', async ({ page }) => {
    await page.selectOption('#hero-town', 'Minooka');
    expect(await searchTo(page, () => page.click('.search-go'))).toBe('?town=Minooka');
  });

  test('both together', async ({ page }) => {
    await page.fill('#hero-q', 'pizza');
    await page.selectOption('#hero-town', 'Shorewood');
    expect(await searchTo(page, () => page.click('.search-go'))).toBe('?q=pizza&town=Shorewood');
  });

  test('neither, so no query string at all', async ({ page }) => {
    expect(await searchTo(page, () => page.click('.search-go'))).toBe('');
  });

  test('Enter in the text field submits too', async ({ page }) => {
    await page.fill('#hero-q', 'tacos');
    expect(await searchTo(page, () => page.press('#hero-q', 'Enter'))).toBe('?q=tacos');
  });

  test('a term is encoded, not injected raw', async ({ page }) => {
    await page.fill('#hero-q', 'fish & chips');
    expect(await searchTo(page, () => page.click('.search-go'))).toBe('?q=fish+%26+chips');
  });
});

// Extensionless path on purpose: it is the one form the dev server does not redirect,
// so the query string survives. Same page, same JS.
test.describe('Directory town filter', () => {
  const cards = '#biz-list .biz-list-card';

  test('?town= filters the list and shows a removable chip', async ({ page }) => {
    await stub(page);
    await page.goto('/pages/directory?town=Minooka');
    await expect(page.locator(cards).first()).toBeVisible({ timeout: 8000 });

    await expect(page.locator('#active-filters')).toContainText('Minooka');
    const filtered = await page.locator(cards).count();

    await page.locator('#active-filters button', { hasText: 'Minooka' }).click();
    await expect(page.locator('#active-filters')).not.toContainText('Minooka');
    expect(await page.locator(cards).count()).toBeGreaterThan(filtered);
    expect(new URL(page.url()).searchParams.get('town')).toBeNull();
  });

  test('the town is case-insensitive in the URL', async ({ page }) => {
    await stub(page);
    await page.goto('/pages/directory?town=minooka');
    await expect(page.locator(cards).first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#active-filters')).toContainText('Minooka');
  });

  test('a town we do not cover is ignored, not filtered to zero', async ({ page }) => {
    await stub(page);
    await page.goto('/pages/directory?town=Chicago');
    await expect(page.locator(cards).first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#active-filters')).not.toContainText('Chicago');
    expect(await page.locator(cards).count()).toBeGreaterThan(0);
  });

  test('Clear all clears the town too', async ({ page }) => {
    await stub(page);
    // Two filters, so the "Clear all" chip renders at all.
    await page.goto('/pages/directory?town=Minooka&search=rosario');
    await expect(page.locator(cards).first()).toBeVisible({ timeout: 8000 });
    await expect(page.locator('#active-filters')).toContainText('Minooka');
    await page.locator('#active-filters button', { hasText: 'Clear all' }).click();
    await expect(page.locator('#active-filters')).not.toContainText('Minooka');
  });
});

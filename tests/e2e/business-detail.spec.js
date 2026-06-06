const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');
// serve's cleanUrls feature strips .html — use the extension-free path with query params
const MOCK_BIZ_ID = 'biz-001';
const BIZ_PAGE = '/pages/business';

test.describe('Business detail page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
    await page.addInitScript({ path: SUPABASE_MOCK });
    await page.goto(`${BIZ_PAGE}?id=${MOCK_BIZ_ID}`);
  });

  test('nav renders', async ({ page }) => {
    await expect(page.locator('#main-nav')).toBeVisible();
  });

  test('loading state resolves and content appears', async ({ page }) => {
    await expect(page.locator('#biz-header-loading')).not.toBeVisible({ timeout: 8000 });
    await expect(page.locator('#biz-header-content')).toBeVisible();
  });

  test('business name is populated from data', async ({ page }) => {
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });
    const name = await page.locator('#h-name').textContent();
    expect(name.trim()).toBe("Rosario's Tavern");
  });

  test('breadcrumb updates with real business name', async ({ page }) => {
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });
    const crumb = await page.locator('#breadcrumb-name').textContent();
    expect(crumb.trim()).toBe("Rosario's Tavern");
  });

  test('category pill is populated', async ({ page }) => {
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });
    const cat = await page.locator('#h-cat').textContent();
    expect(cat.trim()).not.toBe('Category');
    expect(cat.trim().length).toBeGreaterThan(0);
  });

  test('LocalBusiness JSON-LD is injected with real data', async ({ page }) => {
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });
    const raw = await page.locator('script#ld-business').textContent();
    const data = JSON.parse(raw);
    expect(data['@type']).toBe('LocalBusiness');
    expect(data.name).toBe("Rosario's Tavern");
    expect(data.telephone).toBe('8155551234');
    // biz-001 has reviews, so aggregateRating must be present and accurate
    expect(data.aggregateRating).toBeTruthy();
    expect(data.aggregateRating.reviewCount).toBe(12);
    expect(data.aggregateRating.ratingValue).toBe('4.9');
  });
});

const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

test.describe('Directory page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
    await page.addInitScript({ path: SUPABASE_MOCK });
    await page.goto('/815local-directory.html');
  });

  test('nav and page structure render', async ({ page }) => {
    await expect(page.locator('#main-nav')).toBeVisible();
    await expect(page.locator('#search-input')).toBeVisible();
    await expect(page.locator('#biz-list')).toBeVisible();
  });

  test('businesses load and results count updates', async ({ page }) => {
    await expect(page.locator('#results-count')).not.toHaveText('Loading businesses...', { timeout: 8000 });
    const text = await page.locator('#results-count').textContent();
    expect(text).toMatch(/\d+/);
  });

  test('business cards appear in the list', async ({ page }) => {
    const list = page.locator('#biz-list');
    await expect(list.locator('.biz-list-card').first()).toBeVisible({ timeout: 8000 });
    const count = await list.locator('.biz-list-card').count();
    expect(count).toBeGreaterThan(0);
  });

  test('search input filters results', async ({ page }) => {
    await expect(page.locator('#biz-list .biz-list-card').first()).toBeVisible({ timeout: 8000 });
    await page.fill('#search-input', 'zzzzzzznotarealobiz99999');
    // Trigger the filter (may fire on input or keyup)
    await page.keyboard.press('Enter');
    await page.waitForTimeout(400);
    const text = await page.locator('#results-count').textContent();
    expect(text).toMatch(/0|no result/i);
  });

  test('business card links to business detail page', async ({ page }) => {
    const firstCard = page.locator('#biz-list .biz-list-card').first();
    await expect(firstCard).toBeVisible({ timeout: 8000 });
    const href = await firstCard.getAttribute('href');
    expect(href).toMatch(/815local-business\.html\?id=.+/);
  });
});

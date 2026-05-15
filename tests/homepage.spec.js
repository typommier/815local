// @ts-check
const { test, expect } = require('./base');

test.describe('Homepage', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/index.html');
    expect(response.status()).toBe(200);
  });

  test('no uncaught JS errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));
    await page.goto('/index.html');
    await page.waitForTimeout(3000);
    expect(errors).toHaveLength(0);
  });

  test('Community Picks section loads and is not stuck', async ({ page }) => {
    await page.goto('/index.html');
    const grid = page.locator('#community-picks-grid');
    await expect(grid).toBeVisible();
    // Loading text must disappear within 15s
    await expect(grid.locator('text=Loading local businesses...')).toBeHidden({ timeout: 15_000 });
  });

  test('at least one business card appears in Community Picks', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('#community-picks-grid .biz-card').first()).toBeVisible({ timeout: 15_000 });
  });

  test('stat-businesses shows a real number', async ({ page }) => {
    await page.goto('/index.html');
    await expect(async () => {
      const text = await page.locator('#stat-businesses').textContent();
      expect(text?.trim()).toMatch(/\d+/);
      expect(text?.trim()).not.toBe('—');
    }).toPass({ timeout: 15_000 });
  });

  test('navigation links are present', async ({ page }) => {
    await page.goto('/index.html');
    await expect(page.locator('a[href*="815local-directory"]').first()).toBeAttached();
    await expect(page.locator('a[href*="815local-events"]').first()).toBeAttached();
    await expect(page.locator('a[href*="815local-profile"]').first()).toBeAttached();
  });
});

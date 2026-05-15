// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Directory page', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/815local-directory.html');
    expect(response.status()).toBe(200);
  });

  test('business cards appear within 15s', async ({ page }) => {
    await page.goto('/815local-directory.html');

    const cards = page.locator('.biz-list-card');

    // Wait up to 15s for at least one card to appear
    await expect(cards.first()).toBeVisible({ timeout: 15_000 });

    // Confirm at least 1 card is visible
    const count = await cards.count();
    expect(count).toBeGreaterThanOrEqual(1);
  });

  test('category filter pills are present and clickable', async ({ page }) => {
    await page.goto('/815local-directory.html');

    // "Home Services" pill exists
    const homeServicesPill = page.locator('.cat-pill[data-cat="Home Services"]');
    await expect(homeServicesPill).toBeVisible();

    // Click it and verify it becomes active
    await homeServicesPill.click();
    await expect(homeServicesPill).toHaveClass(/active/);
  });

  test('"Professional Services" category pill exists', async ({ page }) => {
    await page.goto('/815local-directory.html');

    const professionalPill = page.locator('.cat-pill[data-cat="Professional Services"]');
    await expect(professionalPill).toBeVisible();
  });

  test('search input exists and is interactive', async ({ page }) => {
    await page.goto('/815local-directory.html');

    const searchInput = page.locator('#search-input');
    await expect(searchInput).toBeVisible();

    // Type into the search input
    await searchInput.fill('plumber');
    await expect(searchInput).toHaveValue('plumber');
  });
});

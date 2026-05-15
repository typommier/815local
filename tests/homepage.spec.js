// @ts-check
const { test, expect } = require('@playwright/test');

test.describe('Homepage', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto('/index.html');
    expect(response.status()).toBe(200);
  });

  test('Community Picks section does not stay stuck on loading', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/index.html');

    // Wait up to 15s for loading text to disappear OR at least one .biz-card to appear
    const grid = page.locator('#community-picks-grid');
    await expect(grid).toBeVisible();

    await Promise.race([
      // Loading text disappears
      expect(grid.locator('text=Loading local businesses...')).toBeHidden({ timeout: 15_000 }),
      // Or at least one card appears
      expect(grid.locator('.biz-card').first()).toBeVisible({ timeout: 15_000 }),
    ]).catch(async () => {
      // Final assertion: at least one of the two conditions must be true
      const loadingText = await grid.locator('text=Loading local businesses...').isVisible();
      const cardCount = await grid.locator('.biz-card').count();
      if (loadingText && cardCount === 0) {
        throw new Error('Community Picks is stuck on "Loading local businesses..." — no cards appeared within 15s');
      }
    });

    // No uncaught JS errors that would crash the loading function
    expect(errors).toHaveLength(0);
  });

  test('stat-businesses element exists and eventually contains a number', async ({ page }) => {
    await page.goto('/index.html');

    const stat = page.locator('#stat-businesses');
    await expect(stat).toBeVisible();

    // Wait up to 15s for the stat to show a real number (not just "—")
    await expect(async () => {
      const text = await stat.textContent();
      expect(text).not.toBe('—');
      expect(text?.trim()).toMatch(/\d/);
    }).toPass({ timeout: 15_000 });
  });

  test('no uncaught JS errors on load', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (err) => errors.push(err.message));

    await page.goto('/index.html');
    // Wait a moment for async scripts to run
    await page.waitForTimeout(2000);

    expect(errors).toHaveLength(0);
  });

  test('navigation links are present with correct hrefs', async ({ page }) => {
    await page.goto('/index.html');

    // Desktop nav links
    const directoryLink = page.locator('.nav-links a[href*="815local-directory"]').first();
    const eventsLink = page.locator('.nav-links a[href*="815local-events"]').first();

    await expect(directoryLink).toBeAttached();
    await expect(eventsLink).toBeAttached();

    // Mobile bottom nav links
    const mobileDirectory = page.locator('.mobile-bottom-nav a[href*="815local-directory"]');
    const mobileEvents = page.locator('.mobile-bottom-nav a[href*="815local-events"]');
    const mobileProfile = page.locator('.mobile-bottom-nav a[href*="815local-profile"]');

    await expect(mobileDirectory).toBeAttached();
    await expect(mobileEvents).toBeAttached();
    await expect(mobileProfile).toBeAttached();
  });
});

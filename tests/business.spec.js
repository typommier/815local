// @ts-check
const { test, expect } = require('@playwright/test');

const AMFM_PLUMBING_URL = '/815local-business.html?id=31969cba-d40f-4cdc-b8f7-240128639af9';

test.describe('Business detail page (AM/FM Plumbing)', () => {
  test('page loads successfully', async ({ page }) => {
    const response = await page.goto(AMFM_PLUMBING_URL);
    expect(response.status()).toBe(200);
  });

  test('#h-name eventually contains "AM/FM Plumbing"', async ({ page }) => {
    await page.goto(AMFM_PLUMBING_URL);

    const nameEl = page.locator('#h-name');

    // Wait up to 15s for the real name to load (replaces placeholder "Business Name")
    await expect(async () => {
      const text = await nameEl.textContent();
      expect(text).toContain('AM/FM Plumbing');
    }).toPass({ timeout: 15_000 });
  });

  test('#biz-header-content is visible after load', async ({ page }) => {
    await page.goto(AMFM_PLUMBING_URL);

    const headerContent = page.locator('#biz-header-content');
    await expect(headerContent).toBeVisible({ timeout: 15_000 });
  });

  test('review auth gate is visible for unauthenticated user', async ({ page }) => {
    await page.goto(AMFM_PLUMBING_URL);

    // Wait for the page to finish loading
    await page.locator('#biz-header-content').waitFor({ state: 'visible', timeout: 15_000 });

    const authGate = page.locator('#review-auth-gate');
    await expect(authGate).toBeVisible({ timeout: 10_000 });
  });

  test('#review-form-fields is NOT visible for unauthenticated user', async ({ page }) => {
    await page.goto(AMFM_PLUMBING_URL);

    // Wait for the page to finish loading
    await page.locator('#biz-header-content').waitFor({ state: 'visible', timeout: 15_000 });

    const formFields = page.locator('#review-form-fields');
    await expect(formFields).toBeHidden();
  });

  test('hours section renders', async ({ page }) => {
    await page.goto(AMFM_PLUMBING_URL);

    // Wait for business data to load
    await page.locator('#biz-header-content').waitFor({ state: 'visible', timeout: 15_000 });

    // Check that hours grid has content
    const hoursGrid = page.locator('#hours-grid');
    await expect(hoursGrid).toBeAttached();

    await expect(async () => {
      const html = await hoursGrid.innerHTML();
      expect(html.trim().length).toBeGreaterThan(0);
    }).toPass({ timeout: 10_000 });
  });
});

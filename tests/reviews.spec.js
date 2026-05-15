// @ts-check
const { test, expect } = require('@playwright/test');

const AMFM_PLUMBING_URL = '/815local-business.html?id=31969cba-d40f-4cdc-b8f7-240128639af9';

test.describe('Reviews — auth gate', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(AMFM_PLUMBING_URL);
    // Wait for the page to finish loading business data
    await page.locator('#biz-header-content').waitFor({ state: 'visible', timeout: 15_000 });
  });

  test('#review-auth-gate is displayed for unauthenticated users', async ({ page }) => {
    const authGate = page.locator('#review-auth-gate');
    await expect(authGate).toBeVisible({ timeout: 10_000 });
  });

  test('#review-form-fields is hidden for unauthenticated users', async ({ page }) => {
    const formFields = page.locator('#review-form-fields');
    await expect(formFields).toBeHidden();
  });

  test('"Create a Profile" link inside auth gate points to 815local-profile.html', async ({ page }) => {
    const authGate = page.locator('#review-auth-gate');
    await expect(authGate).toBeVisible({ timeout: 10_000 });

    const createProfileLink = authGate.locator('a[href*="815local-profile.html"]');
    await expect(createProfileLink).toBeVisible();

    const href = await createProfileLink.getAttribute('href');
    expect(href).toContain('815local-profile.html');
  });
});

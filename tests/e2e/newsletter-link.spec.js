const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

test.describe('Newsletter deep link', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
    await page.addInitScript({ path: SUPABASE_MOCK });
  });

  test('/newsletter.html lands on the signup form', async ({ page }) => {
    await page.goto('/newsletter.html');
    await page.waitForURL(/#newsletter$/);
    await expect(page.locator('#newsletter-email')).toBeFocused();
  });

  test('/#newsletter reveals the section and focuses the email field', async ({ page }) => {
    await page.goto('/#newsletter');
    const section = page.locator('#newsletter');
    await expect(section).toBeVisible();
    // .fade-in starts at opacity:0, so the deep link must force the reveal
    await expect(section).toHaveClass(/visible/);
    await expect(page.locator('#newsletter-email')).toBeFocused();
  });

  test('the section is not hidden behind the sticky nav', async ({ page }) => {
    await page.goto('/#newsletter');
    await expect(page.locator('#newsletter')).toBeVisible();
    const navBox = await page.locator('#main-nav').boundingBox();
    const formBox = await page.locator('.news-form').boundingBox();
    expect(formBox.y).toBeGreaterThan(navBox.y + navBox.height);
  });

  test('a normal page load does not steal focus into the form', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#newsletter-email')).not.toBeFocused();
  });

  test('the footer newsletter link jumps to the form', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('link', { name: /^newsletter$/i }).click();
    await expect(page.locator('#newsletter-email')).toBeFocused();
  });
});

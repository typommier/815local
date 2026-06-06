const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

test.describe('Events page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
    await page.addInitScript({ path: SUPABASE_MOCK });
    await page.goto('/pages/events.html');
  });

  test('event cards render in the list view', async ({ page }) => {
    const cards = page.locator('#list-view-inner .list-event-card');
    await expect(cards.first()).toBeVisible({ timeout: 8000 });
    expect(await cards.count()).toBeGreaterThan(0);
  });

  test('multi-day festival shows a Day badge', async ({ page }) => {
    const friCard = page.locator('.list-event-card[data-event-id="evt-fri"]');
    await expect(friCard).toBeVisible({ timeout: 8000 });
    await expect(friCard).toContainText('Day 1 of 2');
  });

  test('clicking a card opens the details modal with schedule and lineup', async ({ page }) => {
    const friCard = page.locator('.list-event-card[data-event-id="evt-fri"]');
    await expect(friCard).toBeVisible({ timeout: 8000 });
    await friCard.click();

    const modal = page.locator('#ev-modal-backdrop');
    await expect(modal).toHaveClass(/open/);
    await expect(page.locator('#ev-modal-title')).toContainText('Test Summerfest: Friday Night');
    // Schedule rows from details.schedule
    await expect(page.locator('#ev-modal-schedule')).toContainText('Pork Chop Dinner');
    await expect(page.locator('#ev-modal-schedule')).toContainText('4:30 PM');
    // Section chips from details.sections
    await expect(page.locator('#ev-modal-sections')).toContainText('Food Vendors');
    await expect(page.locator('#ev-modal-sections')).toContainText("Mel's Tacos");
    // External link present
    await expect(page.locator('#ev-modal-cta')).toBeVisible();
  });

  test('modal closes via the close button and Escape', async ({ page }) => {
    const friCard = page.locator('.list-event-card[data-event-id="evt-fri"]');
    await expect(friCard).toBeVisible({ timeout: 8000 });

    await friCard.click();
    const modal = page.locator('#ev-modal-backdrop');
    await expect(modal).toHaveClass(/open/);
    await page.locator('#ev-modal-close').click();
    await expect(modal).not.toHaveClass(/open/);

    await friCard.click();
    await expect(modal).toHaveClass(/open/);
    await page.keyboard.press('Escape');
    await expect(modal).not.toHaveClass(/open/);
  });

  test('simple event opens a modal with description only (no schedule, no broken sections)', async ({ page }) => {
    const card = page.locator('.list-event-card[data-event-id="evt-simple"]');
    await expect(card).toBeVisible({ timeout: 8000 });
    await card.click();

    await expect(page.locator('#ev-modal-backdrop')).toHaveClass(/open/);
    await expect(page.locator('#ev-modal-desc')).toContainText('Just a regular show');
    await expect(page.locator('#ev-modal-schedule')).toBeEmpty();
    await expect(page.locator('#ev-modal-sections')).toBeEmpty();
    // No external URL → CTA hidden
    await expect(page.locator('#ev-modal-cta')).toBeHidden();
  });

  test('action buttons do not trigger the modal', async ({ page }) => {
    const card = page.locator('.list-event-card[data-event-id="evt-simple"]');
    await expect(card).toBeVisible({ timeout: 8000 });
    // The simple event has no url, so it renders the "I'm Going" button
    await card.locator('.lec-rsvp').click();
    await expect(page.locator('#ev-modal-backdrop')).not.toHaveClass(/open/);
  });
});

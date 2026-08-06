const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

// Future/never expiry so the page's active + non-expired filter keeps them.
function isoDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const SAMPLE_DEALS = [
  {
    id: 'deal-001', business_id: 'biz-001', business_name: "Rosario's Tavern",
    category: 'Food & Drink', title: '20% off your first visit',
    description: 'Dine in only, mention 815local.', discount: '20% OFF',
    expiry_date: isoDay(30), terms: 'One per table. Cannot combine with other offers.',
    is_active: true, created_at: '2026-08-03T12:00:00Z',
  },
  {
    id: 'deal-002', business_id: 'biz-003', business_name: 'Elm City Barbershop',
    category: 'Health & Wellness', title: '$5 off any haircut',
    description: null, discount: '$5 OFF', expiry_date: null, terms: null,
    is_active: true, created_at: '2026-08-02T12:00:00Z',
  },
  {
    id: 'deal-003', business_id: null, business_name: 'Pop-Up Market',
    category: 'Retail & Shops', title: 'Buy one get one free',
    description: 'This weekend only.', discount: 'BOGO', expiry_date: isoDay(5),
    terms: null, is_active: true, created_at: '2026-08-01T12:00:00Z',
  },
];

test.describe('Deals page', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
    await page.addInitScript({ path: SUPABASE_MOCK });
  });

  test('renders a card for each active deal and hides the empty state', async ({ page }) => {
    await page.addInitScript(deals => { window.__TEST_DEALS = deals; }, SAMPLE_DEALS);
    await page.goto('/pages/deals');

    const cards = page.locator('.deal-card');
    await expect(cards).toHaveCount(3);
    await expect(page.locator('#deals-empty')).toBeHidden();
    await expect(page.locator('.deal-card').filter({ hasText: '20% off your first visit' })).toContainText('20% OFF');
    await expect(page.locator('#deals-count')).toContainText('3 active deals');
  });

  test('a deal tied to a business links to that business page', async ({ page }) => {
    await page.addInitScript(deals => { window.__TEST_DEALS = deals; }, SAMPLE_DEALS);
    await page.goto('/pages/deals');

    const linked = page.locator('a.deal-card').filter({ hasText: "Rosario's Tavern" });
    await expect(linked).toHaveAttribute('href', /business(\.html)?\?id=biz-001/);
    // Two of three deals have a business_id, so exactly two "View business" links.
    await expect(page.locator('.deal-link')).toHaveCount(2);
  });

  test('a deal with no business renders as a non-linked card', async ({ page }) => {
    await page.addInitScript(deals => { window.__TEST_DEALS = deals; }, SAMPLE_DEALS);
    await page.goto('/pages/deals');

    const card = page.locator('.deal-card').filter({ hasText: 'Buy one get one free' });
    await expect(card).toBeVisible();
    await expect(card).toHaveJSProperty('tagName', 'DIV');
  });

  test('category filter narrows the visible deals', async ({ page }) => {
    await page.addInitScript(deals => { window.__TEST_DEALS = deals; }, SAMPLE_DEALS);
    await page.goto('/pages/deals');
    await expect(page.locator('.deal-card')).toHaveCount(3);

    await page.locator('.filter-pill[data-cat="Food & Drink"]').click();
    await expect(page.locator('.deal-card')).toHaveCount(1);
    await expect(page.locator('.deal-card')).toContainText('20% off your first visit');

    await page.locator('.filter-pill[data-cat=""]').click();
    await expect(page.locator('.deal-card')).toHaveCount(3);
  });

  test('shows the recruit-focused empty state when there are no active deals', async ({ page }) => {
    await page.addInitScript(() => { window.__TEST_DEALS = []; });
    await page.goto('/pages/deals');

    await expect(page.locator('#deals-empty')).toBeVisible();
    await expect(page.locator('#deals-empty')).toContainText('Deals are on the way');
    await expect(page.locator('.deal-card')).toHaveCount(0);
    // Filter bar is pointless with no deals, so it's hidden.
    await expect(page.locator('.filter-bar')).toBeHidden();
  });

  test('Deals is in the primary nav', async ({ page }) => {
    await page.addInitScript(deals => { window.__TEST_DEALS = deals; }, SAMPLE_DEALS);
    await page.goto('/pages/deals');
    await expect(page.locator('.nav-links a.nav-link[href="/pages/deals.html"]')).toHaveClass(/active/);
  });
});

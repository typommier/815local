const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

async function stub(page) {
  await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' }));
  await page.addInitScript({ path: SUPABASE_MOCK });
}

// The suggestion engine filters the rows initHomepage() fetched, so wait for
// that fetch to have landed before typing.
async function waitForData(page) {
  await page.waitForFunction(() => Array.isArray(window.__allBiz), null, { timeout: 8000 });
}

// The dev server rewrites /pages/x.html to /pages/x with a 301 that drops the
// query string, so page.url() never shows the params. Capture the outgoing
// request instead (same trick as hero-search.spec.js).
async function navRequest(page, fragment, act) {
  const [req] = await Promise.all([
    page.waitForRequest(r => r.isNavigationRequest() && r.url().includes(fragment)),
    act(),
  ]);
  return new URL(req.url());
}

const rows = '#nav-sg .sg-row';

test.describe('Nav search suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await stub(page);
    await page.goto('/');
    await waitForData(page);
  });

  test('the nav search is a real input, not a link', async ({ page }) => {
    await expect(page.locator('#main-nav .nav-search-wrap input#nav-q')).toBeVisible();
    expect(await page.locator('#main-nav a.nav-search').count()).toBe(0);
  });

  test('one character suggests nothing, two opens the panel', async ({ page }) => {
    await page.fill('#nav-q', 'r');
    await expect(page.locator('#nav-sg')).not.toHaveClass(/open/);
    await page.fill('#nav-q', 'ro');
    await expect(page.locator('#nav-sg')).toHaveClass(/open/);
  });

  test('a matching business renders with the matched substring marked', async ({ page }) => {
    await page.fill('#nav-q', 'ro');
    const row = page.locator(`${rows}[data-href*="business.html"]`).first();
    await expect(row).toContainText("Rosario's Tavern");
    await expect(row.locator('.sg-name mark')).toHaveText('Ro');
    await expect(row).toContainText('Minooka');
  });

  test('a business row links to its detail page by id', async ({ page }) => {
    await page.fill('#nav-q', 'rosario');
    const href = await page.locator(`${rows}[data-href*="business.html"]`).first().getAttribute('data-href');
    expect(href).toBe('/pages/business.html?id=biz-001');
  });

  test('a matching category gets its own row above the businesses', async ({ page }) => {
    await page.fill('#nav-q', 'rest');
    const first = page.locator(rows).first();
    expect(await first.getAttribute('data-href')).toBe('/pages/directory.html?category=Restaurants');
    await expect(first).toContainText('places');
  });

  test('the footer row always links to the directory with ?q=', async ({ page }) => {
    await page.fill('#nav-q', 'fish & chips');
    const foot = page.locator('#nav-sg .sg-foot');
    await expect(foot).toContainText('See all results');
    expect(await foot.getAttribute('data-href')).toBe('/pages/directory.html?q=fish%20%26%20chips');
  });

  test('a query with no matches still offers the directory', async ({ page }) => {
    await page.fill('#nav-q', 'zzzzz');
    await expect(page.locator('#nav-sg .sg-note')).toContainText('No matches');
    await expect(page.locator('#nav-sg .sg-foot')).toBeVisible();
  });

  test('arrow keys move the highlight and Enter opens it', async ({ page }) => {
    await page.fill('#nav-q', 'rosario');
    await page.press('#nav-q', 'ArrowDown');
    await expect(page.locator(`${rows}.hl`)).toHaveCount(1);
    await expect(page.locator(rows).first()).toHaveClass(/hl/);

    const url = await navRequest(page, '/pages/business', () => page.press('#nav-q', 'Enter'));
    expect(url.searchParams.get('id')).toBe('biz-001');
  });

  test('Enter with nothing highlighted goes to the directory', async ({ page }) => {
    await page.fill('#nav-q', 'rosario');
    const url = await navRequest(page, '/pages/directory', () => page.press('#nav-q', 'Enter'));
    expect(url.search).toBe('?q=rosario');
  });

  test('Escape closes the panel and click-outside closes it', async ({ page }) => {
    await page.fill('#nav-q', 'ro');
    await page.press('#nav-q', 'Escape');
    await expect(page.locator('#nav-sg')).not.toHaveClass(/open/);

    await page.click('#nav-q');
    await expect(page.locator('#nav-sg')).toHaveClass(/open/);
    await page.click('.hero-title');
    await expect(page.locator('#nav-sg')).not.toHaveClass(/open/);
  });

  test('the clear button only appears with text, and clears', async ({ page }) => {
    await expect(page.locator('.nav-clear')).toBeHidden();
    await page.fill('#nav-q', 'ro');
    await expect(page.locator('.nav-clear')).toBeVisible();
    await page.click('.nav-clear');
    await expect(page.locator('#nav-q')).toHaveValue('');
    await expect(page.locator('#nav-sg')).not.toHaveClass(/open/);
  });

  test('"/" focuses the search, but not while typing in a field', async ({ page }) => {
    await page.click('.hero-title');
    await page.keyboard.press('/');
    await expect(page.locator('#nav-q')).toBeFocused();

    await page.fill('#nav-q', 'ta');
    await page.press('#nav-q', '/');
    await expect(page.locator('#nav-q')).toHaveValue('ta/');
  });
});

test.describe('Hero search suggestions', () => {
  test.beforeEach(async ({ page }) => {
    await stub(page);
    await page.goto('/');
    await waitForData(page);
  });

  test('the hero field drives its own panel', async ({ page }) => {
    await page.fill('#hero-q', 'ro');
    await expect(page.locator('#hero-sg')).toHaveClass(/open/);
    await expect(page.locator('#hero-sg .sg-row').first()).toContainText("Rosario's Tavern");
    // The nav panel stays out of it.
    await expect(page.locator('#nav-sg')).not.toHaveClass(/open/);
  });

  test('the existing hero submit still hands off to the directory', async ({ page }) => {
    await page.fill('#hero-q', 'pizza');
    await page.selectOption('#hero-town', 'Shorewood');
    const url = await navRequest(page, '/pages/directory', () => page.click('.search-go'));
    expect(url.search).toBe('?q=pizza&town=Shorewood');
  });
});

test.describe('Nav search on small screens', () => {
  test('the field and its dropdown are both gone below 1024px', async ({ page }) => {
    await stub(page);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');
    await waitForData(page);
    await expect(page.locator('.nav-search-wrap')).toBeHidden();
    await expect(page.locator('#nav-sg')).toBeHidden();
  });

  test('"/" falls through to the hero field there', async ({ page }) => {
    await stub(page);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.goto('/');
    await waitForData(page);
    await page.click('.hero-title');
    await page.keyboard.press('/');
    await expect(page.locator('#hero-q')).toBeFocused();
  });
});

test.describe('Category grid', () => {
  const CATS = ['Food & Drink', 'Professional Services', 'Home Services', 'Health & Wellness',
                'Retail & Shops', 'Beauty & Salons', 'Kids & Family', 'Parks & Outdoor'];

  test.beforeEach(async ({ page }) => {
    await stub(page);
    await page.goto('/');
    await waitForData(page);
  });

  test('has eight cards, two clean rows of four', async ({ page }) => {
    await expect(page.locator('.cat-grid .cat')).toHaveCount(8);
    for (const cat of CATS) {
      await expect(page.locator(`.cat-grid .cat[data-cat="${cat}"]`)).toHaveCount(1);
      await expect(page.locator(`.cat-count[data-category="${cat}"]`)).toHaveCount(1);
    }
  });

  test('a category with no businesses is hidden, never advertised', async ({ page }) => {
    // The mock fixture only has "Restaurants" and "Services", so every real
    // category counts zero and the guard should hide all eight cards.
    for (const cat of CATS) {
      await expect(page.locator(`.cat-grid .cat[data-cat="${cat}"]`)).toBeHidden();
    }
  });
});

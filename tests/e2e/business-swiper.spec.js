const { test, expect, devices } = require('@playwright/test');

// One-off verification spec for the mobile photo swiper.
// Uses a self-contained Supabase mock that returns a business with multiple photos.

const PHOTOS = [
  'https://placehold.co/600x400/orange/white?text=Photo+1',
  'https://placehold.co/600x400/red/white?text=Photo+2',
  'https://placehold.co/600x400/green/white?text=Photo+3',
  'https://placehold.co/600x400/blue/white?text=Photo+4',
];

test.use({ ...devices['Pixel 5'] });

test.describe('Mobile photo swiper', () => {
  test.beforeEach(async ({ page }) => {
    await page.route('**/supabase-js**', route => route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
    await page.addInitScript((photos) => {
      const biz = {
        id: 'biz-swipe', name: 'Swiper Test Cafe', category: 'Restaurants', subcategory: 'Cafe',
        description: 'Test.', phone: '8150000000', website: null, address: '1 Test St',
        is_active: true, is_claimed: true, photos, image_url: null,
        avg_rating: 4.5, review_count: 0, features: [],
      };
      const result = { data: biz, error: null };
      const list = { data: [biz], error: null };
      function makeQ() {
        const q = {
          select() { return q; }, eq() { return q; }, neq() { return q; },
          order() { return q; }, limit() { return q; },
          single() { return Promise.resolve(result); },
          then(r) { return Promise.resolve(list).then(r); },
          insert(x) { return Promise.resolve({ data: x, error: null }); },
          upsert(x) { return Promise.resolve({ data: x, error: null }); },
          update(x) { return { eq() { return Promise.resolve({ data: x, error: null }); } }; },
        };
        return q;
      }
      window.supabase = {
        createClient() {
          return {
            from() { return makeQ(); },
            auth: {
              getSession: () => Promise.resolve({ data: { session: null }, error: null }),
              onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
              signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
              signUp: () => Promise.resolve({ data: {}, error: null }),
              signOut: () => Promise.resolve({ error: null }),
            },
            storage: { from: () => ({ upload: () => Promise.resolve({ data: {}, error: null }), getPublicUrl: () => ({ data: { publicUrl: '' } }) }) },
          };
        },
      };
    }, PHOTOS);
    await page.goto('/pages/business?id=biz-swipe');
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });
  });

  test('desktop grid is hidden on mobile, swiper is visible', async ({ page }) => {
    await expect(page.locator('#gallery-grid')).toBeHidden();
    await expect(page.locator('#gallery-swiper')).toBeVisible();
  });

  test('all photos render as slides', async ({ page }) => {
    await expect(page.locator('.swipe-slide')).toHaveCount(PHOTOS.length);
  });

  test('counter starts at 1 / N and first dot is active', async ({ page }) => {
    await expect(page.locator('#swipe-counter')).toHaveText(`1 / ${PHOTOS.length}`);
    await expect(page.locator('.swipe-dot.active')).toHaveCount(1);
    await expect(page.locator('.swipe-dot').first()).toHaveClass(/active/);
  });

  test('scrolling the track updates counter and active dot', async ({ page }) => {
    const track = page.locator('#swipe-track');
    const width = await track.evaluate(el => el.clientWidth);
    await track.evaluate((el, w) => el.scrollTo({ left: w * 2, behavior: 'instant' }), width);
    await expect(page.locator('#swipe-counter')).toHaveText(`3 / ${PHOTOS.length}`);
    await expect(page.locator('.swipe-dot').nth(2)).toHaveClass(/active/);
  });
});

const { test, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_MOCK = path.join(__dirname, 'fixtures/supabase-mock.js');

// The crop rule used to be copy-pasted into four pages that had drifted apart:
// the listing page discarded a stored 'center' and cropped from the top, the
// directory and homepage cards defaulted to 'center', and the homepage hero
// defaulted to 'top'. One stored value framed a photo three different ways, and
// the admin tool's preview matched none of them. assets/js/photo-crop.js is now
// the single source of that rule; these tests pin it.
//
// Fixture (biz-001): photo_positions ['', 'bottom right', 'center']
//   index 0 -> '' is auto        -> 'top'
//   index 1 -> deliberate        -> 'bottom right'
//   index 2 -> deliberate center -> 'center' (used to be unreachable)

function mock(page) {
  return Promise.all([
    page.route('**/supabase-js**', route =>
      route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* supabase cdn stub */' })),
    page.addInitScript({ path: SUPABASE_MOCK }),
  ]);
}

test.describe('PhotoCrop module', () => {
  test.beforeEach(async ({ page }) => {
    await mock(page);
    await page.goto('/pages/directory.html');
  });

  test('auto resolves to top, saved values are honored literally', async ({ page }) => {
    const resolved = await page.evaluate(() => {
      const p = ['', 'bottom right', 'center'];
      return {
        auto: PhotoCrop.positionFor(p, 0),
        explicit: PhotoCrop.positionFor(p, 1),
        center: PhotoCrop.positionFor(p, 2),
        missingIndex: PhotoCrop.positionFor(p, 9),
        noArray: PhotoCrop.positionFor(undefined, 0),
        junk: PhotoCrop.positionFor(['url(javascript:alert(1))'], 0),
        fallback: PhotoCrop.AUTO_FALLBACK,
      };
    });
    expect(resolved.auto).toBe('top');
    expect(resolved.explicit).toBe('bottom right');
    expect(resolved.center).toBe('center');
    expect(resolved.missingIndex).toBe('top');
    expect(resolved.noArray).toBe('top');
    // Anything off the safelist falls back rather than reaching the stylesheet.
    expect(resolved.junk).toBe('top');
    expect(resolved.fallback).toBe('top');
  });

  test('isAuto distinguishes untouched from a deliberate center', async ({ page }) => {
    const flags = await page.evaluate(() => {
      const p = ['', 'bottom right', 'center'];
      return [PhotoCrop.isAuto(p, 0), PhotoCrop.isAuto(p, 1), PhotoCrop.isAuto(p, 2), PhotoCrop.isAuto([], 0)];
    });
    expect(flags).toEqual([true, false, false, true]);
  });

  test('cellStyle escapes quotes in the url', async ({ page }) => {
    const style = await page.evaluate(() =>
      PhotoCrop.cellStyle("https://example.com/a'b.jpg", 'top'));
    expect(style).toContain("a\\'b.jpg");
    expect(style).toContain('background-position:top;');
    expect(style).toContain('background-size:cover;');
  });
});

test.describe('Crop rule is the same on every surface', () => {
  test('listing hero uses the auto fallback, thumbs use their own saved values', async ({ page }) => {
    await mock(page);
    // serve's cleanUrls strips .html, use the extension-free path with query params
    await page.goto('/pages/business?id=biz-001');
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });

    const hero = page.locator('#gallery-main .photo-cell-fg');
    await expect(hero).toHaveCSS('background-position', '50% 0%'); // top

    const thumbs = page.locator('#gallery-thumbs .gallery-thumb .photo-cell-fg');
    await expect(thumbs).toHaveCount(2);
    await expect(thumbs.nth(0)).toHaveCSS('background-position', '100% 100%'); // bottom right
    await expect(thumbs.nth(1)).toHaveCSS('background-position', '50% 50%');   // center
  });

  test('phone swiper applies the same per-photo positions', async ({ page }) => {
    await mock(page);
    await page.setViewportSize({ width: 390, height: 844 });
    // serve's cleanUrls strips .html, use the extension-free path with query params
    await page.goto('/pages/business?id=biz-001');
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });

    const slides = page.locator('#swipe-track .swipe-slide .photo-cell-fg');
    await expect(slides).toHaveCount(3);
    await expect(slides.nth(0)).toHaveCSS('background-position', '50% 0%');
    await expect(slides.nth(1)).toHaveCSS('background-position', '100% 100%');
    await expect(slides.nth(2)).toHaveCSS('background-position', '50% 50%');
  });

  test('directory cards frame photo 1 the same way the listing hero does', async ({ page }) => {
    await mock(page);
    await page.goto('/pages/directory.html');
    await expect(page.locator('#biz-list .biz-list-card').first()).toBeVisible({ timeout: 8000 });

    // Cards used to default to 'center' while the listing page defaulted to
    // 'top', so the same photo was framed two ways. Both are 'top' now.
    const auto = page.locator('#biz-list .biz-list-card', { hasText: "Rosario's Tavern" });
    await expect(auto.locator('.blc-photo > div')).toHaveCSS('background-position', '50% 0%');

    // And a card with a real saved focal point still honors it.
    const explicit = page.locator('#biz-list .biz-list-card', { hasText: 'Elm City Barbershop' });
    await expect(explicit.locator('.blc-photo > div')).toHaveCSS('background-position', '0% 0%');
  });
});

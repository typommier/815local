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
// A stored value is honored literally on every surface. Only the auto fallback
// differs by surface, deliberately: 'hero' (listing gallery, homepage banner)
// anchors to the top, 'card' (directory/homepage cards, spotlight, nearby)
// centers.
//
// Fixture (biz-001): photo_positions ['', 'bottom right', 'center']
//   index 0 -> '' is auto        -> 'top' on the gallery, 'center' on cards
//   index 1 -> deliberate        -> 'bottom right' everywhere
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

  test('auto falls back per surface, saved values are honored literally', async ({ page }) => {
    const resolved = await page.evaluate(() => {
      const p = ['', 'bottom right', 'center'];
      return {
        autoHero: PhotoCrop.positionFor(p, 0, 'hero'),
        autoCard: PhotoCrop.positionFor(p, 0, 'card'),
        explicitHero: PhotoCrop.positionFor(p, 1, 'hero'),
        explicitCard: PhotoCrop.positionFor(p, 1, 'card'),
        centerHero: PhotoCrop.positionFor(p, 2, 'hero'),
        centerCard: PhotoCrop.positionFor(p, 2, 'card'),
        missingIndex: PhotoCrop.positionFor(p, 9, 'card'),
        noArray: PhotoCrop.positionFor(undefined, 0, 'card'),
        junk: PhotoCrop.positionFor(['url(javascript:alert(1))'], 0, 'hero'),
        unknownSurface: PhotoCrop.positionFor(p, 0, 'nonsense'),
        fallback: PhotoCrop.FALLBACK,
      };
    });
    // Auto differs by surface, on purpose.
    expect(resolved.autoHero).toBe('top');
    expect(resolved.autoCard).toBe('center');
    expect(resolved.missingIndex).toBe('center');
    expect(resolved.noArray).toBe('center');
    // A stored value wins everywhere, so picking a focal point makes the
    // surfaces agree.
    expect(resolved.explicitHero).toBe('bottom right');
    expect(resolved.explicitCard).toBe('bottom right');
    expect(resolved.centerHero).toBe('center');
    expect(resolved.centerCard).toBe('center');
    // Anything off the safelist falls back rather than reaching the stylesheet.
    expect(resolved.junk).toBe('top');
    expect(resolved.unknownSurface).toBe('top');
    expect(resolved.fallback).toEqual({ hero: 'top', card: 'center' });
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

  test('src leaves URLs untouched off the production zone', async ({ page }) => {
    const r = await page.evaluate(() => ({
      http: PhotoCrop.src('https://kyneaettrynagavewefi.supabase.co/storage/v1/x.jpg', 640),
      data: PhotoCrop.src('data:image/png;base64,AAAA', 640),
      relative: PhotoCrop.src('/uploads/logo.png', 640),
      empty: PhotoCrop.src(null, 640),
      host: location.hostname,
    }));
    // Tests run on localhost, where Cloudflare image resizing does not exist.
    // Every URL must come back untouched, never wrapped in /cdn-cgi/image/,
    // which would 404 in dev, CI, and *.pages.dev previews.
    expect(r.host).not.toBe('815local.com');
    expect(r.http).toBe('https://kyneaettrynagavewefi.supabase.co/storage/v1/x.jpg');
    expect(r.data).toBe('data:image/png;base64,AAAA');
    expect(r.relative).toBe('/uploads/logo.png');
    expect(r.empty).toBe('');
    expect(r.http).not.toContain('/cdn-cgi/image/');
  });
});

test.describe('Crop rule is the same on every surface', () => {
  test('listing hero shows the whole photo; thumbs keep their saved crops', async ({ page }) => {
    await mock(page);
    // serve's cleanUrls strips .html, use the extension-free path with query params
    await page.goto('/pages/business?id=biz-001');
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });

    // The hero is never cropped: the full photo is contained on a cream mat.
    const heroFg = page.locator('#gallery-main .photo-fill .photo-fill-fg');
    await expect(heroFg).toHaveCount(1);
    await expect(heroFg).toHaveCSS('background-size', 'contain');
    // The hero no longer uses the cover-crop cell.
    await expect(page.locator('#gallery-main .photo-cell-fg')).toHaveCount(0);

    // Thumbnails still cover-crop and honor their own saved focal points.
    const thumbs = page.locator('#gallery-thumbs .gallery-thumb .photo-cell-fg');
    await expect(thumbs).toHaveCount(2);
    await expect(thumbs.nth(0)).toHaveCSS('background-position', '100% 100%'); // bottom right
    await expect(thumbs.nth(1)).toHaveCSS('background-position', '50% 50%');   // center
  });

  test('phone swiper shows every photo in full, never cropped', async ({ page }) => {
    await mock(page);
    await page.setViewportSize({ width: 390, height: 844 });
    // serve's cleanUrls strips .html, use the extension-free path with query params
    await page.goto('/pages/business?id=biz-001');
    await expect(page.locator('#biz-header-content')).toBeVisible({ timeout: 8000 });

    const slides = page.locator('#swipe-track .swipe-slide .photo-fill .photo-fill-fg');
    await expect(slides).toHaveCount(3);
    await expect(slides.nth(0)).toHaveCSS('background-size', 'contain');
    await expect(slides.nth(1)).toHaveCSS('background-size', 'contain');
    await expect(slides.nth(2)).toHaveCSS('background-size', 'contain');
  });

  test('directory cards center on auto and honor a saved focal point', async ({ page }) => {
    await mock(page);
    await page.goto('/pages/directory.html');
    await expect(page.locator('#biz-list .biz-list-card').first()).toBeVisible({ timeout: 8000 });

    // biz-001 photo 1 is on Auto: the card centers where the listing hero
    // anchors to the top. That difference is the intended per-surface default.
    const auto = page.locator('#biz-list .biz-list-card', { hasText: "Rosario's Tavern" });
    await expect(auto.locator('.blc-photo > div')).toHaveCSS('background-position', '50% 50%');

    // A real saved focal point overrides the surface default.
    const explicit = page.locator('#biz-list .biz-list-card', { hasText: 'Elm City Barbershop' });
    await expect(explicit.locator('.blc-photo > div')).toHaveCSS('background-position', '0% 0%');
  });
});

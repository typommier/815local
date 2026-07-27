const { test, expect } = require('@playwright/test');

// The admin photo tool had no coverage at all, which is how a plain CSS
// rendering bug reached the live site unnoticed: .drop-zone is a <label>, and
// a <label> is display:inline by default. An inline box containing block
// children gets split into fragments, so the dashed border painted two narrow
// slivers down the left instead of one box around the content. It reproduced
// as three client rects (30x76, 324x106, 30x76) instead of one.

const BIZ = {
  id: 'admin-biz-1',
  name: 'Admin Test Detailing',
  city: 'Minooka',
  category: 'Professional Services',
  image_url: null,
  photos: [],
  photo_positions: [],
};

async function openEditor(page, biz) {
  // Both CDN scripts are stubbed: the page only needs window.supabase, which
  // the init script supplies, and heic2any is not exercised here.
  await page.route('**/supabase-js**', r =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  await page.route('**/heic2any**', r =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  await page.addInitScript((b) => {
    window.supabase = {
      createClient: () => ({
        from: () => {
          const q = {
            select: () => q, eq: () => q, order: () => q,
            then: (f) => Promise.resolve({ data: [b], error: null }).then(f),
          };
          return q;
        },
        // A non-null session skips the login overlay. The real gate is the
        // ADMIN_EMAILS allowlist in the edge function, not this.
        auth: { getSession: () => Promise.resolve({ data: { session: { access_token: 'test' } }, error: null }) },
      }),
    };
  }, biz);
  await page.goto('/admin/edit-business-photos.html');
  await page.waitForFunction(() => document.querySelectorAll('#biz-select option').length > 1, null, { timeout: 8000 });
  await page.selectOption('#biz-select', biz.id);
  await expect(page.locator('#editor-card')).toBeVisible();
}

test.describe('Admin photo tool', () => {
  test('the drop zone renders as one box, not fragmented slivers', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, BIZ);

    const dropZone = page.locator('#drop-zone');
    await expect(dropZone).toHaveCSS('display', 'block');

    // One rect means one unbroken border box. Any inline label wrapping block
    // children would report several.
    const rectCount = await dropZone.evaluate(el => el.getClientRects().length);
    expect(rectCount).toBe(1);

    // And it spans the card rather than collapsing to a narrow fragment.
    const box = await dropZone.boundingBox();
    expect(box.width).toBeGreaterThan(250);
  });

  test('tapping the drop zone still opens the file picker', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await openEditor(page, BIZ);
    // display:block must not break the label's `for` association.
    await expect(page.locator('#drop-zone')).toHaveAttribute('for', 'file-input');
    const wired = await page.evaluate(() => document.getElementById('file-input').labels.length);
    expect(wired).toBe(1);
  });

  test('a listing with no photos shows the empty state, not a broken row', async ({ page }) => {
    await openEditor(page, BIZ);
    await expect(page.locator('#photo-list-empty')).toBeVisible();
    await expect(page.locator('.photo-row')).toHaveCount(0);
  });
});

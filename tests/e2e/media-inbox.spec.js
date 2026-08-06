const { test, expect } = require('@playwright/test');

// The Media Inbox is a tab inside the business photo tool
// (admin/edit-business-photos.html). Auth is mocked to a signed-in session
// (the real gate is the ADMIN_EMAILS allowlist in the edge functions), the
// businesses load is mocked, and both edge functions (manage-media and
// manage-business-photos) are mocked at the network layer so the tests
// exercise the page's own gallery / filter / upload / delete / attach / pull
// logic.

const BUSES = [
  { id: 'biz-1', name: 'Rosario Tavern', city: 'Minooka', category: 'Food', image_url: null, photos: [], photo_positions: [] },
  { id: 'biz-2', name: 'Oak Coffee', city: 'Channahon', category: 'Coffee', image_url: null, photos: [], photo_positions: [] },
];

const MEDIA = [
  { id: 'm1', public_url: 'https://example.com/a.jpg', source: 'email', caption: 'Rosario summer flyer', business_id: null, event_id: null, deal_id: null, status: 'new', created_at: '2026-08-05T12:00:00Z' },
  { id: 'm2', public_url: 'https://example.com/b.jpg', source: 'text', caption: null, business_id: 'biz-2', event_id: null, deal_id: null, status: 'assigned', created_at: '2026-08-04T12:00:00Z' },
  { id: 'm3', public_url: 'https://example.com/c.jpg', source: 'facebook', caption: 'Sidewalk sale', business_id: null, event_id: null, deal_id: null, status: 'new', created_at: '2026-08-03T12:00:00Z' },
];

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

const DEALS = [
  { id: 'deal-1', business_name: 'Shear Brilliance', title: 'End of summer sale' },
];

async function gotoTool(page, media) {
  await page.route('**/supabase-js**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  await page.route('**/heic2any**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript((data) => {
    window.supabase = {
      createClient: () => ({
        from: (table) => {
          const rows = table === 'deals' ? data.deals : data.buses;
          const q = { select: () => q, eq: () => q, or: () => q, order: () => q, limit: () => q, then: (f) => Promise.resolve({ data: rows, error: null }).then(f) };
          return q;
        },
        auth: {
          getSession: () => Promise.resolve({ data: { session: { access_token: 'test' } }, error: null }),
          signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
        },
      }),
    };
  }, { buses: BUSES, deals: DEALS });

  await page.route('**/functions/v1/manage-media', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'list') return route.fulfill({ json: { ok: true, media } });
    if (body.action === 'delete') return route.fulfill({ json: { ok: true, deleted: body.id } });
    if (body.action === 'update') return route.fulfill({ json: { ok: true, media: { id: body.id } } });
    if (body.action === 'attach_deal') return route.fulfill({ json: { ok: true, media: { id: body.id, deal_id: body.deal_id } } });
    if (body.action === 'upload') {
      const added = (body.files || []).map((f, i) => ({
        id: 'new' + i, public_url: 'https://example.com/new' + i + '.jpg',
        source: body.source, caption: body.caption || null,
        business_id: null, event_id: null, deal_id: null, status: 'new',
        created_at: '2026-08-06T12:00:00Z',
      }));
      return route.fulfill({ json: { ok: true, media: added, errors: [] } });
    }
    return route.fulfill({ json: { ok: false, error: 'unknown action' } });
  });

  await page.route('**/functions/v1/manage-business-photos', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    const photos = body.set_photos || [];
    return route.fulfill({ json: { ok: true, business_id: body.business_id, uploaded: [], updated: { id: body.business_id, name: 'x', image_url: photos[0] || null, photos, photo_positions: body.set_photo_positions || [] }, errors: [] } });
  });

  await page.goto('/admin/edit-business-photos.html');
  // Businesses loaded => the tool is ready.
  await page.waitForFunction(() => document.querySelectorAll('#biz-select option').length > 1, null, { timeout: 8000 });
}

async function openInbox(page) {
  await page.locator('.tab-btn[data-tab="inbox"]').click();
  await expect(page.locator('#panel-inbox')).toBeVisible();
}

test.describe('Photos & Media — inbox tab', () => {
  test('defaults to the listing photos tab', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await expect(page.locator('#panel-photos')).toBeVisible();
    await expect(page.locator('#panel-inbox')).toBeHidden();
    await expect(page.locator('.tab-btn[data-tab="photos"]')).toHaveClass(/active/);
  });

  test('inbox tab shows a card for every received image', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    await expect(page.locator('.media-card')).toHaveCount(3);
    await expect(page.locator('#mi-gallery-count')).toHaveText('3 images');
    await expect(page.locator('.media-card').filter({ hasText: 'Rosario summer flyer' })).toBeVisible();
    // The tab badge reflects the count.
    await expect(page.locator('#inbox-tab-count')).toHaveText('3');
  });

  test('an image already on a listing shows the linked badge', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    const linked = page.locator('.media-card').filter({ has: page.locator('.link-badge') });
    await expect(linked).toHaveCount(1);
    await expect(linked).toContainText('Text');
  });

  test('source chips filter the gallery', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    await page.locator('.chip[data-src="email"]').click();
    await expect(page.locator('.media-card')).toHaveCount(1);
    await expect(page.locator('.media-card')).toContainText('Rosario summer flyer');
    await page.locator('.chip[data-src=""]').click();
    await expect(page.locator('.media-card')).toHaveCount(3);
  });

  test('clicking a thumbnail opens the lightbox', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    await expect(page.locator('#lightbox')).not.toHaveClass(/open/);
    await page.locator('.media-thumb').first().click();
    await expect(page.locator('#lightbox')).toHaveClass(/open/);
    await page.locator('#lightbox-close').click();
    await expect(page.locator('#lightbox')).not.toHaveClass(/open/);
  });

  test('deleting an image removes its card', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    page.on('dialog', d => d.accept());
    await page.locator('.media-card').filter({ hasText: 'Sidewalk sale' }).locator('[data-del]').click();
    await expect(page.locator('.media-card')).toHaveCount(2);
    await expect(page.locator('.media-card').filter({ hasText: 'Sidewalk sale' })).toHaveCount(0);
  });

  test('uploading a file adds it to the gallery', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    await page.selectOption('#mi-src-select', 'facebook');
    await page.fill('#mi-cap-input', 'A fresh flyer');
    await page.setInputFiles('#mi-file-input', { name: 'flyer.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await expect(page.locator('.media-card')).toHaveCount(4);
    await expect(page.locator('#mi-upload-summary')).toContainText('Added 1 image');
    await expect(page.locator('.media-card').first()).toContainText('A fresh flyer');
  });

  test('attaching an inbox image to a listing marks it linked', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    let attachedTo = null;
    page.on('request', r => { if (r.url().includes('manage-business-photos')) attachedTo = JSON.parse(r.postData() || '{}').business_id; });
    const card = page.locator('.media-card').filter({ hasText: 'Rosario summer flyer' });
    await card.locator('[data-attach]').selectOption('biz-1');
    await expect(card.locator('.link-badge')).toBeVisible();
    expect(attachedTo).toBe('biz-1');
  });

  test('attaching an inbox image to a deal marks it linked to a deal', async ({ page }) => {
    await gotoTool(page, MEDIA);
    await openInbox(page);
    let sent = null;
    page.on('request', r => { if (r.url().includes('manage-media')) { const b = JSON.parse(r.postData() || '{}'); if (b.action === 'attach_deal') sent = b; } });
    const card = page.locator('.media-card').filter({ hasText: 'Rosario summer flyer' });
    await card.locator('[data-attach-deal]').selectOption('deal-1');
    await expect(card.locator('.link-badge')).toContainText('On a deal');
    expect(sent).toEqual({ action: 'attach_deal', id: 'm1', deal_id: 'deal-1' });
  });

  test('shows the empty state when nothing has been received', async ({ page }) => {
    await gotoTool(page, []);
    await openInbox(page);
    await expect(page.locator('#mi-gallery-empty')).toBeVisible();
    await expect(page.locator('.media-card')).toHaveCount(0);
    await expect(page.locator('#inbox-tab-count')).toBeHidden();
  });

  test('pull-from-inbox adds an inbox image onto the open listing', async ({ page }) => {
    await gotoTool(page, MEDIA);
    // Photos tab: pick a business, the pull strip should surface inbox images.
    await page.selectOption('#biz-select', 'biz-1');
    await expect(page.locator('#editor-card')).toBeVisible();
    await expect(page.locator('#pull-strip')).toBeVisible();
    await expect(page.locator('.photo-row')).toHaveCount(0);
    await page.locator('#pull-row [data-pull]').first().click();
    await expect(page.locator('.photo-row')).toHaveCount(1);
  });
});

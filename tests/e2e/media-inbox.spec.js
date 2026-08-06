const { test, expect } = require('@playwright/test');

// The Media Inbox is admin-only: auth is mocked to a signed-in session (the real
// gate is the ADMIN_EMAILS allowlist in the manage-media edge function), and the
// function itself is mocked at the network layer so the tests exercise the
// page's own list / filter / upload / delete / lightbox logic.

const MEDIA = [
  { id: 'm1', public_url: 'https://example.com/a.jpg', source: 'email', caption: 'Rosario summer flyer', business_id: null, event_id: null, deal_id: null, status: 'new', created_at: '2026-08-05T12:00:00Z' },
  { id: 'm2', public_url: 'https://example.com/b.jpg', source: 'text', caption: null, business_id: 'biz-1', event_id: null, deal_id: null, status: 'assigned', created_at: '2026-08-04T12:00:00Z' },
  { id: 'm3', public_url: 'https://example.com/c.jpg', source: 'facebook', caption: 'Sidewalk sale', business_id: null, event_id: null, deal_id: null, status: 'new', created_at: '2026-08-03T12:00:00Z' },
];

// 1x1 transparent PNG.
const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function setup(page, media) {
  await page.route('**/supabase-js**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  await page.route('**/heic2any**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  // The admin pages pull Google Fonts; that host is unreachable here and would
  // otherwise stall the load event. Stub it so goto resolves promptly.
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    window.supabase = {
      createClient: () => ({
        auth: {
          // Non-null session skips the login overlay.
          getSession: () => Promise.resolve({ data: { session: { access_token: 'test' } }, error: null }),
          signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
        },
      }),
    };
  });
  await page.route('**/functions/v1/manage-media', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'list') return route.fulfill({ json: { ok: true, media } });
    if (body.action === 'delete') return route.fulfill({ json: { ok: true, deleted: body.id } });
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
  await page.goto('/admin/media-inbox.html');
}

test.describe('Media inbox', () => {
  test('renders a card for every received image', async ({ page }) => {
    await setup(page, MEDIA);
    await expect(page.locator('.media-card')).toHaveCount(3);
    await expect(page.locator('#gallery-count')).toHaveText('3 images');
    await expect(page.locator('.media-card').filter({ hasText: 'Rosario summer flyer' })).toBeVisible();
  });

  test('an image linked to a listing shows the linked badge', async ({ page }) => {
    await setup(page, MEDIA);
    const linkedCard = page.locator('.media-card').filter({ has: page.locator('.link-badge') });
    await expect(linkedCard).toHaveCount(1);
    // m2 (source text) is the linked one.
    await expect(linkedCard).toContainText('Text');
  });

  test('source chips filter the gallery', async ({ page }) => {
    await setup(page, MEDIA);
    await expect(page.locator('.media-card')).toHaveCount(3);
    await page.locator('.chip[data-src="email"]').click();
    await expect(page.locator('.media-card')).toHaveCount(1);
    await expect(page.locator('.media-card')).toContainText('Rosario summer flyer');
    await page.locator('.chip[data-src=""]').click();
    await expect(page.locator('.media-card')).toHaveCount(3);
  });

  test('clicking a thumbnail opens the lightbox', async ({ page }) => {
    await setup(page, MEDIA);
    await expect(page.locator('#lightbox')).not.toHaveClass(/open/);
    await page.locator('.media-thumb').first().click();
    await expect(page.locator('#lightbox')).toHaveClass(/open/);
    await page.locator('#lightbox-close').click();
    await expect(page.locator('#lightbox')).not.toHaveClass(/open/);
  });

  test('deleting an image removes its card', async ({ page }) => {
    await setup(page, MEDIA);
    page.on('dialog', d => d.accept());
    await expect(page.locator('.media-card')).toHaveCount(3);
    await page.locator('.media-card').filter({ hasText: 'Sidewalk sale' }).locator('[data-del]').click();
    await expect(page.locator('.media-card')).toHaveCount(2);
    await expect(page.locator('.media-card').filter({ hasText: 'Sidewalk sale' })).toHaveCount(0);
  });

  test('uploading a file adds it to the gallery', async ({ page }) => {
    await setup(page, MEDIA);
    await expect(page.locator('.media-card')).toHaveCount(3);
    await page.selectOption('#src-select', 'facebook');
    await page.fill('#cap-input', 'A fresh flyer');
    await page.setInputFiles('#file-input', { name: 'flyer.png', mimeType: 'image/png', buffer: PNG_1x1 });
    await expect(page.locator('.media-card')).toHaveCount(4);
    await expect(page.locator('#upload-summary')).toContainText('Added 1 image');
    await expect(page.locator('.media-card').first()).toContainText('A fresh flyer');
  });

  test('shows the empty state when nothing has been received', async ({ page }) => {
    await setup(page, []);
    await expect(page.locator('#gallery-empty')).toBeVisible();
    await expect(page.locator('.media-card')).toHaveCount(0);
  });
});

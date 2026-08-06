const { test, expect } = require('@playwright/test');

// The submissions review hub (admin/review-submissions.html) reads and writes
// the pending queues through the manage-submissions edge function. Auth is
// mocked to a signed-in session (the real gate is the ADMIN_EMAILS allowlist in
// the function) and the function is mocked at the network layer.

function isoDay(offset) {
  const d = new Date();
  d.setDate(d.getDate() + offset);
  return d.toISOString().slice(0, 10);
}

const DEALS = [
  { id: 'd1', business_id: 'biz-1', business_name: 'Rosario Tavern', category: 'Food & Drink', title: '20% off your first visit', description: 'Dine in only.', discount: '20% OFF', expiry_date: isoDay(30), terms: 'One per table.', contact_name: 'Jane', contact_email: 'jane@example.com', contact_phone: null, created_at: '2026-08-01T12:00:00Z' },
];
const EVENTS = [
  { id: 'e1', title: 'Summer Concert', description: 'Live music in the park.', event_type: 'music', event_date: isoDay(20), start_time: '19:00:00', end_time: null, location_name: 'Towne Park', address: null, city: 'Shorewood', organizer: 'Village Parks', url: null, price: 'Free', created_at: '2026-08-02T12:00:00Z' },
  { id: 'e2', title: 'Old Festival', description: null, event_type: 'festival', event_date: isoDay(-40), start_time: null, end_time: null, location_name: 'Fairgrounds', address: null, city: 'Minooka', organizer: 'Lions Club', url: null, price: 'Free', created_at: '2026-06-01T12:00:00Z' },
];

async function gotoHub(page, deals, events) {
  await page.route('**/supabase-js**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  await page.route('**/fonts.googleapis.com/**', r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  await page.addInitScript(() => {
    window.supabase = {
      createClient: () => ({
        auth: {
          getSession: () => Promise.resolve({ data: { session: { access_token: 'test' } }, error: null }),
          signInWithPassword: () => Promise.resolve({ data: {}, error: null }),
        },
      }),
    };
  });
  await page.route('**/functions/v1/manage-submissions', async (route) => {
    const body = JSON.parse(route.request().postData() || '{}');
    if (body.action === 'list') return route.fulfill({ json: { ok: true, deals, events } });
    if (body.action === 'approve' || body.action === 'reject') return route.fulfill({ json: { ok: true, type: body.type, id: body.id } });
    return route.fulfill({ json: { ok: false, error: 'unknown action' } });
  });
  await page.goto('/admin/review-submissions.html');
  await page.waitForSelector('#deals-loading', { state: 'hidden', timeout: 8000 });
}

test.describe('Review submissions hub', () => {
  test('lists pending deals with a count and defaults to the deals tab', async ({ page }) => {
    await gotoHub(page, DEALS, EVENTS);
    await expect(page.locator('#panel-deals')).toBeVisible();
    await expect(page.locator('#deals-list .sub-card')).toHaveCount(1);
    await expect(page.locator('#deals-count')).toHaveText('1');
    await expect(page.locator('.sub-card').filter({ hasText: '20% off your first visit' })).toContainText('Rosario Tavern');
  });

  test('events tab lists pending events and flags a past date', async ({ page }) => {
    await gotoHub(page, DEALS, EVENTS);
    await page.locator('.tab-btn[data-tab="events"]').click();
    await expect(page.locator('#panel-events')).toBeVisible();
    await expect(page.locator('#events-list .sub-card')).toHaveCount(2);
    await expect(page.locator('#events-count')).toHaveText('2');
    const stale = page.locator('.sub-card').filter({ hasText: 'Old Festival' });
    await expect(stale.locator('.stale-flag')).toBeVisible();
  });

  test('approving a deal calls the function and removes the card', async ({ page }) => {
    await gotoHub(page, DEALS, EVENTS);
    let sent = null;
    page.on('request', r => { if (r.url().includes('manage-submissions')) { const b = JSON.parse(r.postData() || '{}'); if (b.action === 'approve') sent = b; } });
    await page.locator('.sub-card').filter({ hasText: '20% off' }).locator('.btn-approve').click();
    await expect(page.locator('#deals-list .sub-card')).toHaveCount(0);
    await expect(page.locator('#deals-empty')).toBeVisible();
    expect(sent).toEqual({ action: 'approve', type: 'deal', id: 'd1' });
  });

  test('rejecting an event deletes it after confirm', async ({ page }) => {
    await gotoHub(page, DEALS, EVENTS);
    page.on('dialog', d => d.accept());
    let sent = null;
    page.on('request', r => { if (r.url().includes('manage-submissions')) { const b = JSON.parse(r.postData() || '{}'); if (b.action === 'reject') sent = b; } });
    await page.locator('.tab-btn[data-tab="events"]').click();
    await page.locator('.sub-card').filter({ hasText: 'Old Festival' }).locator('.btn-reject').click();
    await expect(page.locator('#events-list .sub-card')).toHaveCount(1);
    await expect(page.locator('.sub-card').filter({ hasText: 'Old Festival' })).toHaveCount(0);
    expect(sent).toEqual({ action: 'reject', type: 'event', id: 'e2' });
  });

  test('shows empty states when nothing is pending', async ({ page }) => {
    await gotoHub(page, [], []);
    await expect(page.locator('#deals-empty')).toBeVisible();
    await expect(page.locator('#deals-count')).toBeHidden();
    await page.locator('.tab-btn[data-tab="events"]').click();
    await expect(page.locator('#events-empty')).toBeVisible();
  });
});

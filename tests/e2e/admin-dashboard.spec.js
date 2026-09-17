const { test, expect } = require('@playwright/test');

// /admin/dashboard pulls its payload from the admin-gated edge function.
// Stub Supabase, the summary function, and GitHub so render logic is offline.

const SUMMARY = {
  ok: true,
  generated_at: new Date().toISOString(),
  counts: {
    active_businesses: 209, pending_businesses: 2,
    pending_events: 1, pending_deals: 0,
    open_claims: 1, open_studio_inquiries: 0,
    advertise_waitlist: 0, flagged_reviews: 0,
    upcoming_events: 4, active_deals: 0,
    newsletter_subs: 31, newsletter_active: 30,
    missing_photos: 61, missing_phone: 20, missing_website: 93,
    action_total: 4,
  },
  towns: [
    { city: 'Minooka', count: 117 },
    { city: 'Channahon', count: 59 },
    { city: 'Shorewood', count: 18 },
  ],
  queue: {
    pending_businesses: [
      { id: 'p1', name: 'Pending Coffee Co', category: 'Coffee', city: 'Minooka', created_at: new Date().toISOString() },
      { id: 'p2', name: 'Second Pending LLC', category: 'Home Services', city: 'Shorewood', created_at: new Date().toISOString() },
    ],
    claims: [
      { id: 'c1', business_name: 'Taco Fixx', claimant_name: 'Jane Owner', role: 'Owner', email: 'jane@example.com', phone: '', status: 'pending', open: true, created_at: new Date().toISOString() },
    ],
    studio_inquiries: [],
    advertise: [],
    pending_events: [
      { id: 'e1', title: 'Summer Market', event_date: '2026-08-20', city: 'Channahon', created_at: new Date().toISOString() },
    ],
    pending_deals: [],
    flagged_reviews: [],
  },
  recent_businesses: [
    { id: 'r1', name: 'Newest Local Shop', category: 'Retail & Shops', city: 'Minooka', is_active: true, is_locally_owned: true, created_at: new Date().toISOString() },
  ],
  integrations: {
    facebook: { connected: false },
    cloudflare: { connected: false },
    resend: { connected: false },
  },
};

async function openDashboard(page, summary) {
  await page.route('**/supabase-js**', r =>
    r.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' }));
  await page.route('**/functions/v1/admin-dashboard', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(summary) }));
  await page.route('https://api.github.com/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.addInitScript(() => {
    const session = { access_token: 'test', user: { email: 'typommier@gmail.com' } };
    window.supabase = {
      createClient: () => ({
        from: () => {
          const q = {
            select: () => q, eq: () => q, order: () => q, is: () => q,
            then: (f) => Promise.resolve({ data: [], error: null, count: 0 }).then(f),
          };
          return q;
        },
        auth: {
          getSession: () => Promise.resolve({ data: { session }, error: null }),
          signOut: () => Promise.resolve({ error: null }),
        },
      }),
    };
  });
  await page.goto('/admin/dashboard');
}

test.describe('Admin command center', () => {
  test('renders the greeting, today brief, and live listing count', async ({ page }) => {
    await openDashboard(page, SUMMARY);

    await expect(page.locator('#greeting')).toContainText(/Good (morning|afternoon|evening), Typommier/);
    await expect(page.locator('#greeting-sub')).toContainText('209');
    await expect(page.locator('#brief-lead')).toContainText('listings to approve');
    await expect(page.locator('#brief-chips .chip')).not.toHaveCount(0);
    await expect(page.locator('#recent-list')).toContainText('Newest Local Shop');
    await expect(page.locator('#b-queue')).toHaveText('4');
  });

  test('inbox lists claim requests that need a reply', async ({ page }) => {
    await openDashboard(page, SUMMARY);
    await page.locator('.si[data-view="inbox"]').click();
    await expect(page.locator('#inbox-list')).toContainText('Jane Owner');
    await expect(page.locator('#inbox-list')).toContainText('Taco Fixx');
    await expect(page.locator('#inbox-detail')).toContainText('Jane Owner');
  });

  test('queue lists pending businesses and events by name', async ({ page }) => {
    await openDashboard(page, SUMMARY);
    await page.locator('.si[data-view="queue"]').click();
    const queue = page.locator('#queue-card');
    await expect(queue).toContainText('Businesses waiting');
    await expect(queue).toContainText('Pending Coffee Co');
    await expect(queue).toContainText('Events waiting');
    await expect(queue).toContainText('Summer Market');
  });

  test('integrations with no secret set show a connect state, not fake data', async ({ page }) => {
    await openDashboard(page, SUMMARY);
    await page.locator('.si[data-view="site"]').click();
    await expect(page.locator('#fb-body')).toContainText('Facebook is off');
    await expect(page.locator('#fb-body')).toContainText('FACEBOOK_PAGE');
    await expect(page.locator('#cf-body')).toContainText('CLOUDFLARE');
    await expect(page.locator('#rs-body')).toContainText('RESEND_API_KEY');
  });

  test('approving a pending business calls manage-submissions with the right payload', async ({ page }) => {
    await openDashboard(page, SUMMARY);
    let captured = null;
    await page.route('**/functions/v1/manage-submissions', r => {
      captured = r.request().postDataJSON();
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, type: 'business', id: 'p1' }) });
    });

    await page.locator('.si[data-view="queue"]').click();
    const row = page.locator('.task[data-type="business"]').first();
    await row.getByRole('button', { name: 'Approve' }).click();

    await expect.poll(() => captured && captured.action).toBe('approve');
    expect(captured.type).toBe('business');
    expect(captured.id).toBe('p1');
    await expect(page.locator('#toast')).toContainText(/business published/i);
  });

  test('rejecting asks for confirmation and only fires when confirmed', async ({ page }) => {
    await openDashboard(page, SUMMARY);
    let calls = 0;
    await page.route('**/functions/v1/manage-submissions', r => {
      calls += 1;
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    await page.locator('.si[data-view="queue"]').click();
    const evtRow = page.locator('.task[data-type="event"]').first();

    page.once('dialog', d => d.dismiss());
    await evtRow.getByRole('button', { name: 'Reject' }).click();
    await page.waitForTimeout(200);
    expect(calls).toBe(0);

    page.once('dialog', d => d.accept());
    await evtRow.getByRole('button', { name: 'Reject' }).click();
    await expect.poll(() => calls).toBe(1);
  });

  test('an empty queue shows the caught-up state', async ({ page }) => {
    const clean = JSON.parse(JSON.stringify(SUMMARY));
    clean.counts.action_total = 0;
    clean.counts.pending_businesses = 0;
    clean.counts.pending_events = 0;
    clean.counts.open_claims = 0;
    clean.queue = {
      pending_businesses: [], claims: [], studio_inquiries: [],
      advertise: [], pending_events: [], pending_deals: [], flagged_reviews: [],
    };
    await openDashboard(page, clean);

    await page.locator('.si[data-view="queue"]').click();
    await expect(page.locator('#queue-card')).toContainText('Queue is empty');
    await expect(page.locator('#b-queue')).not.toHaveClass(/show/);
  });
});

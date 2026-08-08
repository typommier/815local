const { test, expect } = require('@playwright/test');

// The admin command center (/admin/dashboard.html) pulls its whole payload from
// one admin-gated edge function, then renders GitHub client-side and shows
// "connect this" states for any integration whose secret is unset. These tests
// stub all three network surfaces so the render logic is exercised offline, the
// same approach as admin-photo-tool.spec.js.

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
  // GitHub is unauthenticated + external; return empty so the panel renders its
  // "no activity" state without a live call.
  await page.route('https://api.github.com/**', r =>
    r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));

  await page.addInitScript(() => {
    const session = { access_token: 'test', user: { email: 'typommier@gmail.com' } };
    window.supabase = {
      createClient: () => ({
        from: () => {
          const q = { select: () => q, eq: () => q, order: () => q, is: () => q,
            then: (f) => Promise.resolve({ data: [], error: null, count: 0 }).then(f) };
          return q;
        },
        // Non-null session skips the login overlay; the real gate is server-side.
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
  test('renders the greeting, overview and the onboarding queue from the summary', async ({ page }) => {
    await openDashboard(page, SUMMARY);

    // Greeting is time-of-day + the admin's name derived from their email.
    await expect(page.locator('#greeting')).toContainText(/Good (morning|afternoon|evening), Typommier/);
    await expect(page.locator('#greeting-sub')).toContainText('4');

    // The 60-second overview summarizes what needs attention.
    await expect(page.locator('#overview-lead')).toContainText('businesses awaiting review');
    await expect(page.locator('#overview-chips .chip')).not.toHaveCount(0);

    // The onboarding queue lists the real pending items by name.
    const queue = page.locator('#queue-body');
    await expect(queue).toContainText('Businesses awaiting review');
    await expect(queue).toContainText('Pending Coffee Co');
    await expect(queue).toContainText('Business claim requests');
    await expect(queue).toContainText('Taco Fixx');
    await expect(queue).toContainText('Events awaiting review');
    await expect(queue).toContainText('Summer Market');

    // Directory health stat tiles reflect the counts.
    await expect(page.locator('#directory-body')).toContainText('Live businesses');
    await expect(page.locator('#directory-body')).toContainText('209');

    // The onboarding nav badge shows the action total.
    await expect(page.locator('#nb-queue')).toHaveText('4');
  });

  test('integrations with no secret set show a connect state, not fake data', async ({ page }) => {
    await openDashboard(page, SUMMARY);

    await expect(page.locator('#fb-body')).toContainText('Not connected yet');
    await expect(page.locator('#fb-body')).toContainText('FACEBOOK_PAGE_TOKEN');
    await expect(page.locator('#cf-body')).toContainText('CLOUDFLARE_API_TOKEN');
    await expect(page.locator('#resend-body')).toContainText('RESEND_API_KEY');
  });

  test('approving a pending business calls manage-submissions with the right payload', async ({ page }) => {
    await openDashboard(page, SUMMARY);
    let captured = null;
    await page.route('**/functions/v1/manage-submissions', r => {
      captured = r.request().postDataJSON();
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, type: 'business', id: 'p1' }) });
    });

    const row = page.locator('.q-row[data-type="business"]').first();
    await row.getByRole('button', { name: 'Approve' }).click();

    await expect.poll(() => captured && captured.action).toBe('approve');
    expect(captured.type).toBe('business');
    expect(captured.id).toBe('p1');
    await expect(page.locator('#toast')).toContainText('Business published');
  });

  test('rejecting asks for confirmation and only fires when confirmed', async ({ page }) => {
    await openDashboard(page, SUMMARY);
    let calls = 0;
    await page.route('**/functions/v1/manage-submissions', r => {
      calls += 1;
      r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true }) });
    });

    // Dismiss the confirm first -> no call.
    page.once('dialog', d => d.dismiss());
    const evtRow = page.locator('.q-row[data-type="event"]').first();
    await evtRow.getByRole('button', { name: 'Reject' }).click();
    await page.waitForTimeout(200);
    expect(calls).toBe(0);

    // Accept the confirm -> one reject call.
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
    clean.queue = { pending_businesses: [], claims: [], studio_inquiries: [], advertise: [], pending_events: [], pending_deals: [], flagged_reviews: [] };
    await openDashboard(page, clean);

    await expect(page.locator('#queue-body')).toContainText('all caught up');
    await expect(page.locator('#nb-queue')).not.toHaveClass(/show/);
  });
});

const { test, expect } = require('@playwright/test');

// Scout chat widget reliability tests. The widget is injected by
// assets/js/815local-widget.js (included on the homepage and other public
// pages). We stub the Supabase CDN so the page's own data code stays quiet, and
// intercept the chat edge function so we control its responses.

const CHAT_GLOB = '**/functions/v1/chat';

async function openWidget(page) {
  await page.route('**/supabase-js**', route =>
    route.fulfill({ status: 200, contentType: 'text/javascript', body: '/* stub */' })
  );
  await page.goto('/');
  await page.locator('#ol-launcher').click();
  await expect(page.locator('#ol-panel')).toHaveClass(/open/);
}

async function ask(page, text) {
  await page.locator('#ol-input').fill(text);
  await page.locator('#ol-send').click();
}

test.describe('Scout widget', () => {
  test('body is an ARIA live region', async ({ page }) => {
    await openWidget(page);
    const body = page.locator('#ol-body');
    await expect(body).toHaveAttribute('role', 'log');
    await expect(body).toHaveAttribute('aria-live', 'polite');
  });

  test('locks input while a request is in flight and blocks double-send', async ({ page }) => {
    let calls = 0;
    await page.route(CHAT_GLOB, async route => {
      calls++;
      await new Promise(r => setTimeout(r, 700));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({ reply: 'Here you go.', candidates: [] }),
      });
    });
    await openWidget(page);
    await ask(page, 'best tacos');

    // While pending: typing indicator shown, input disabled.
    await expect(page.locator('.ol-typing')).toBeVisible();
    await expect(page.locator('#ol-input')).toBeDisabled();
    // A second Enter during the in-flight request must not fire another call.
    await page.locator('#ol-input').press('Enter').catch(() => {});

    await expect(page.locator('.ol-typing')).toHaveCount(0);
    await expect(page.locator('#ol-input')).toBeEnabled();
    expect(calls).toBe(1);
  });

  test('shows a friendly message on a server error (non-200)', async ({ page }) => {
    await page.route(CHAT_GLOB, route =>
      route.fulfill({ status: 500, contentType: 'application/json', body: '{"error":"boom"}' })
    );
    await openWidget(page);
    await ask(page, 'anything');
    await expect(page.locator('.ol-msg.bot', { hasText: /hit a snag/i })).toBeVisible();
  });

  test('shows a friendly message on a network failure', async ({ page }) => {
    await page.route(CHAT_GLOB, route => route.abort());
    await openWidget(page);
    await ask(page, 'anything');
    await expect(page.locator('.ol-msg.bot', { hasText: /couldn.t reach the concierge/i })).toBeVisible();
  });

  test('renders only https candidate links, rejects unsafe schemes', async ({ page }) => {
    await page.route(CHAT_GLOB, route =>
      route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          reply: 'Two spots:',
          candidates: [
            { name: 'Good Biz', area: 'Minooka', url: 'https://815local.com/pages/business.html?id=1', phone: null },
            { name: 'Evil Biz', area: 'Minooka', url: 'javascript:alert(1)', phone: null },
          ],
        }),
      })
    );
    await openWidget(page);
    await ask(page, 'stuff');

    const goodLink = page.locator('.ol-candidate a', { hasText: 'Good Biz' });
    await expect(goodLink).toHaveAttribute('href', 'https://815local.com/pages/business.html?id=1');
    await expect(goodLink).toHaveAttribute('rel', /noopener/);
    // The javascript: URL must NOT become an anchor; it renders as plain text.
    await expect(page.locator('.ol-candidate a', { hasText: 'Evil Biz' })).toHaveCount(0);
    await expect(page.locator('.ol-candidate-name', { hasText: 'Evil Biz' })).toBeVisible();
    // And no anchor anywhere should carry a javascript: href.
    await expect(page.locator('a[href^="javascript:"]')).toHaveCount(0);
  });

  test('keeps last candidates when a turn returns none', async ({ page }) => {
    const bodies = [];
    let n = 0;
    await page.route(CHAT_GLOB, async route => {
      bodies.push(JSON.parse(route.request().postData() || '{}'));
      n++;
      let payload;
      if (n === 1) {
        payload = { reply: 'Found tacos.', candidates: [{ name: 'Taco Fixx', area: 'Minooka', url: 'https://815local.com/x', phone: '111' }] };
      } else {
        payload = { reply: 'Nothing new.', candidates: [] }; // candidate-less turn
      }
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(payload) });
    });

    await openWidget(page);
    await ask(page, 'best tacos');
    await expect(page.locator('.ol-candidate a', { hasText: 'Taco Fixx' })).toBeVisible();

    await ask(page, 'any others?');
    await expect(page.locator('.ol-msg.bot', { hasText: /nothing new/i })).toBeVisible();

    await ask(page, 'contact info');
    // The third request must still carry Taco Fixx as lastCandidates, even though
    // the second (candidate-less) turn ran in between.
    expect(bodies.length).toBe(3);
    const carried = bodies[2].lastCandidates || [];
    expect(carried.some(c => c.name === 'Taco Fixx')).toBe(true);
  });
});

// Same-origin notify endpoint. Replaces the unauthenticated Supabase
// notify-submission function the public forms used to call directly.
// Does not send email itself (no Resend key in Pages). Rate-limits by IP
// via Cache API so a bot cannot hammer this path.

const MAX_PER_WINDOW = 8;
const ALLOWED_ORIGINS = new Set([
  'https://815local.com',
  'https://www.815local.com',
]);

function cors(req) {
  const origin = req.headers.get('Origin') || '';
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : 'https://815local.com';
  return {
    'Access-Control-Allow-Origin': allow,
    'Vary': 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'X-Content-Type-Options': 'nosniff',
  };
}

function clientIp(req) {
  return (req.headers.get('CF-Connecting-IP')
    || (req.headers.get('X-Forwarded-For') || '').split(',')[0].trim()
    || 'unknown');
}

async function overLimit(ip) {
  const key = new Request('https://815local-rate.internal/notify/' + encodeURIComponent(ip));
  const hit = await caches.default.match(key);
  let n = 1;
  if (hit) {
    n = Number(await hit.text()) + 1;
  }
  const res = new Response(String(n), {
    headers: { 'Cache-Control': 'max-age=60' },
  });
  await caches.default.put(key, res.clone());
  return n > MAX_PER_WINDOW;
}

export async function onRequest(context) {
  const { request } = context;
  const headers = cors(request);
  if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers });
  if (request.method !== 'POST') {
    return new Response(JSON.stringify({ ok: false, error: 'method not allowed' }), {
      status: 405, headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  const origin = request.headers.get('Origin') || '';
  const referer = request.headers.get('Referer') || '';
  const fromSite = ALLOWED_ORIGINS.has(origin)
    || referer.startsWith('https://815local.com/')
    || referer.startsWith('https://www.815local.com/');
  if (!fromSite) {
    return new Response(JSON.stringify({ ok: false, error: 'unauthorized' }), {
      status: 401, headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  if (await overLimit(clientIp(request))) {
    return new Response(JSON.stringify({ ok: false, error: 'rate limited' }), {
      status: 429, headers: { ...headers, 'Content-Type': 'application/json' },
    });
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200, headers: { ...headers, 'Content-Type': 'application/json' },
  });
}

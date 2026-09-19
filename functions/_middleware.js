// Site-wide edge middleware for Cloudflare Pages.
// 1) Block internal / backup / source paths from being served.
// 2) Inject homepage weekend layout without rewriting the 100k index.html blob.

const BLOCK = [
  /^\/CLAUDE\.md$/i,
  /^\/_backups(\/|$)/i,
  /^\/index-v1-backup(\.html)?$/i,
  /^\/mockups(\/|$)/i,
  /^\/supabase(\/|$)/i,
  /^\/\.github(\/|$)/i,
  /^\/package(-lock)?\.json$/i,
  /^\/playwright\.config\.js$/i,
  /^\/tests(\/|$)/i,
  /^\/\.gitignore$/i,
  /^\/\.env/i,
];

function blocked(pathname) {
  const path = pathname.replace(/\/+$/, '') || '/';
  return BLOCK.some((re) => re.test(path) || re.test(pathname));
}

function withSecurity(res, path) {
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=()');
  headers.delete('Access-Control-Allow-Origin');
  if (path.startsWith('/admin')) {
    headers.set('X-Robots-Tag', 'noindex, nofollow, noarchive');
    headers.set('Cache-Control', 'no-store');
  }
  return new Response(res.body, { status: res.status, headers });
}

export async function onRequest(context) {
  const url = new URL(context.request.url);
  const path = url.pathname;

  if (blocked(path)) {
    return withSecurity(new Response('Not found', {
      status: 404,
      headers: { 'Content-Type': 'text/plain; charset=utf-8', 'X-Robots-Tag': 'noindex' },
    }), path);
  }

  const res = await context.next();

  if (path !== '/' && path !== '/index.html') {
    return withSecurity(res, path);
  }

  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return withSecurity(res, path);

  let html = await res.text();
  if (!html.includes('homepage-weekend.js')) {
    html = html.replace(
      '</body>',
      '<script src="/assets/js/homepage-weekend.js" defer></script>\n</body>'
    );
  }
  html = html.replace(
    'A real, hyperlocal directory of businesses, events, and parks across Minooka, Channahon, &amp; Shorewood.',
    'This weekend: Friday football, Heap farm Saturday, splash pads through Monday. Then the shops.'
  );
  const headers = new Headers(res.headers);
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  headers.delete('Access-Control-Allow-Origin');
  return new Response(html, { status: res.status, headers });
}

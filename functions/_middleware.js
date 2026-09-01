// Inject homepage weekend layout without rewriting the 100k index.html blob.
export async function onRequest(context) {
  const res = await context.next();
  const url = new URL(context.request.url);
  const path = url.pathname;
  if (path !== '/' && path !== '/index.html') return res;
  const type = res.headers.get('content-type') || '';
  if (!type.includes('text/html')) return res;

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
  return new Response(html, {
    status: res.status,
    headers: res.headers,
  });
}

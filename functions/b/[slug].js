const SUPABASE_URL = 'https://kyneaettrynagavewefi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk';

function slugifyBiz(name, city) {
  const base = String(name || '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  const town = String(city || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return town ? base + '-' + town : base;
}

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&')
    .replace(/</g, '<')
    .replace(/"/g, '"');
}

async function readShell(context) {
  const { request, env } = context;
  const paths = ['/pages/business', '/pages/business.html'];
  for (const path of paths) {
    const url = new URL(path, 'https://815local.com');
    let res = null;
    try {
      if (env && env.ASSETS) {
        res = await env.ASSETS.fetch(new Request(url.toString(), { method: 'GET' }));
      }
    } catch (e) {}
    if (!res || res.status >= 400 || res.status === 308 || res.status === 301 || res.status === 302) {
      const loc = res && res.headers.get('Location');
      const nextUrl = loc ? new URL(loc, url).toString() : url.toString();
      try {
        if (env && env.ASSETS && loc) {
          res = await env.ASSETS.fetch(new Request(nextUrl, { method: 'GET' }));
        } else {
          res = await fetch(nextUrl, { method: 'GET', redirect: 'follow' });
        }
      } catch (e) {
        continue;
      }
    }
    if (!res || !res.ok) continue;
    const html = await res.text();
    if (html && html.length > 2000 && html.indexOf('const bizId') !== -1) return html;
  }
  return '';
}

export async function onRequest(context) {
  const slug = decodeURIComponent((context.params && context.params.slug) || '').toLowerCase();
  if (!slug) return Response.redirect('https://815local.com/pages/directory.html', 302);

  let rows = [];
  try {
    const api = SUPABASE_URL + '/rest/v1/businesses_with_ratings?is_active=eq.true&select=id,name,city,description,category,address,state,zip,phone,website,image_url,photos,hours,price_range';
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    if (r.ok) rows = await r.json();
  } catch (e) {}

  const list = Array.isArray(rows) ? rows : [];
  const biz = list.find(b => slugifyBiz(b.name, b.city) === slug)
    || list.find(b => slugifyBiz(b.name, b.city) + '-' + String(b.id).slice(0, 8) === slug);

  if (!biz) return Response.redirect('https://815local.com/pages/directory.html', 302);

  let html = await readShell(context);
  if (!html) {
    return Response.redirect('https://815local.com/pages/business.html?id=' + encodeURIComponent(biz.id), 302);
  }

  html = html.replace(
    'const bizId = params.get(\'id\');',
    'const bizId = params.get(\'id\') || window.__BIZ_ID || null;'
  );

  const canonical = 'https://815local.com/b/' + slug;
  const title = biz.name + ' in ' + (biz.city || 'the 815') + ' | 815local';
  const desc = biz.description
    ? String(biz.description).slice(0, 160)
    : ((biz.category || 'Local business') + ' in ' + (biz.city || 'the 815') + '. Hours, phone, and details on 815local.');
  const img = biz.image_url || (Array.isArray(biz.photos) && biz.photos[0]) || '';

  html = html.replace(/<title>[\s\S]*?<\/title>/, '<title>' + esc(title) + '</title>');
  if (html.indexOf('rel="canonical"') !== -1) {
    html = html.replace(/<link rel="canonical"[^>]*>/, '<link rel="canonical" href="' + canonical + '">');
  } else {
    html = html.replace('</head>', '<link rel="canonical" href="' + canonical + '">\n</head>');
  }
  html = html.replace(/(<meta name="description" content=")[^"]*/, '$1' + esc(desc));
  html = html.replace(/(<meta property="og:title" content=")[^"]*/, '$1' + esc(title));
  html = html.replace(/(<meta property="og:description" content=")[^"]*/, '$1' + esc(desc));
  html = html.replace(/(<meta property="og:url" content=")[^"]*/, '$1' + canonical);
  if (img) html = html.replace(/(<meta property="og:image" content=")[^"]*/, '$1' + esc(img));

  const ld = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': canonical,
    name: biz.name,
    url: canonical
  };
  if (biz.description) ld.description = String(biz.description).slice(0, 300);
  if (biz.address || biz.city) {
    ld.address = { '@type': 'PostalAddress', addressCountry: 'US' };
    if (biz.address) ld.address.streetAddress = biz.address;
    if (biz.city) ld.address.addressLocality = biz.city;
    if (biz.state) ld.address.addressRegion = biz.state;
    if (biz.zip) ld.address.postalCode = biz.zip;
  }
  if (biz.phone) ld.telephone = biz.phone;
  if (img) ld.image = img;

  html = html.replace(
    '</head>',
    '<script>window.__BIZ_ID=' + JSON.stringify(biz.id) + ';</script>\n' +
    '<script type="application/ld+json" id="ld-business">' +
    JSON.stringify(ld).replace(/</g, '\\u003c') +
    '</script>\n</head>'
  );

  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=60'
    }
  });
}

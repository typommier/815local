// Cloudflare Pages Function for /sitemap.xml
//
// Replaces the old static sitemap (15 pages). It emits the static pages plus a
// <url> for every active business, fetched from Supabase at the edge, so the
// 128+ business detail pages become discoverable by search engines. New
// businesses appear automatically with no redeploy. This function shadows any
// static file at the same path.

const SUPABASE_URL = 'https://kyneaettrynagavewefi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk';

const BASE = 'https://815local.com';

// Static pages carried over from the previous sitemap.xml.
const STATIC_URLS = [
  { path: '/',                                  changefreq: 'daily',   priority: '1.0' },
  { path: '/pages/directory.html',              changefreq: 'daily',   priority: '0.9' },
  { path: '/pages/events.html',                 changefreq: 'daily',   priority: '0.8' },
  { path: '/pages/deals.html',                  changefreq: 'daily',   priority: '0.7' },
  { path: '/pages/business.html',               changefreq: 'weekly',  priority: '0.7' },
  { path: '/pages/blog.html',                   changefreq: 'weekly',  priority: '0.6' },
  { path: '/pages/blog/origin-story.html',      changefreq: 'monthly', priority: '0.5' },
  { path: '/pages/about.html',                  changefreq: 'monthly', priority: '0.5' },
  { path: '/pages/advertise.html',              changefreq: 'monthly', priority: '0.5' },
  { path: '/pages/submit/business.html',        changefreq: 'monthly', priority: '0.7' },
  { path: '/pages/submit/event.html',           changefreq: 'monthly', priority: '0.7' },
  { path: '/pages/submit/deal.html',            changefreq: 'monthly', priority: '0.7' },
  { path: '/pages/submit/claim-business.html',  changefreq: 'monthly', priority: '0.6' },
  { path: '/legal/privacy.html',                changefreq: 'yearly',  priority: '0.3' },
  { path: '/legal/terms.html',                  changefreq: 'yearly',  priority: '0.3' }
];

function xmlEscape(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function urlBlock(loc, lastmod, changefreq, priority) {
  return '  <url>\n' +
    '    <loc>' + xmlEscape(loc) + '</loc>\n' +
    '    <lastmod>' + lastmod + '</lastmod>\n' +
    '    <changefreq>' + changefreq + '</changefreq>\n' +
    '    <priority>' + priority + '</priority>\n' +
    '  </url>';
}

export async function onRequest() {
  const today = new Date().toISOString().slice(0, 10);

  let businesses = [];
  try {
    const api = SUPABASE_URL + '/rest/v1/businesses?is_active=eq.true&select=id,created_at';
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    if (r.ok) businesses = await r.json();
  } catch (e) {
    // On failure still serve the static portion of the sitemap.
  }

  const blocks = [];
  STATIC_URLS.forEach(u => blocks.push(urlBlock(BASE + u.path, today, u.changefreq, u.priority)));
  businesses.forEach(b => {
    const lastmod = (b.created_at || today).slice(0, 10);
    blocks.push(urlBlock(BASE + '/pages/business.html?id=' + b.id, lastmod, 'weekly', '0.6'));
  });

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    blocks.join('\n') + '\n' +
    '</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=86400'
    }
  });
}

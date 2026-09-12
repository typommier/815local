const SUPABASE_URL = 'https://kyneaettrynagavewefi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk';
const BASE = 'https://815local.com';

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

const STATIC_URLS = [
  { path: '/', changefreq: 'daily', priority: '1.0' },
  { path: '/pages/directory.html', changefreq: 'daily', priority: '0.9' },
  { path: '/minooka', changefreq: 'weekly', priority: '0.85' },
  { path: '/channahon', changefreq: 'weekly', priority: '0.85' },
  { path: '/shorewood', changefreq: 'weekly', priority: '0.85' },
  { path: '/pages/events.html', changefreq: 'daily', priority: '0.8' },
  { path: '/pages/deals.html', changefreq: 'daily', priority: '0.7' },
  { path: '/pages/blog.html', changefreq: 'weekly', priority: '0.6' },
  { path: '/pages/blog/origin-story.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/pages/about.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/pages/advertise.html', changefreq: 'monthly', priority: '0.5' },
  { path: '/pages/submit/business.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/pages/submit/event.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/pages/submit/deal.html', changefreq: 'monthly', priority: '0.7' },
  { path: '/pages/submit/claim-business.html', changefreq: 'monthly', priority: '0.6' },
  { path: '/legal/privacy.html', changefreq: 'yearly', priority: '0.3' },
  { path: '/legal/terms.html', changefreq: 'yearly', priority: '0.3' }
];

function xmlEscape(s) {
  return String(s).replace(/&/g, '&').replace(/</g, '<').replace(/>/g, '>');
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
    const api = SUPABASE_URL + '/rest/v1/businesses?is_active=eq.true&select=id,name,city,created_at';
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    if (r.ok) businesses = await r.json();
  } catch (e) {}

  const seen = {};
  const blocks = [];
  STATIC_URLS.forEach(u => blocks.push(urlBlock(BASE + u.path, today, u.changefreq, u.priority)));
  businesses.forEach(b => {
    let slug = slugifyBiz(b.name, b.city) || b.id;
    if (seen[slug]) slug = slug + '-' + String(b.id).slice(0, 8);
    seen[slug] = true;
    const lastmod = (b.created_at || today).slice(0, 10);
    blocks.push(urlBlock(BASE + '/b/' + slug, lastmod, 'weekly', '0.6'));
  });

  const xml = '<?xml version="1.0" encoding="UTF-8"?>\n' +
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
    blocks.join('\n') + '\n</urlset>\n';

  return new Response(xml, {
    headers: {
      'Content-Type': 'application/xml; charset=utf-8',
      'Cache-Control': 'public, max-age=3600'
    }
  });
}

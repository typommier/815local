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

export async function onRequest(context) {
  const slug = decodeURIComponent((context.params && context.params.slug) || '').toLowerCase();
  if (!slug) {
    return Response.redirect('https://815local.com/pages/directory.html', 302);
  }

  let rows = [];
  try {
    const api = SUPABASE_URL + '/rest/v1/businesses?is_active=eq.true&select=id,name,city';
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    if (r.ok) rows = await r.json();
  } catch (e) {}

  const list = Array.isArray(rows) ? rows : [];
  const biz = list.find(b => slugifyBiz(b.name, b.city) === slug)
    || list.find(b => slugifyBiz(b.name, b.city) + '-' + String(b.id).slice(0, 8) === slug);

  if (!biz) {
    return Response.redirect('https://815local.com/pages/directory.html', 302);
  }

  return Response.redirect('https://815local.com/pages/business.html?id=' + encodeURIComponent(biz.id), 302);
}

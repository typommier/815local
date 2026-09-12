// Cloudflare Pages Function for /pages/business.html
// Old ?id= URLs 301 to /b/name-town. Meta injection stays as a fallback.

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
  const { request, next } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');
  if (!id) return next();

  let biz = null;
  try {
    const api = SUPABASE_URL + '/rest/v1/businesses_with_ratings?id=eq.' +
      encodeURIComponent(id) + '&is_active=eq.true&select=id,name,city';
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) biz = rows[0];
    }
  } catch (e) {}

  if (biz && biz.name) {
    const dest = 'https://815local.com/b/' + slugifyBiz(biz.name, biz.city);
    return Response.redirect(dest, 301);
  }

  return next();
}

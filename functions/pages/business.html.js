// Cloudflare Pages Function for /pages/business.html
//
// The business detail page is client rendered, so a crawler's first fetch would
// otherwise see the generic fallback <title>/meta. This function fetches the
// business by ?id from Supabase at the edge and injects the real <title>, meta
// tags, canonical link, and LocalBusiness JSON-LD into the static HTML shell
// before it is sent. The page's existing JS then re-sets the identical values
// for human visitors, so nothing about the browser experience changes.
//
// Field logic mirrors renderBusiness()/renderJsonLd() in pages/business.html.
// Only real data: every field is omitted when missing.

const SUPABASE_URL = 'https://kyneaettrynagavewefi.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk';

function to24h(s) {
  const m = (s || '').trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!m) return null;
  let h = parseInt(m[1], 10);
  const ap = m[3].toUpperCase();
  if (ap === 'PM' && h !== 12) h += 12;
  if (ap === 'AM' && h === 12) h = 0;
  return String(h).padStart(2, '0') + ':' + m[2];
}

function parseHoursRange(val) {
  const v = (val || '').trim();
  const low = v.toLowerCase();
  if (!v || low === 'closed' || low.includes('appointment')) return null;
  const parts = v.split(/\s+-\s+/);
  if (parts.length !== 2) return null;
  const opens = to24h(parts[0]);
  const closes = to24h(parts[1]);
  return (opens && closes) ? { opens, closes } : null;
}

function hoursToSpec(hours) {
  if (!hours || typeof hours !== 'object') return null;
  const dayMap = {
    monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday', sunday: 'Sunday'
  };
  const spec = [];
  Object.keys(dayMap).forEach(d => {
    const r = parseHoursRange(hours[d]);
    if (r) spec.push({ '@type': 'OpeningHoursSpecification', dayOfWeek: dayMap[d], opens: r.opens, closes: r.closes });
  });
  return spec.length ? spec : null;
}

function buildJsonLd(b, canonicalUrl) {
  const data = {
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    '@id': canonicalUrl,
    name: b.name,
    url: canonicalUrl
  };
  if (b.description) data.description = b.description.slice(0, 300);
  if (b.address || b.city || b.zip) {
    const addr = { '@type': 'PostalAddress', addressCountry: 'US' };
    if (b.address) addr.streetAddress = b.address;
    if (b.city) addr.addressLocality = b.city;
    if (b.state) addr.addressRegion = b.state;
    if (b.zip) addr.postalCode = b.zip;
    data.address = addr;
  }
  if (b.phone) data.telephone = b.phone;
  if (b.price_range) data.priceRange = b.price_range;
  const img = b.image_url || (b.photos && b.photos[0]);
  if (img) data.image = img;
  if (b.website) data.sameAs = [b.website];
  const spec = hoursToSpec(b.hours);
  if (spec) data.openingHoursSpecification = spec;
  if ((b.review_count || 0) > 0 && parseFloat(b.avg_rating) > 0) {
    data.aggregateRating = {
      '@type': 'AggregateRating',
      ratingValue: parseFloat(b.avg_rating).toFixed(1),
      reviewCount: b.review_count
    };
  }
  // Escape the closing-tag sequence so the JSON can sit safely inside <script>.
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

export async function onRequest(context) {
  const { request, next } = context;
  const url = new URL(request.url);
  const id = url.searchParams.get('id');

  // No id: serve the static shell untouched.
  if (!id) return next();

  let biz = null;
  try {
    const api = SUPABASE_URL + '/rest/v1/businesses_with_ratings?id=eq.' +
      encodeURIComponent(id) + '&is_active=eq.true&select=*';
    const r = await fetch(api, {
      headers: { apikey: SUPABASE_KEY, Authorization: 'Bearer ' + SUPABASE_KEY }
    });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows) && rows.length) biz = rows[0];
    }
  } catch (e) {
    // Network/parse failure: fall through and serve the static shell.
  }

  const response = await next();
  if (!biz) return response;

  const canonicalUrl = 'https://815local.com/pages/business.html?id=' + id;
  const title = biz.name + ', 815local';
  const desc = biz.description
    ? biz.description.slice(0, 160)
    : (biz.category + ' in the 815 area, find hours, reviews, and contact info on 815local.');
  const ogTitle = biz.name + ' | 815local';
  const img = biz.image_url || (biz.photos && biz.photos[0]) || null;
  const jsonLd = buildJsonLd(biz, canonicalUrl);

  const rewriter = new HTMLRewriter()
    .on('title', { element(el) { el.setInnerContent(title); } })
    .on('meta[name="description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('meta[property="og:title"]', { element(el) { el.setAttribute('content', ogTitle); } })
    .on('meta[property="og:description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('meta[property="og:url"]', { element(el) { el.setAttribute('content', canonicalUrl); } })
    .on('meta[name="twitter:title"]', { element(el) { el.setAttribute('content', ogTitle); } })
    .on('meta[name="twitter:description"]', { element(el) { el.setAttribute('content', desc); } })
    .on('link[rel="canonical"]', { element(el) { el.setAttribute('href', canonicalUrl); } });

  if (img) {
    rewriter
      .on('meta[property="og:image"]', { element(el) { el.setAttribute('content', img); } })
      .on('meta[name="twitter:image"]', { element(el) { el.setAttribute('content', img); } });
  }

  rewriter.on('head', {
    element(el) {
      el.append('\n<script type="application/ld+json" id="ld-business">' + jsonLd + '</script>\n', { html: true });
    }
  });

  const out = rewriter.transform(response);
  out.headers.set('Cache-Control', 'public, max-age=3600');
  return out;
}

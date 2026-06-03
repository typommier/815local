import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Allowlisted admin emails (comma-separated env var). Fail closed if unset.
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const JSON_CORS = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" };

// Reject unless the caller's bearer token belongs to an allowlisted admin.
// verify_jwt only proves the token is signed by the project (the anon key
// passes too), so the email allowlist is the real gate.
async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader || ADMIN_EMAILS.length === 0) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: JSON_CORS });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  const email = data?.user?.email?.toLowerCase();
  if (error || !email || !ADMIN_EMAILS.includes(email)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401, headers: JSON_CORS });
  }
  return null;
}

const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";
const FETCH_TIMEOUT_MS   = 20000;
const MAX_HTML_BYTES     = 5 * 1024 * 1024;
const DEFAULT_MAX_PHOTOS = 10;
const IMAGE_EXT_RE       = /\.(jpe?g|png|webp|gif)(?:$|[?#])/i;

const SKIP_PATTERNS: RegExp[] = [
  /favicon/i,
  /sprite/i,
  /\/icons?\//i,
  /\bicon-/i,
  /-icon[._-]/i,
  /_icon[._-]/i,
  /\bico\d/i,
  /pixel\.(gif|png|jpg|jpeg|webp)/i,
  /spacer\.(gif|png|jpg|jpeg|webp)/i,
  /blank\.(gif|png|jpg|jpeg|webp)/i,
  /1x1\.(gif|png|jpg|jpeg|webp)/i,
  /\/wp-content\/plugins\//i,
  /\/wp-content\/themes\//i,
  /\/wp-includes\//i,
  /dummy/i,
  /placeholder/i,
  /\/demo\//i,
  /\bdemo-/i,
  /testimonial/i,
  /\bavatars?\b/i,
  /\bbadges?\b/i,
];

// Hosts/host-patterns that are commonly used as image CDNs by site builders.
// Photos hosted on these are treated as if they were on the page's own domain.
const CDN_HOST_PATTERNS: RegExp[] = [
  /(^|\.)cdn\.shopify\.com$/i,
  /(^|\.)myshopify\.com$/i,
  /(^|\.)squarespace-cdn\.com$/i,
  /(^|\.)squarespace\.com$/i,
  /(^|\.)pixieset\.com$/i,
  /(^|\.)imgix\.net$/i,
  /(^|\.)cloudinary\.com$/i,
  /(^|\.)wixstatic\.com$/i,
  /(^|\.)wix\.com$/i,
  /(^|\.)amazonaws\.com$/i,
  /(^|\.)cloudfront\.net$/i,
  /(^|\.)googleusercontent\.com$/i,
  /(^|\.)fbcdn\.net$/i,
  /(^|\.)cdninstagram\.com$/i,
  /(^|\.)smugmug\.com$/i,
  /(^|\.)zenfolio\.com$/i,
  /(^|\.)mypixieset\.com$/i,
  /(^|\.)pixiesetdelivers\.com$/i,
  /(^|\.)pixiesetstatic\.com$/i,
  /(^|\.)photoshelter\.com$/i,
  /(^|\.)imagekit\.io$/i,
  /(^|\.)bunnycdn\.com$/i,
  /(^|\.)b-cdn\.net$/i,
  /(^|\.)akamaized\.net$/i,
  /(^|\.)fastly\.net$/i,
  /(^|\.)staticflickr\.com$/i,
];

function rootDomain(host: string): string {
  const parts = host.toLowerCase().split(".").filter(Boolean);
  if (parts.length <= 2) return parts.join(".");
  return parts.slice(-2).join(".");
}

function isCdnHost(host: string): boolean {
  const h = host.toLowerCase();
  return CDN_HOST_PATTERNS.some((p) => p.test(h));
}

// Result type: 0 = reject, 1 = accept (img tag, strict), 2 = accept (explicit hero / og:image)
function acceptUrl(url: string, baseRoot: string, opts: { explicitHero: boolean }): boolean {
  if (url.startsWith("data:")) return false;
  if (!/^https?:\/\//i.test(url)) return false;
  if (SKIP_PATTERNS.some((p) => p.test(url))) return false;
  let parsed: URL;
  try { parsed = new URL(url); } catch { return false; }
  if (!IMAGE_EXT_RE.test(parsed.pathname)) return false;

  // og:image / twitter:image / image_src: the site explicitly says this is the page's image. Accept from any host.
  if (opts.explicitHero) return true;

  // <img> tags: only accept if same root domain or a known image CDN.
  if (rootDomain(parsed.host) === baseRoot) return true;
  if (isCdnHost(parsed.host)) return true;
  return false;
}

function extractImageUrls(html: string, baseUrl: string): string[] {
  let baseRoot: string;
  try {
    baseRoot = rootDomain(new URL(baseUrl).host);
  } catch {
    return [];
  }

  const ordered: string[] = [];
  const seen = new Set<string>();
  const push = (raw: string | null | undefined, explicitHero: boolean) => {
    if (!raw) return;
    try {
      const abs = new URL(raw.trim(), baseUrl).toString();
      if (!acceptUrl(abs, baseRoot, { explicitHero })) return;
      if (seen.has(abs)) return;
      seen.add(abs);
      ordered.push(abs);
    } catch { /* ignore */ }
  };

  // og:image / twitter:image first so the hero photo is preferred.
  for (const m of html.matchAll(/<meta\b[^>]+>/gi)) {
    const tag = m[0];
    if (/\b(?:property|name)\s*=\s*["'](?:og:image(?::secure_url)?|twitter:image(?::src)?)["']/i.test(tag)) {
      const c = tag.match(/\bcontent\s*=\s*["']([^"']+)["']/i);
      if (c) push(c[1], true);
    }
  }

  for (const m of html.matchAll(/<link\b[^>]+\brel\s*=\s*["']image_src["'][^>]*>/gi)) {
    const h = m[0].match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (h) push(h[1], true);
  }

  for (const m of html.matchAll(/<img\b[^>]+>/gi)) {
    const tag     = m[0];
    const src     = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const dataSrc = tag.match(/\bdata-src\s*=\s*["']([^"']+)["']/i);
    const srcset  = tag.match(/\b(?:srcset|data-srcset)\s*=\s*["']([^"']+)["']/i);
    if (src)     push(src[1], false);
    if (dataSrc) push(dataSrc[1], false);
    if (srcset) {
      // srcset: "url 1x, url2 2x" or "url 320w, url2 640w" — pick the highest descriptor
      const parts = srcset[1].split(",").map((s) => s.trim()).filter(Boolean);
      for (const part of parts) {
        const u = part.split(/\s+/)[0];
        if (u) push(u, false);
      }
    }
  }

  return ordered;
}

async function fetchHtml(url: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: {
        "User-Agent": UA,
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.9",
      },
      redirect: "follow",
    });
    if (!res.ok || !res.body) return null;

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      total += value.byteLength;
      if (total > MAX_HTML_BYTES) { reader.cancel(); break; }
      chunks.push(value);
    }
    const buf = new Uint8Array(total);
    let off = 0;
    for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
    return new TextDecoder("utf-8", { fatal: false }).decode(buf);
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
      },
    });
  }
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ ok: false, error: "method not allowed" }), {
      status: 405,
      headers: JSON_CORS,
    });
  }

  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const body = await req.json();
    const businessId: string | undefined = body.business_id;
    const sourceUrl:  string | undefined = body.url;
    const maxPhotos = (typeof body.max_photos === "number" && body.max_photos > 0)
      ? Math.min(body.max_photos, 20) : DEFAULT_MAX_PHOTOS;

    if (!businessId || !sourceUrl) {
      return new Response(JSON.stringify({ ok: false, error: "business_id and url required" }), {
        status: 400,
        headers: JSON_CORS,
      });
    }

    const html = await fetchHtml(sourceUrl);
    if (!html) {
      return new Response(JSON.stringify({ ok: false, error: "failed to fetch source url" }), {
        status: 502,
        headers: JSON_CORS,
      });
    }

    const allUrls = extractImageUrls(html, sourceUrl);
    const picked  = allUrls.slice(0, maxPhotos);
    if (picked.length === 0) {
      return new Response(JSON.stringify({ ok: true, found: 0, staged: 0, photos: [] }), {
        headers: JSON_CORS,
      });
    }

    const imageUrl = picked[0];
    const { error: updateErr } = await supabase
      .from("businesses")
      .update({ image_url: imageUrl, photos: picked })
      .eq("id", businessId);

    if (updateErr) {
      return new Response(JSON.stringify({ ok: false, error: updateErr.message }), {
        status: 500,
        headers: JSON_CORS,
      });
    }

    let mirrorResult: unknown = null;
    try {
      const mr = await fetch(`${SUPABASE_URL}/functions/v1/mirror-photos`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${SERVICE_KEY}` },
        body: JSON.stringify({ business_id: businessId }),
      });
      mirrorResult = await mr.json().catch(() => ({ ok: false, error: "non-json response" }));
    } catch (e) {
      mirrorResult = { ok: false, error: String(e) };
    }

    return new Response(JSON.stringify({
      ok: true,
      business_id: businessId,
      source_url: sourceUrl,
      found: allUrls.length,
      staged: picked.length,
      photos: picked,
      mirror_result: mirrorResult,
    }, null, 2), {
      headers: JSON_CORS,
    });
  } catch (e) {
    return new Response(JSON.stringify({ ok: false, error: String(e) }), {
      status: 500,
      headers: JSON_CORS,
    });
  }
});

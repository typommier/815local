import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const BUCKET = "business-photos";
const STORAGE_HOST_MARKER = new URL(SUPABASE_URL).host;
const MAX_PER_RUN = 20;
const FETCH_TIMEOUT_MS = 15000;
const MAX_BYTES = 5 * 1024 * 1024;

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

// Internal-only function: invoked server-to-server by import-from-website and
// fetch-google-photos with the service-role key as a bearer token. Reject any
// caller that does not present that exact token. (Not browser-facing.)
function isInternalCaller(req: Request): boolean {
  return req.headers.get("Authorization") === `Bearer ${SERVICE_KEY}`;
}

function isExternal(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    return new URL(url).host !== STORAGE_HOST_MARKER;
  } catch {
    return false;
  }
}

async function sha1Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function extFromContentType(ct: string): string | null {
  const norm = (ct || "").split(";")[0].trim().toLowerCase();
  if (norm === "image/jpeg" || norm === "image/jpg") return "jpg";
  if (norm === "image/png") return "png";
  if (norm === "image/webp") return "webp";
  if (norm === "image/gif") return "gif";
  return null;
}

async function fetchImageBytes(url: string): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, { signal: ctrl.signal, redirect: "follow" });
    clearTimeout(t);
    if (!res.ok) return null;
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.toLowerCase().startsWith("image/")) return null;
    const lenHeader = res.headers.get("content-length");
    if (lenHeader && Number(lenHeader) > MAX_BYTES) return null;
    const buf = new Uint8Array(await res.arrayBuffer());
    if (buf.byteLength > MAX_BYTES) return null;
    return { bytes: buf, contentType };
  } catch {
    return null;
  }
}

async function mirrorOne(businessId: string, url: string): Promise<string | null> {
  const img = await fetchImageBytes(url);
  if (!img) return null;
  const ext = extFromContentType(img.contentType);
  if (!ext) return null;
  const hash = await sha1Hex(url);
  const path = `${businessId}/${hash}.${ext}`;
  const { error } = await supabase.storage.from(BUCKET).upload(path, img.bytes, {
    contentType: img.contentType,
    upsert: true,
  });
  if (error) return null;
  const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
  return data.publicUrl;
}

type Business = { id: string; image_url: string | null; photos: string[] | null };

async function processBusiness(b: Business): Promise<{ id: string; mirrored: number; kept: number; failed: number }> {
  let mirrored = 0,
    kept = 0,
    failed = 0;

  let newImageUrl = b.image_url;
  if (isExternal(b.image_url)) {
    const mapped = await mirrorOne(b.id, b.image_url!);
    if (mapped) {
      newImageUrl = mapped;
      mirrored++;
    } else {
      newImageUrl = null;
      failed++;
    }
  } else if (b.image_url) {
    kept++;
  }

  const newPhotos: string[] = [];
  for (const url of b.photos || []) {
    if (!isExternal(url)) {
      newPhotos.push(url);
      kept++;
      continue;
    }
    const mapped = await mirrorOne(b.id, url);
    if (mapped) {
      newPhotos.push(mapped);
      mirrored++;
    } else {
      failed++;
    }
  }

  if (!newImageUrl && newPhotos.length > 0) newImageUrl = newPhotos[0];

  if (mirrored > 0 || newImageUrl !== b.image_url) {
    await supabase.from("businesses").update({
      image_url: newImageUrl,
      photos: newPhotos,
    }).eq("id", b.id);
  }

  return { id: b.id, mirrored, kept, failed };
}

Deno.serve(async (req: Request) => {
  if (!isInternalCaller(req)) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let businessId: string | null = null;
  try {
    if (req.method === "POST") {
      const body = await req.json().catch(() => ({}));
      if (body && typeof body.business_id === "string") businessId = body.business_id;
    }
  } catch { /* ignore */ }

  let rows: Business[] | null = null;
  let error: { message: string } | null = null;

  if (businessId) {
    const r = await supabase
      .from("businesses")
      .select("id,image_url,photos")
      .eq("id", businessId);
    rows = r.data as Business[] | null;
    error = r.error;
  } else {
    // Use RPC-style raw SQL via the REST shim to get random ordering with LIMIT.
    // supabase-js doesn't expose ORDER BY random(); use a temporary view or just
    // call the PostgREST endpoint with ?order=random — not supported. Workaround:
    // fetch a wider pool (id only) ordered by created_at descending, then sample
    // client-side. This collides far less under parallel calls than the previous
    // fixed-order LIMIT 10.
    const r = await supabase
      .from("businesses")
      .select("id,image_url,photos")
      .not("image_url", "is", null)
      .not("image_url", "like", `%${STORAGE_HOST_MARKER}%`)
      .limit(120);
    if (r.error) {
      error = r.error;
    } else if (r.data) {
      // Shuffle and take MAX_PER_RUN
      const arr = (r.data as Business[]).slice();
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      rows = arr.slice(0, MAX_PER_RUN);
    }
  }

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const candidates = (rows || []).filter((b) => isExternal(b.image_url) || (b.photos || []).some(isExternal));
  const results: Array<{ id: string; mirrored: number; kept: number; failed: number }> = [];
  for (const b of candidates) {
    results.push(await processBusiness(b as Business));
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed: results.length,
      total_mirrored: results.reduce((s, r) => s + r.mirrored, 0),
      total_failed: results.reduce((s, r) => s + r.failed, 0),
      results,
    }),
    { headers: { "Content-Type": "application/json" } },
  );
});

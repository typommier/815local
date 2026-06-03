import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const PLACES_KEY   = Deno.env.get("GOOGLE_PLACES_API_KEY");

// Allowlisted admin emails (comma-separated env var). Fail closed if unset.
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const MAX_PHOTOS = 5;
const PHOTO_MAX_HEIGHT_PX = 1600;
const FETCH_TIMEOUT_MS = 15000;

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body, null, 2), {
    ...init,
    headers: { "Content-Type": "application/json", ...CORS, ...(init.headers || {}) },
  });
}

// Reject unless the caller's bearer token belongs to an allowlisted admin.
// verify_jwt only proves the token is signed by the project (the anon key
// passes too), so the email allowlist is the real gate.
async function requireAdmin(req: Request): Promise<Response | null> {
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader || ADMIN_EMAILS.length === 0) {
    return json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const { data, error } = await userClient.auth.getUser();
  const email = data?.user?.email?.toLowerCase();
  if (error || !email || !ADMIN_EMAILS.includes(email)) {
    return json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  return null;
}

async function fetchPlaceDetails(placeId: string): Promise<{ photos?: Array<{ name?: string }> } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      signal: ctrl.signal,
      headers: {
        "X-Goog-Api-Key": PLACES_KEY!,
        "X-Goog-FieldMask": "photos",
      },
    });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

async function resolvePhotoUri(resourceName: string): Promise<string | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const url = `https://places.googleapis.com/v1/${resourceName}/media?maxHeightPx=${PHOTO_MAX_HEIGHT_PX}&skipHttpRedirect=true`;
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "X-Goog-Api-Key": PLACES_KEY! },
    });
    if (!res.ok) return null;
    const data = await res.json();
    return typeof data.photoUri === "string" ? data.photoUri : null;
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

type ProcessResult = {
  ok: boolean;
  business_id: string;
  place_id: string;
  staged?: number;
  photos?: string[];
  skipped?: boolean;
  note?: string;
  error?: string;
  mirror_result?: unknown;
};

async function processOne(businessId: string, placeId: string, force: boolean): Promise<ProcessResult> {
  const { data: existing, error: readErr } = await supabase
    .from("businesses")
    .select("id, name, image_url, photos")
    .eq("id", businessId)
    .maybeSingle();

  if (readErr) return { ok: false, business_id: businessId, place_id: placeId, error: `read failed: ${readErr.message}` };
  if (!existing) return { ok: false, business_id: businessId, place_id: placeId, error: "business not found" };

  const hasPhotos = Array.isArray(existing.photos) && existing.photos.length > 0;
  if (hasPhotos && !force) {
    return {
      ok: true,
      business_id: businessId,
      place_id: placeId,
      skipped: true,
      note: "business already has photos; pass force=true to overwrite",
      photos: existing.photos as string[],
    };
  }

  const details = await fetchPlaceDetails(placeId);
  if (!details) return { ok: false, business_id: businessId, place_id: placeId, error: "places api fetch failed" };

  const resources = Array.isArray(details.photos) ? details.photos.slice(0, MAX_PHOTOS) : [];
  if (resources.length === 0) {
    return { ok: true, business_id: businessId, place_id: placeId, staged: 0, photos: [], note: "no photos returned by Google for this place" };
  }

  const urls: string[] = [];
  for (const r of resources) {
    if (typeof r.name !== "string") continue;
    const uri = await resolvePhotoUri(r.name);
    if (uri) urls.push(uri);
  }
  if (urls.length === 0) return { ok: false, business_id: businessId, place_id: placeId, error: "all photo URI resolves failed" };

  const { error: updErr } = await supabase
    .from("businesses")
    .update({
      photos: urls,
      image_url: urls[0],
      google_place_id: placeId,
    })
    .eq("id", businessId);
  if (updErr) return { ok: false, business_id: businessId, place_id: placeId, error: `db update failed: ${updErr.message}` };

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

  return {
    ok: true,
    business_id: businessId,
    place_id: placeId,
    staged: urls.length,
    photos: urls,
    mirror_result: mirrorResult,
  };
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, { status: 405 });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  if (!PLACES_KEY) return json({ ok: false, error: "GOOGLE_PLACES_API_KEY secret is not set on this Supabase project" }, { status: 503 });

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, { status: 400 }); }

  const force = body.force === true;
  const single = (typeof body.business_id === "string" && typeof body.place_id === "string")
    ? [{ business_id: body.business_id, place_id: body.place_id }]
    : [];
  const targets = Array.isArray(body.targets) ? body.targets : single;

  if (targets.length === 0) {
    return json({ ok: false, error: "must provide business_id+place_id OR targets:[{business_id, place_id}, ...]" }, { status: 400 });
  }

  const results: ProcessResult[] = [];
  for (const t of targets) {
    if (typeof t?.business_id !== "string" || typeof t?.place_id !== "string") {
      results.push({ ok: false, business_id: String(t?.business_id ?? ""), place_id: String(t?.place_id ?? ""), error: "invalid target entry" });
      continue;
    }
    results.push(await processOne(t.business_id, t.place_id, force));
  }

  return json({
    ok: results.every((r) => r.ok),
    processed: results.length,
    results,
  });
});

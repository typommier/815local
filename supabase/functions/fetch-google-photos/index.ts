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

// Resolve a Place ID from a business name + city via Places Text Search.
// Returns the first match (id, display name, formatted address) or null.
async function searchPlaceId(
  name: string,
  city: string,
): Promise<{ id: string; displayName: string; address: string } | null> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
      method: "POST",
      signal: ctrl.signal,
      headers: {
        "Content-Type": "application/json",
        "X-Goog-Api-Key": PLACES_KEY!,
        "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
      },
      body: JSON.stringify({ textQuery: name + ", " + (city || "") + ", IL" }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const p = Array.isArray(data.places) ? data.places[0] : null;
    if (!p || typeof p.id !== "string") return null;
    return { id: p.id, displayName: p.displayName?.text ?? "", address: p.formattedAddress ?? "" };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
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
  name?: string;
  staged?: number;
  photos?: string[];
  skipped?: boolean;
  note?: string;
  error?: string;
  mirror_result?: unknown;
  resolved?: boolean;
};

// Resolve the place id for a business if one was not supplied. Persists a newly
// resolved id so future runs (and the listing) keep it. Returns the id or null.
async function ensurePlaceId(
  businessId: string,
  placeId: string,
  name: string,
  city: string,
): Promise<{ placeId: string | null; resolved: boolean }> {
  if (placeId) return { placeId, resolved: false };
  const hit = await searchPlaceId(name, city);
  if (!hit) return { placeId: null, resolved: false };
  await supabase.from("businesses").update({ google_place_id: hit.id }).eq("id", businessId);
  return { placeId: hit.id, resolved: true };
}

async function processOne(businessId: string, placeId: string, force: boolean): Promise<ProcessResult> {
  const { data: existing, error: readErr } = await supabase
    .from("businesses")
    .select("id, name, city, image_url, photos, google_place_id")
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
      name: existing.name,
      skipped: true,
      note: "business already has photos; pass force=true to overwrite",
      photos: existing.photos as string[],
    };
  }

  // Auto-resolve the place id from name + city when one was not supplied.
  const effectivePlaceId = placeId || (existing.google_place_id as string | null) || "";
  const { placeId: resolvedId, resolved } = await ensurePlaceId(
    businessId, effectivePlaceId, existing.name as string, (existing.city as string) || "",
  );
  if (!resolvedId) {
    return { ok: false, business_id: businessId, place_id: "", name: existing.name, error: "no place match for name + city" };
  }

  const details = await fetchPlaceDetails(resolvedId);
  if (!details) return { ok: false, business_id: businessId, place_id: resolvedId, name: existing.name, resolved, error: "places api fetch failed" };

  const resources = Array.isArray(details.photos) ? details.photos.slice(0, MAX_PHOTOS) : [];
  if (resources.length === 0) {
    return { ok: true, business_id: businessId, place_id: resolvedId, name: existing.name, resolved, staged: 0, photos: [], note: "no photos returned by Google for this place" };
  }

  const urls: string[] = [];
  for (const r of resources) {
    if (typeof r.name !== "string") continue;
    const uri = await resolvePhotoUri(r.name);
    if (uri) urls.push(uri);
  }
  if (urls.length === 0) return { ok: false, business_id: businessId, place_id: resolvedId, name: existing.name, resolved, error: "all photo URI resolves failed" };

  const { error: updErr } = await supabase
    .from("businesses")
    .update({
      photos: urls,
      image_url: urls[0],
      google_place_id: resolvedId,
    })
    .eq("id", businessId);
  if (updErr) return { ok: false, business_id: businessId, place_id: resolvedId, name: existing.name, resolved, error: `db update failed: ${updErr.message}` };

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
    place_id: resolvedId,
    name: existing.name,
    resolved,
    staged: urls.length,
    photos: urls,
    mirror_result: mirrorResult,
  };
}

// All active businesses with an empty/null photos array.
async function photolessBusinesses(): Promise<Array<{ id: string; name: string; city: string | null; google_place_id: string | null; photos: string[] | null }>> {
  const { data, error } = await supabase
    .from("businesses")
    .select("id, name, city, google_place_id, photos")
    .eq("is_active", true)
    .order("city", { ascending: true });
  if (error) throw new Error(error.message);
  return (data || []).filter((b: { photos: string[] | null }) => !Array.isArray(b.photos) || b.photos.length === 0);
}

// Resolve a single business and report the match without writing photos.
// (The place id is still persisted if newly found, so the admin can confirm it.)
async function resolveReport(businessId: string) {
  const { data: b, error } = await supabase
    .from("businesses")
    .select("id, name, city, google_place_id")
    .eq("id", businessId)
    .maybeSingle();
  if (error || !b) return { business_id: businessId, error: error?.message || "not found" };

  let placeId = (b.google_place_id as string | null) || "";
  let resolvedName = "";
  let resolvedAddress = "";
  const hadPlaceId = !!placeId;
  if (!placeId) {
    const hit = await searchPlaceId(b.name as string, (b.city as string) || "");
    if (hit) {
      placeId = hit.id;
      resolvedName = hit.displayName;
      resolvedAddress = hit.address;
      await supabase.from("businesses").update({ google_place_id: hit.id }).eq("id", businessId);
    }
  }
  let photoCount = 0;
  if (placeId) {
    const details = await fetchPlaceDetails(placeId);
    photoCount = Array.isArray(details?.photos) ? details!.photos!.length : 0;
  }
  return {
    business_id: businessId,
    name: b.name,
    city: b.city,
    had_place_id: hadPlaceId,
    place_id: placeId || null,
    resolved_name: resolvedName || null,
    resolved_address: resolvedAddress || null,
    photo_count: photoCount,
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

  // Mode: resolve a single business and report the match (no photo write).
  if (body.resolve_only === true && typeof body.business_id === "string") {
    return json({ ok: true, mode: "resolve_only", result: await resolveReport(body.business_id) });
  }

  // Mode: fill all photoless businesses.
  if (body.fill_missing === true) {
    const targets = await photolessBusinesses();
    // Preview: resolve every photoless business and report, write nothing.
    if (body.dry_run === true) {
      const results = [];
      for (const b of targets) results.push(await resolveReport(b.id));
      return json({ ok: true, mode: "fill_missing_preview", count: results.length, results });
    }
    // Fill only the approved subset.
    const ids: string[] = Array.isArray(body.business_ids)
      ? body.business_ids.filter((x: unknown) => typeof x === "string")
      : [];
    if (ids.length === 0) return json({ ok: false, error: "fill_missing needs dry_run:true or business_ids:[...]" }, { status: 400 });
    const force = body.force === true;
    const results: ProcessResult[] = [];
    for (const id of ids) results.push(await processOne(id, "", force));
    return json({ ok: results.every((r) => r.ok), mode: "fill_missing", processed: results.length, results });
  }

  // Mode: targeted fill (place_id optional; auto-resolved when absent).
  const force = body.force === true;
  const single = (typeof body.business_id === "string")
    ? [{ business_id: body.business_id, place_id: typeof body.place_id === "string" ? body.place_id : "" }]
    : [];
  const targets = Array.isArray(body.targets) ? body.targets : single;

  if (targets.length === 0) {
    return json({ ok: false, error: "must provide business_id (place_id optional) OR targets:[...] OR fill_missing:true OR resolve_only" }, { status: 400 });
  }

  const results: ProcessResult[] = [];
  for (const t of targets) {
    if (typeof t?.business_id !== "string") {
      results.push({ ok: false, business_id: String(t?.business_id ?? ""), place_id: String(t?.place_id ?? ""), error: "invalid target entry" });
      continue;
    }
    results.push(await processOne(t.business_id, typeof t.place_id === "string" ? t.place_id : "", force));
  }

  return json({
    ok: results.every((r) => r.ok),
    processed: results.length,
    results,
  });
});

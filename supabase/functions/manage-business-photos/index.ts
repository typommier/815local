// Edge Function: manage-business-photos
//
// Handles photo uploads, deletions, and listing-field updates for a single
// business in one round trip. Called from /admin/edit-business-photos.html.
//
// Request body (JSON):
//   {
//     "business_id": "uuid",
//     "files": [{ "content_type": "image/jpeg", "base64": "..." }],   // optional
//     "delete_paths": ["business-id/abc123.jpg"],                       // optional
//     "set_image_url": "https://..." | "__upload_0__" | null,           // optional
//     "set_photos": ["https://...", "__upload_0__", ...],               // optional
//     "set_photo_positions": ["center", "top", ...]                     // optional
//   }
//
// "__upload_N__" tokens in set_image_url / set_photos are replaced with the
// public URL of the N-th uploaded file (after files[] is processed). This lets
// the caller send a single atomic request that uploads new files AND wires
// them into image_url / photos in the correct order, instead of doing it in
// two sequential calls.
//
// photo_positions are validated against a CSS background-position safelist;
// unknown values fall back to "center".

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "business-photos";
const MAX_BYTES = 5 * 1024 * 1024;

// Allowlisted admin emails (comma-separated env var). Fail closed if unset.
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const SAFE_POSITIONS = new Set([
  "center","top","bottom","left","right",
  "top left","top right","bottom left","bottom right",
  "left top","right top","left bottom","right bottom",
]);

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...CORS, ...(init.headers || {}) },
  });
}

function extFromCT(ct: string): string | null {
  const norm = (ct || "").split(";")[0].trim().toLowerCase();
  if (norm === "image/jpeg" || norm === "image/jpg") return "jpg";
  if (norm === "image/png") return "png";
  if (norm === "image/webp") return "webp";
  if (norm === "image/gif") return "gif";
  return null;
}

async function sha1Hex(bytes: Uint8Array): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-1", bytes);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, 16);
}

function b64ToBytes(b64: string): Uint8Array {
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function resolveTokens(value: unknown, uploaded: Array<{ public_url: string }>): unknown {
  if (typeof value === "string") {
    const m = value.match(/^__upload_(\d+)__$/);
    if (m) {
      const idx = parseInt(m[1], 10);
      return uploaded[idx]?.public_url ?? null;
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => resolveTokens(v, uploaded));
  return value;
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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, { status: 405 });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, { status: 400 }); }

  const businessId: string | undefined = body.business_id;
  const files: Array<{ content_type: string; base64: string }> = Array.isArray(body.files) ? body.files : [];
  const deletePaths: string[] = Array.isArray(body.delete_paths) ? body.delete_paths : [];

  if (!businessId) return json({ ok: false, error: "business_id required" }, { status: 400 });

  const uploaded: Array<{ path: string; public_url: string }> = [];
  const errors: string[] = [];

  for (const f of files) {
    const ext = extFromCT(f.content_type);
    if (!ext) { errors.push(`unsupported content_type ${f.content_type}`); continue; }
    let bytes: Uint8Array;
    try { bytes = b64ToBytes(f.base64); } catch (e) { errors.push(`base64 decode failed: ${String(e)}`); continue; }
    if (bytes.byteLength === 0) { errors.push("empty file"); continue; }
    if (bytes.byteLength > MAX_BYTES) { errors.push(`file too large: ${bytes.byteLength}`); continue; }
    const hash = await sha1Hex(bytes);
    const path = `${businessId}/${hash}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, bytes, { contentType: f.content_type.split(";")[0].trim(), upsert: true });
    if (upErr) { errors.push(`upload ${path}: ${upErr.message}`); continue; }
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(path);
    uploaded.push({ path, public_url: data.publicUrl });
  }

  const hasSetImageUrl = Object.prototype.hasOwnProperty.call(body, "set_image_url");
  const hasSetPhotos = Object.prototype.hasOwnProperty.call(body, "set_photos");
  const hasSetPhotoPositions = Object.prototype.hasOwnProperty.call(body, "set_photo_positions");

  let updated: any = null;
  if (hasSetImageUrl || hasSetPhotos || hasSetPhotoPositions) {
    const patch: Record<string, unknown> = {};
    if (hasSetImageUrl) {
      const v = resolveTokens(body.set_image_url, uploaded);
      patch.image_url = typeof v === "string" && v.length > 0 ? v : null;
    }
    if (hasSetPhotos) {
      const v = resolveTokens(body.set_photos, uploaded);
      patch.photos = Array.isArray(v) ? v.filter((u) => typeof u === "string" && (u as string).length > 0) : [];
    }
    if (hasSetPhotoPositions) {
      const v = body.set_photo_positions;
      patch.photo_positions = Array.isArray(v)
        ? v.map((p: unknown) => (typeof p === "string" && SAFE_POSITIONS.has(p)) ? p : "center")
        : [];
    }
    const { data, error: updErr } = await supabase
      .from("businesses")
      .update(patch)
      .eq("id", businessId)
      .select("id, name, image_url, photos, photo_positions")
      .single();
    if (updErr) errors.push(`db update: ${updErr.message}`);
    else updated = data;
  }

  const deleted: string[] = [];
  if (deletePaths.length > 0) {
    const { data, error: delErr } = await supabase.storage.from(BUCKET).remove(deletePaths);
    if (delErr) errors.push(`delete: ${delErr.message}`);
    else for (const d of (data || [])) deleted.push((d as any).name || "");
  }

  return json({
    ok: errors.length === 0,
    business_id: businessId,
    uploaded,
    deleted,
    updated,
    errors,
  });
});

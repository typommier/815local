// Edge Function: manage-media
//
// Backs the admin Media Inbox (/admin/media-inbox.html): one place to collect
// graphics that were sent to Ty (email/text/Facebook) or uploaded through the
// site, see them all, and later attach one to a business, event, or deal.
//
// All access goes through this function using the service role. The `media`
// table has RLS on with no policies, so the anon/authenticated keys can't read
// or write it directly. The real gate is the ADMIN_EMAILS allowlist, exactly
// like manage-business-photos, and it fails closed if the secret is unset.
//
// Request body (JSON), one of:
//   { "action": "list" }
//     -> { ok, media: [ ...rows ordered newest first ] }
//
//   { "action": "upload",
//     "source": "email" | "text" | "facebook" | "instagram" | "site" | "other",
//     "caption": "optional",
//     "files": [{ "content_type": "image/jpeg", "base64": "...",
//                 "source"?: "...", "caption"?: "..." }] }
//     -> { ok, media: [ ...inserted rows ], errors }
//
//   { "action": "update", "id": "uuid",
//     "patch": { caption?, source?, status?, business_id?, event_id?, deal_id? } }
//     -> { ok, media: row }
//
//   { "action": "delete", "id": "uuid" }
//     -> { ok, deleted: "uuid" }
//
//   { "action": "attach_deal", "id": "uuid", "deal_id": "uuid" }
//     -> { ok, media: row }   // sets deals.image_url to the media's public_url
//                             // and marks the media row assigned to that deal

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "media-inbox";
const MAX_BYTES = 8 * 1024 * 1024;

// Kept in sync with the CHECK constraints on public.media.
const SOURCES = new Set(["email", "text", "facebook", "instagram", "site", "other"]);
const STATUSES = new Set(["new", "assigned", "archived"]);

// Allowlisted admin emails (comma-separated env var). Fail closed if unset.
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

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

const MEDIA_COLS = "id, storage_path, public_url, source, caption, business_id, event_id, deal_id, status, created_at";

async function handleList(): Promise<Response> {
  const { data, error } = await supabase
    .from("media")
    .select(MEDIA_COLS)
    .order("created_at", { ascending: false });
  if (error) return json({ ok: false, error: error.message }, { status: 500 });
  return json({ ok: true, media: data ?? [] });
}

async function handleUpload(body: any): Promise<Response> {
  const files: Array<{ content_type: string; base64: string; source?: string; caption?: string }> =
    Array.isArray(body.files) ? body.files : [];
  if (files.length === 0) return json({ ok: false, error: "no files" }, { status: 400 });

  const batchSource = SOURCES.has(body.source) ? body.source : "other";
  const batchCaption = typeof body.caption === "string" && body.caption.trim() ? body.caption.trim() : null;

  const inserted: any[] = [];
  const errors: string[] = [];

  for (const f of files) {
    const ext = extFromCT(f.content_type);
    if (!ext) { errors.push(`unsupported content_type ${f.content_type}`); continue; }
    let bytes: Uint8Array;
    try { bytes = b64ToBytes(f.base64); } catch (e) { errors.push(`base64 decode failed: ${String(e)}`); continue; }
    if (bytes.byteLength === 0) { errors.push("empty file"); continue; }
    if (bytes.byteLength > MAX_BYTES) { errors.push(`file too large: ${bytes.byteLength}`); continue; }

    const hash = await sha1Hex(bytes);
    const path = `inbox/${hash}.${ext}`;
    const { error: upErr } = await supabase.storage.from(BUCKET)
      .upload(path, bytes, { contentType: f.content_type.split(";")[0].trim(), upsert: true });
    if (upErr) { errors.push(`upload ${path}: ${upErr.message}`); continue; }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);

    const source = SOURCES.has(f.source ?? "") ? f.source : batchSource;
    const caption = typeof f.caption === "string" && f.caption.trim() ? f.caption.trim() : batchCaption;

    const { data: row, error: insErr } = await supabase
      .from("media")
      .insert({ storage_path: path, public_url: pub.publicUrl, source, caption, status: "new" })
      .select(MEDIA_COLS)
      .single();
    if (insErr) { errors.push(`db insert ${path}: ${insErr.message}`); continue; }
    inserted.push(row);
  }

  return json({ ok: errors.length === 0, media: inserted, errors });
}

async function handleUpdate(body: any): Promise<Response> {
  const id: string | undefined = body.id;
  if (!id) return json({ ok: false, error: "id required" }, { status: 400 });
  const p = body.patch ?? {};
  const patch: Record<string, unknown> = {};

  if (Object.prototype.hasOwnProperty.call(p, "caption")) {
    patch.caption = typeof p.caption === "string" && p.caption.trim() ? p.caption.trim() : null;
  }
  if (Object.prototype.hasOwnProperty.call(p, "source")) {
    if (!SOURCES.has(p.source)) return json({ ok: false, error: "invalid source" }, { status: 400 });
    patch.source = p.source;
  }
  if (Object.prototype.hasOwnProperty.call(p, "status")) {
    if (!STATUSES.has(p.status)) return json({ ok: false, error: "invalid status" }, { status: 400 });
    patch.status = p.status;
  }
  for (const k of ["business_id", "event_id", "deal_id"]) {
    if (Object.prototype.hasOwnProperty.call(p, k)) {
      const v = p[k];
      patch[k] = typeof v === "string" && v.length > 0 ? v : null;
    }
  }
  // If a listing was attached and the caller didn't set status explicitly,
  // mark it assigned so the inbox can separate triaged from untouched.
  if (!Object.prototype.hasOwnProperty.call(patch, "status")) {
    const linked = ["business_id", "event_id", "deal_id"].some(
      (k) => Object.prototype.hasOwnProperty.call(patch, k) && patch[k],
    );
    if (linked) patch.status = "assigned";
  }
  if (Object.keys(patch).length === 0) return json({ ok: false, error: "nothing to update" }, { status: 400 });

  const { data, error } = await supabase
    .from("media").update(patch).eq("id", id).select(MEDIA_COLS).single();
  if (error) return json({ ok: false, error: error.message }, { status: 500 });
  return json({ ok: true, media: data });
}

async function handleDelete(body: any): Promise<Response> {
  const id: string | undefined = body.id;
  if (!id) return json({ ok: false, error: "id required" }, { status: 400 });

  const { data: row, error: selErr } = await supabase
    .from("media").select("id, storage_path").eq("id", id).single();
  if (selErr) return json({ ok: false, error: selErr.message }, { status: 404 });

  // Remove the object only if no other row still points at it (identical images
  // dedupe to one storage path via the content hash).
  const { count } = await supabase
    .from("media").select("id", { count: "exact", head: true }).eq("storage_path", row.storage_path);
  if ((count ?? 0) <= 1) {
    await supabase.storage.from(BUCKET).remove([row.storage_path]);
  }
  const { error: delErr } = await supabase.from("media").delete().eq("id", id);
  if (delErr) return json({ ok: false, error: delErr.message }, { status: 500 });
  return json({ ok: true, deleted: id });
}

// Point a deal's image at an inbox image. The deals table can't be updated with
// the anon key, so this runs through the service role here.
async function handleAttachDeal(body: any): Promise<Response> {
  const id: string | undefined = body.id;
  const dealId: string | undefined = body.deal_id;
  if (!id) return json({ ok: false, error: "id required" }, { status: 400 });
  if (!dealId) return json({ ok: false, error: "deal_id required" }, { status: 400 });

  const { data: media, error: selErr } = await supabase
    .from("media").select("id, public_url").eq("id", id).single();
  if (selErr) return json({ ok: false, error: selErr.message }, { status: 404 });

  const { error: dealErr } = await supabase
    .from("deals").update({ image_url: media.public_url }).eq("id", dealId);
  if (dealErr) return json({ ok: false, error: dealErr.message }, { status: 500 });

  const { data: row, error: updErr } = await supabase
    .from("media").update({ deal_id: dealId, status: "assigned" }).eq("id", id).select(MEDIA_COLS).single();
  if (updErr) return json({ ok: false, error: updErr.message }, { status: 500 });

  return json({ ok: true, media: row });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, { status: 405 });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: any;
  try { body = await req.json(); } catch { return json({ ok: false, error: "invalid json" }, { status: 400 }); }

  switch (body.action) {
    case "list": return await handleList();
    case "upload": return await handleUpload(body);
    case "update": return await handleUpdate(body);
    case "delete": return await handleDelete(body);
    case "attach_deal": return await handleAttachDeal(body);
    default: return json({ ok: false, error: "unknown action" }, { status: 400 });
  }
});

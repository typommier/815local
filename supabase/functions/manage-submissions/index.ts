// Edge Function: manage-submissions
//
// Backs the admin submissions review hub (/admin/review-submissions.html):
// list, approve, or reject the pending deals and events sitting in the
// is_active = false queue.
//
// This must be a server-side function: the deals and events tables let the
// anon key read only is_active = true rows and never update them, so pending
// items can't be listed or approved from the browser. All access runs through
// the service role here, gated on the ADMIN_EMAILS allowlist (fails closed),
// the same model as manage-business-photos and manage-media.
//
// Request body (JSON), one of:
//   { "action": "list" }
//     -> { ok, deals: [ ...pending ], events: [ ...pending ] }
//   { "action": "approve", "type": "deal" | "event", "id": "uuid" }
//     -> { ok, type, id }                 // sets is_active = true
//   { "action": "reject",  "type": "deal" | "event", "id": "uuid" }
//     -> { ok, type, id }                 // deletes the row

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TABLE = { deal: "deals", event: "events" } as const;
type Kind = keyof typeof TABLE;

const DEAL_COLS = "id, business_id, business_name, category, title, description, discount, expiry_date, terms, contact_name, contact_email, contact_phone, created_at";
const EVENT_COLS = "id, business_id, title, description, event_type, event_date, start_time, end_time, location_name, address, city, organizer, url, price, created_at";

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

async function handleList(): Promise<Response> {
  const [deals, events] = await Promise.all([
    supabase.from("deals").select(DEAL_COLS).eq("is_active", false).order("created_at", { ascending: true }),
    supabase.from("events").select(EVENT_COLS).eq("is_active", false).order("created_at", { ascending: true }),
  ]);
  if (deals.error) return json({ ok: false, error: deals.error.message }, { status: 500 });
  if (events.error) return json({ ok: false, error: events.error.message }, { status: 500 });
  return json({ ok: true, deals: deals.data ?? [], events: events.data ?? [] });
}

function resolveKind(type: unknown): Kind | null {
  return (type === "deal" || type === "event") ? type : null;
}

async function handleApprove(body: any): Promise<Response> {
  const kind = resolveKind(body.type);
  const id: string | undefined = body.id;
  if (!kind) return json({ ok: false, error: "invalid type" }, { status: 400 });
  if (!id) return json({ ok: false, error: "id required" }, { status: 400 });
  const { error } = await supabase.from(TABLE[kind]).update({ is_active: true }).eq("id", id);
  if (error) return json({ ok: false, error: error.message }, { status: 500 });
  return json({ ok: true, type: kind, id });
}

async function handleReject(body: any): Promise<Response> {
  const kind = resolveKind(body.type);
  const id: string | undefined = body.id;
  if (!kind) return json({ ok: false, error: "invalid type" }, { status: 400 });
  if (!id) return json({ ok: false, error: "id required" }, { status: 400 });
  const { error } = await supabase.from(TABLE[kind]).delete().eq("id", id);
  if (error) return json({ ok: false, error: error.message }, { status: 500 });
  return json({ ok: true, type: kind, id });
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
    case "approve": return await handleApprove(body);
    case "reject": return await handleReject(body);
    default: return json({ ok: false, error: "unknown action" }, { status: 400 });
  }
});

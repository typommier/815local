// Edge Function: manage-submissions
// CORS locked to 815local.com. Deploy to take effect.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

const supabase = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

const TABLE = { deal: "deals", event: "events", business: "businesses" } as const;
type Kind = keyof typeof TABLE;

const DEAL_COLS = "id, business_id, business_name, category, title, description, discount, expiry_date, terms, contact_name, contact_email, contact_phone, created_at";
const EVENT_COLS = "id, business_id, title, description, event_type, event_date, start_time, end_time, location_name, address, city, organizer, url, price, created_at";

const ALLOWED_ORIGINS = new Set([
  "https://815local.com",
  "https://www.815local.com",
]);
function corsHeaders(req: Request): Record<string, string> {
  const origin = req.headers.get("origin") || "";
  const allow = ALLOWED_ORIGINS.has(origin) ? origin : "https://815local.com";
  return {
    "Access-Control-Allow-Origin": allow,
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
  };
}
const CORS = corsHeaders(new Request("https://815local.com"));

function json(body: unknown, init: ResponseInit = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: { "Content-Type": "application/json", ...CORS, ...(init.headers || {}) },
  });
}

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
  return (type === "deal" || type === "event" || type === "business") ? type : null;
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
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
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

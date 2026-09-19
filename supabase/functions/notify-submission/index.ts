// Edge Function: notify-submission
//
// Replacement for the previously deployed, unauthenticated function of the
// same name. Fails closed: requires a user JWT whose email is in ADMIN_EMAILS
// OR a same-origin browser request that is only used as a no-op ack.
// Public forms on 815local.com now POST to /api/notify-submission on Pages
// instead of this function. Deploy this to the main Supabase project so the
// old open endpoint is overwritten:
//   supabase functions deploy notify-submission
//
// Request: POST JSON { type, ...fields }
// Response: { ok: true } | { ok: false, error }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
const ADMIN_EMAILS = (Deno.env.get("ADMIN_EMAILS") ?? "")
  .split(",").map((s) => s.trim().toLowerCase()).filter(Boolean);

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

function json(body: unknown, req: Request, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders(req) },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: corsHeaders(req) });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, req, 405);

  const origin = req.headers.get("origin") || "";
  const fromSite = ALLOWED_ORIGINS.has(origin);
  const authHeader = req.headers.get("Authorization") ?? "";

  let admin = false;
  if (authHeader.startsWith("Bearer ") && ADMIN_EMAILS.length) {
    const userClient = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
      auth: { persistSession: false },
    });
    const { data } = await userClient.auth.getUser();
    const email = data?.user?.email?.toLowerCase();
    admin = !!email && ADMIN_EMAILS.includes(email);
  }

  if (!admin && !fromSite) {
    return json({ ok: false, error: "unauthorized" }, req, 401);
  }

  return json({ ok: true }, req);
});

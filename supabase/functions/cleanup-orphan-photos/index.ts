import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY  = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY     = Deno.env.get("SUPABASE_ANON_KEY")!;
const BUCKET = "business-photos";

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
    if (!businessId) {
      return new Response(JSON.stringify({ ok: false, error: "business_id required" }), {
        status: 400,
        headers: JSON_CORS,
      });
    }

    const { data: biz, error: bizErr } = await supabase
      .from("businesses")
      .select("image_url, photos")
      .eq("id", businessId)
      .single();
    if (bizErr) {
      return new Response(JSON.stringify({ ok: false, error: bizErr.message }), {
        status: 500,
        headers: JSON_CORS,
      });
    }

    const referenced = new Set<string>();
    const prefix = `/storage/v1/object/public/${BUCKET}/`;
    const collect = (u: string | null | undefined) => {
      if (!u) return;
      try {
        const p = new URL(u);
        if (p.pathname.startsWith(prefix)) referenced.add(p.pathname.slice(prefix.length));
      } catch { /* ignore */ }
    };
    collect(biz?.image_url ?? null);
    for (const p of biz?.photos ?? []) collect(p);

    const { data: objects, error: listErr } = await supabase.storage
      .from(BUCKET)
      .list(businessId, { limit: 1000 });
    if (listErr) {
      return new Response(JSON.stringify({ ok: false, error: listErr.message }), {
        status: 500,
        headers: JSON_CORS,
      });
    }

    const orphans: string[] = [];
    for (const obj of objects ?? []) {
      const name = `${businessId}/${obj.name}`;
      if (!referenced.has(name)) orphans.push(name);
    }

    if (orphans.length === 0) {
      return new Response(JSON.stringify({
        ok: true,
        business_id: businessId,
        referenced: referenced.size,
        total_objects: objects?.length ?? 0,
        deleted: 0,
      }), { headers: JSON_CORS });
    }

    const { data: removed, error: rmErr } = await supabase.storage.from(BUCKET).remove(orphans);
    if (rmErr) {
      return new Response(JSON.stringify({ ok: false, error: rmErr.message }), {
        status: 500,
        headers: JSON_CORS,
      });
    }

    return new Response(JSON.stringify({
      ok: true,
      business_id: businessId,
      referenced: referenced.size,
      total_objects: objects?.length ?? 0,
      deleted: removed?.length ?? orphans.length,
      removed: (removed ?? []).map((r: { name: string }) => r.name),
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

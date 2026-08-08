// Edge Function: admin-dashboard
//
// Backs the admin command center (/admin/dashboard.html). One admin-gated call
// returns a single JSON snapshot of everything worth watching about the site:
//   - the onboarding / action queue (pending business submissions, claim
//     requests, studio inquiries, advertise waitlist, pending events + deals,
//     flagged reviews)
//   - directory health (active count, by-town breakdown, missing photos /
//     phones / websites)
//   - recently added businesses
//   - newsletter + review counts
//   - external integrations (Facebook, Cloudflare, Resend), each of which is
//     OFF until its secret is set, then lights up automatically
//
// Why server-side: almost none of this is readable with the anon key. Pending
// rows (is_active = false), claim_requests, studio_inquiries, advertise_waitlist
// and flagged reviews are all behind RLS, and the external API keys must never
// reach the browser. Everything runs through the service role here, gated on the
// ADMIN_EMAILS allowlist (fails closed) exactly like manage-submissions and
// manage-business-photos.
//
// Request body (JSON):
//   { "action": "summary" }   ->   { ok, generated_at, counts, towns, queue,
//                                     recent_businesses, integrations }
//
// Integration secrets (all optional; set in Supabase dashboard -> this function
// -> Manage secrets, then the matching panel goes live on the next load):
//   FACEBOOK_PAGE_ID, FACEBOOK_PAGE_TOKEN
//   CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_ZONE_ID,
//     CLOUDFLARE_PAGES_PROJECT
//   RESEND_API_KEY

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchWithTimeout(url: string, opts: RequestInit = {}, ms = 8000): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetch(url, { ...opts, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

const isBlank = (v: unknown) => v == null || String(v).trim() === "";
const hasPhotos = (p: unknown) => Array.isArray(p) && p.filter((u) => !isBlank(u)).length > 0;

// A claim / inquiry is "open" (needs Ty) unless it's been explicitly resolved.
const OPEN_STATUSES = new Set(["", "pending", "new", "open", "unread", "received"]);
const isOpen = (status: unknown) =>
  isBlank(status) || OPEN_STATUSES.has(String(status).trim().toLowerCase());

const todayStr = () => new Date().toISOString().slice(0, 10);

// ---------------------------------------------------------------------------
// Core site summary (all from our own DB)
// ---------------------------------------------------------------------------

async function siteSummary() {
  const today = todayStr();

  const [
    biz, pendingEvents, upcomingEvents, pendingDeals, activeDeals,
    claims, studio, advertise, flagged, subsTotal, subsActive,
  ] = await Promise.all([
    supabase.from("businesses")
      .select("id,name,category,city,phone,website,photos,is_active,is_locally_owned,created_at"),
    supabase.from("events")
      .select("id,title,event_date,city,created_at").eq("is_active", false)
      .order("created_at", { ascending: true }),
    supabase.from("events")
      .select("id", { count: "exact", head: true }).eq("is_active", true).gte("event_date", today),
    supabase.from("deals")
      .select("id,title,business_name,expiry_date,created_at").eq("is_active", false)
      .order("created_at", { ascending: true }),
    supabase.from("deals")
      .select("id", { count: "exact", head: true }).eq("is_active", true),
    supabase.from("claim_requests")
      .select("id,business_id,business_name,claimant_name,role,email,phone,status,created_at")
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("studio_inquiries")
      .select("id,business_name,contact_name,email,phone,goal,budget_range,timeline,status,created_at")
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("advertise_waitlist")
      .select("id,name,business,email,phone,message,created_at")
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("reviews")
      .select("id,business_id,reviewer_name,rating,flag_reason,created_at").eq("is_flagged", true)
      .order("created_at", { ascending: false }).limit(30),
    supabase.from("newsletter_subscribers")
      .select("email", { count: "exact", head: true }),
    supabase.from("newsletter_subscribers")
      .select("email", { count: "exact", head: true }).is("unsubscribed_at", null),
  ]);

  const rows = biz.data ?? [];
  const active = rows.filter((b: any) => b.is_active);
  const pendingBiz = rows.filter((b: any) => b.is_active === false)
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)));

  // Active businesses grouped by town (display name = first-seen casing).
  const townMap = new Map<string, { city: string; count: number }>();
  for (const b of active) {
    const raw = (b.city || "").trim();
    if (!raw) continue;
    const key = raw.toLowerCase();
    const entry = townMap.get(key);
    if (entry) entry.count += 1;
    else townMap.set(key, { city: raw, count: 1 });
  }
  const towns = Array.from(townMap.values()).sort((a, b) => b.count - a.count);

  const missing_photos = active.filter((b: any) => !hasPhotos(b.photos)).length;
  const missing_phone = active.filter((b: any) => isBlank(b.phone)).length;
  const missing_website = active.filter((b: any) => isBlank(b.website)).length;

  const recent_businesses = [...rows]
    .sort((a: any, b: any) => String(b.created_at).localeCompare(String(a.created_at)))
    .slice(0, 8)
    .map((b: any) => ({
      id: b.id, name: b.name, category: b.category, city: b.city,
      is_active: b.is_active, is_locally_owned: b.is_locally_owned, created_at: b.created_at,
    }));

  const claimList = (claims.data ?? []).map((c: any) => ({ ...c, open: isOpen(c.status) }));
  const studioList = (studio.data ?? []).map((s: any) => ({ ...s, open: isOpen(s.status) }));

  const openClaims = claimList.filter((c: any) => c.open).length;
  const openStudio = studioList.filter((s: any) => s.open).length;

  const counts: Record<string, number> = {
    active_businesses: active.length,
    pending_businesses: pendingBiz.length,
    pending_events: (pendingEvents.data ?? []).length,
    pending_deals: (pendingDeals.data ?? []).length,
    open_claims: openClaims,
    open_studio_inquiries: openStudio,
    advertise_waitlist: (advertise.data ?? []).length,
    flagged_reviews: (flagged.data ?? []).length,
    upcoming_events: upcomingEvents.count ?? 0,
    active_deals: activeDeals.count ?? 0,
    newsletter_subs: subsTotal.count ?? 0,
    newsletter_active: subsActive.count ?? 0,
    missing_photos,
    missing_phone,
    missing_website,
  };

  // The count of distinct things that genuinely need Ty right now.
  counts.action_total = counts.pending_businesses + counts.pending_events +
    counts.pending_deals + counts.open_claims + counts.open_studio_inquiries +
    counts.advertise_waitlist + counts.flagged_reviews;

  return {
    counts,
    towns,
    queue: {
      pending_businesses: pendingBiz.map((b: any) => ({
        id: b.id, name: b.name, category: b.category, city: b.city, created_at: b.created_at,
      })),
      claims: claimList,
      studio_inquiries: studioList,
      advertise: advertise.data ?? [],
      pending_events: pendingEvents.data ?? [],
      pending_deals: pendingDeals.data ?? [],
      flagged_reviews: flagged.data ?? [],
    },
    recent_businesses,
  };
}

// ---------------------------------------------------------------------------
// Integrations. Each returns { connected:false } when its secret is unset, so
// the panel shows a "connect this" state instead of a fake number. Any failure
// is caught and reported without breaking the rest of the dashboard.
// ---------------------------------------------------------------------------

async function facebookSummary() {
  const token = Deno.env.get("FACEBOOK_PAGE_TOKEN");
  const pageId = Deno.env.get("FACEBOOK_PAGE_ID");
  if (!token || !pageId) return { connected: false };
  const base = "https://graph.facebook.com/v21.0";
  const out: Record<string, unknown> = { connected: true };
  try {
    const cRes = await fetchWithTimeout(
      `${base}/${pageId}/conversations?fields=id,snippet,updated_time,unread_count,link,participants&limit=8&access_token=${token}`,
    );
    const c = await cRes.json();
    if (c.error) return { connected: true, error: c.error.message };
    const convos = (c.data ?? []).map((x: any) => ({
      id: x.id,
      snippet: x.snippet ?? "",
      updated_time: x.updated_time,
      unread_count: x.unread_count ?? 0,
      link: x.link ?? null,
      name: x.participants?.data?.find((p: any) => p.id !== pageId)?.name ?? "Facebook user",
    }));
    out.conversations = convos;
    out.unread_total = convos.reduce((n: number, x: any) => n + (x.unread_count || 0), 0);
  } catch (e) {
    out.conversations_error = String(e);
  }
  try {
    const fRes = await fetchWithTimeout(
      `${base}/${pageId}/feed?fields=id,message,permalink_url,created_time,comments.limit(4).order(reverse_chronological){from,message,created_time}&limit=6&access_token=${token}`,
    );
    const f = await fRes.json();
    if (!f.error) {
      const comments: any[] = [];
      for (const post of f.data ?? []) {
        for (const cm of post.comments?.data ?? []) {
          comments.push({
            from: cm.from?.name ?? "Someone",
            message: cm.message ?? "",
            created_time: cm.created_time,
            post_url: post.permalink_url ?? null,
          });
        }
      }
      comments.sort((a, b) => String(b.created_time).localeCompare(String(a.created_time)));
      out.comments = comments.slice(0, 8);
    }
  } catch (e) {
    out.comments_error = String(e);
  }
  return out;
}

async function cloudflareSummary() {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  if (!token) return { connected: false };
  const account = Deno.env.get("CLOUDFLARE_ACCOUNT_ID");
  const zone = Deno.env.get("CLOUDFLARE_ZONE_ID");
  const project = Deno.env.get("CLOUDFLARE_PAGES_PROJECT");
  const headers = { Authorization: `Bearer ${token}` };
  const out: Record<string, unknown> = { connected: true };

  // Latest Cloudflare Pages deployment (build health).
  if (account && project) {
    try {
      const r = await fetchWithTimeout(
        `https://api.cloudflare.com/client/v4/accounts/${account}/pages/projects/${project}/deployments?per_page=1`,
        { headers },
      );
      const j = await r.json();
      const d = j.result?.[0];
      if (d) {
        out.deploy = {
          status: d.latest_stage?.status ?? null,
          stage: d.latest_stage?.name ?? null,
          created_on: d.created_on ?? null,
          environment: d.environment ?? null,
          url: d.url ?? null,
          commit: d.deployment_trigger?.metadata?.commit_message ?? null,
        };
      }
    } catch (e) {
      out.deploy_error = String(e);
    }
  }

  // Last 7 days of traffic via the GraphQL analytics API.
  if (zone) {
    try {
      const since = new Date(Date.now() - 7 * 864e5).toISOString().slice(0, 10);
      const query = `query { viewer { zones(filter: { zoneTag: "${zone}" }) {
        httpRequests1dGroups(limit: 7, orderBy: [date_DESC],
          filter: { date_geq: "${since}" }) {
          dimensions { date }
          sum { requests pageViews bytes threats }
          uniq { uniques }
        } } } }`;
      const r = await fetchWithTimeout("https://api.cloudflare.com/client/v4/graphql", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({ query }),
      });
      const j = await r.json();
      const groups = j.data?.viewer?.zones?.[0]?.httpRequests1dGroups ?? [];
      if (groups.length) {
        let requests = 0, pageViews = 0, bytes = 0, threats = 0, uniques = 0;
        const daily = groups.map((g: any) => {
          requests += g.sum?.requests ?? 0;
          pageViews += g.sum?.pageViews ?? 0;
          bytes += g.sum?.bytes ?? 0;
          threats += g.sum?.threats ?? 0;
          uniques += g.uniq?.uniques ?? 0;
          return { date: g.dimensions?.date, requests: g.sum?.requests ?? 0, uniques: g.uniq?.uniques ?? 0 };
        });
        out.traffic_7d = { requests, pageViews, bytes, threats, uniques, daily };
      } else if (j.errors?.length) {
        out.traffic_error = j.errors[0]?.message ?? "analytics unavailable";
      }
    } catch (e) {
      out.traffic_error = String(e);
    }
  }
  return out;
}

async function resendSummary() {
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { connected: false };
  const headers = { Authorization: `Bearer ${key}` };
  const out: Record<string, unknown> = { connected: true };
  try {
    const r = await fetchWithTimeout("https://api.resend.com/broadcasts", { headers });
    const j = await r.json();
    const list = Array.isArray(j.data) ? j.data : (j.data?.data ?? []);
    out.broadcasts = list.slice(0, 6).map((b: any) => ({
      id: b.id, name: b.name ?? null, status: b.status ?? null,
      created_at: b.created_at ?? null, sent_at: b.sent_at ?? null,
    }));
  } catch (e) {
    out.broadcasts_error = String(e);
  }
  try {
    const r = await fetchWithTimeout("https://api.resend.com/domains", { headers });
    const j = await r.json();
    const list = Array.isArray(j.data) ? j.data : (j.data?.data ?? []);
    out.domains = list.map((d: any) => ({ name: d.name, status: d.status, region: d.region ?? null }));
  } catch (e) {
    out.domains_error = String(e);
  }
  return out;
}

// ---------------------------------------------------------------------------

async function handleSummary(): Promise<Response> {
  const [site, facebook, cloudflare, resend] = await Promise.all([
    siteSummary(),
    facebookSummary().catch((e) => ({ connected: true, error: String(e) })),
    cloudflareSummary().catch((e) => ({ connected: true, error: String(e) })),
    resendSummary().catch((e) => ({ connected: true, error: String(e) })),
  ]);

  return json({
    ok: true,
    generated_at: new Date().toISOString(),
    ...site,
    integrations: { facebook, cloudflare, resend },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { status: 204, headers: CORS });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, { status: 405 });

  const denied = await requireAdmin(req);
  if (denied) return denied;

  let body: any = {};
  try { body = await req.json(); } catch { /* default to summary */ }

  switch (body.action ?? "summary") {
    case "summary": return await handleSummary();
    default: return json({ ok: false, error: "unknown action" }, { status: 400 });
  }
});

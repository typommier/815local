// Edge Function: chat (Scout, 815local Concierge)
//
// Deploy target: the SEPARATE "815local-concierge" Supabase project
// (ref ubcagczbnxfpoligmsqq), not the main site's kyneaettrynagavewefi
// project. Committing this file does NOT deploy it, there is no CI wiring
// this repo to that project. Deploy manually (e.g. via the Supabase MCP
// deploy_edge_function tool, or `supabase functions deploy chat` with the
// concierge project linked) whenever this file changes.
//
// This file is the impure shell only: serving, the `listings` fetch, per-IP
// rate limiting, the unmet_requests insert, and the Anthropic call. All of the
// decision logic (tokenizing, matching, named lookup, hours formatting, the
// branch tree) lives in ./logic.ts, which is runtime-agnostic and unit-tested
// offline (tests/concierge/logic.test.ts). Keep behavior changes in logic.ts so
// the tests cover them.
//
// Answers visitor questions from the real `listings` table only. Direct lookups
// (hours/phone for a named business, or for a business already established
// earlier in the conversation) answer straight from the DB with no AI call.
// Open-ended questions narrow candidates by keyword/tag match, then (if
// ANTHROPIC_API_KEY is configured) ask Claude to pick from that candidate list
// only, never inventing a business or detail.
//
// Request body: { "message": "...", "history"?: [{role, content}, ...],
//                 "lastCandidates"?: [{name}, ...] }
// Response body: { "reply": "...", "candidates": [{name, area, url, phone}, ...] }
//
// `url` links back to the business's real page (via `listings.business_id`) and
// `phone` is the business's real number. Both are structured fields the widget
// renders itself, never something Claude writes into its own reply text: Claude
// once retyped a real phone number incorrectly in a later turn, so the system
// prompt forbids Claude from stating phone numbers at all.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

import {
  route,
  sanitizeHistory,
  fallbackReply,
  type HistoryTurn,
  type Listing,
} from "./logic.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CHAT_MODEL = "claude-haiku-4-5-20251001";

const ANTHROPIC_TIMEOUT_MS = 12_000;
const ANTHROPIC_MAX_RETRIES = 2;
const RATE_LIMIT_PER_MIN = 30;

// The columns logic.ts's Listing uses. Scoped (not select *) to bound payload
// size and avoid pulling columns we never read.
const LISTING_COLUMNS =
  "id,name,category,tags,area,address,phone,hours_json,description,price_range,rating,featured,business_id";

// CORS locked to the production origin(s). A browser on any other origin gets a
// non-matching Allow-Origin and is blocked; non-browser callers (no Origin
// header) are unaffected. Add a host here if the widget ever runs elsewhere.
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
    "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

function jsonResponse(body: unknown, cors: Record<string, string>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Single Anthropic call with timeout + retry. Returns the reply text, or null on
// any failure (the caller falls back to a deterministic directory list). Retries
// transient overloads/network errors; never throws.
async function askClaude(
  message: string,
  history: HistoryTurn[],
  candidates: unknown[],
): Promise<string | null> {
  const system = `You are Scout, 815local.com's concierge chatbot. You may ONLY recommend businesses from the CANDIDATES list below. Never invent a business, detail, phone number, or rating that isn't in the list. The candidates list below contains exactly ${candidates.length} real matching business(es) for this turn. If asked how many there are, state exactly that number, don't guess or invent a different count.

Never state a phone number yourself, not even one copied from the list below, the interface displays each business's real number separately so a digit can never get mistyped in your reply. Refer to it as "their contact info below" instead of typing any digits. You MAY briefly describe a business's opening hours from its hours_json when the person asks, but keep it short and don't recite a full weekly schedule unless asked.

Name all ${candidates.length} candidates in your first reply rather than a curated subset, don't make the visitor ask "any others?" repeatedly to get the full picture. Use the conversation history to tell what you've already mentioned: if a later turn asks for more and you've already named every candidate, say so plainly, never repeat or re-introduce one you already mentioned as if it were new.

Use the conversation history to interpret follow-ups like pronouns, "yes", "those", or short requests such as "contact info", they refer to the businesses already listed below. If none of the candidates genuinely fit what the person is asking for, say so honestly instead of forcing a recommendation. Keep replies short and conversational. Never use an em-dash character.

CANDIDATES:
${JSON.stringify(candidates, null, 2)}`;

  const payload = JSON.stringify({
    model: CHAT_MODEL,
    max_tokens: 1024,
    system,
    messages: [...history, { role: "user", content: message }],
  });

  for (let attempt = 0; attempt <= ANTHROPIC_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANTHROPIC_TIMEOUT_MS);
    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: payload,
        signal: ctrl.signal,
      });

      if (res.ok) {
        const data = await res.json();
        if (data?.stop_reason === "max_tokens") {
          console.warn("Anthropic reply hit max_tokens, may be truncated");
        }
        return data?.content?.[0]?.text ?? null;
      }

      // Retry transient statuses; give up on other 4xx (e.g. 401 bad key).
      const retriable = res.status === 429 || res.status === 529 || res.status >= 500;
      console.error("Anthropic API error", res.status, await res.text().catch(() => ""));
      if (!retriable || attempt === ANTHROPIC_MAX_RETRIES) return null;
      const retryAfter = Number(res.headers.get("retry-after"));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1) ** 2);
    } catch (err) {
      // AbortError (timeout) or network failure: retry, then give up.
      console.error("Anthropic fetch failed", (err as Error)?.name ?? err);
      if (attempt === ANTHROPIC_MAX_RETRIES) return null;
      await sleep(500 * (attempt + 1) ** 2);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

// Per-IP sliding-minute rate limit via a Postgres RPC (see the migration that
// creates chat_rate_limits + check_chat_rate_limit). Fails open: if the check
// errors, the request is allowed rather than dropped.
async function withinRateLimit(
  db: ReturnType<typeof createClient>,
  ip: string,
): Promise<boolean> {
  try {
    const { data, error } = await db.rpc("check_chat_rate_limit", {
      p_ip: ip,
      p_limit: RATE_LIMIT_PER_MIN,
    });
    if (error) {
      console.error("rate limit check failed (allowing)", error.message);
      return true;
    }
    return data !== false;
  } catch (err) {
    console.error("rate limit check threw (allowing)", err);
    return true;
  }
}

Deno.serve(async (req: Request) => {
  const cors = corsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: cors });
  }
  if (req.method !== "POST") {
    return jsonResponse({ reply: "Send a POST request.", candidates: [] }, cors, 405);
  }

  try {
    const body = await req.json().catch(() => null);
    const message = body?.message;

    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });

    const ip = (req.headers.get("x-forwarded-for") || "").split(",")[0].trim() || "unknown";
    if (!(await withinRateLimit(db, ip))) {
      return jsonResponse(
        { reply: "You're sending messages a little fast. Give me a few seconds and try again.", candidates: [] },
        cors,
        429,
      );
    }

    const { data: listings, error } = await db
      .from("listings")
      .select(LISTING_COLUMNS)
      .order("id")
      .limit(1000);
    if (error) throw error;
    const allListings = (listings ?? []) as unknown as Listing[];
    if (allListings.length === 1000) {
      console.warn("listings hit the 1000-row fetch cap; some rows are not being matched");
    }

    const history = sanitizeHistory(body?.history);
    const result = route(message, body?.history, body?.lastCandidates, allListings);

    // Deterministic branches carry their own reply.
    if (result.branch !== "match") {
      if (result.logUnmet && typeof message === "string") {
        // Logging is a side effect; a failure here must not break the reply.
        try {
          await db.from("unmet_requests").insert({ question: message.slice(0, 500) });
        } catch (e) {
          console.error("unmet_requests insert failed", e);
        }
      }
      return jsonResponse({ reply: result.reply, candidates: result.candidates }, cors);
    }

    // Open-ended path: ask Claude, constrained to the matched candidates.
    const aiCandidates = result.aiCandidates ?? [];
    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ reply: fallbackReply(aiCandidates), candidates: result.candidates }, cors);
    }
    const aiReply = await askClaude(String(message), history, aiCandidates);
    return jsonResponse({
      reply: aiReply || fallbackReply(aiCandidates),
      candidates: result.candidates,
    }, cors);
  } catch (err) {
    console.error(err);
    return jsonResponse({ reply: "Sorry, something went wrong on my end. Try again in a moment.", candidates: [] }, cors, 500);
  }
});

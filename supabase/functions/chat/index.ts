// Edge Function: chat (Scout, 815local Concierge)
//
// Deploy target: the SEPARATE "815local-concierge" Supabase project
// (ref ubcagczbnxfpoligmsqq), not the main site's kyneaettrynagavewefi
// project. Committing this file does NOT deploy it, there is no CI wiring
// this repo to that project. Deploy manually (e.g. via the Supabase MCP
// deploy_edge_function tool, or `supabase functions deploy chat` with the
// concierge project linked) whenever this file changes.
//
// Answers visitor questions from the real `listings` table only. Direct
// lookups (hours/phone for a named business, or for a business already
// established earlier in the conversation) answer straight from the DB
// with no AI call. Open-ended questions narrow candidates by keyword/tag
// match, then (if ANTHROPIC_API_KEY is configured) ask Claude to pick from
// that candidate list only, never inventing a business or detail.
//
// Request body: { "message": "...", "history"?: [{role, content}, ...],
//                 "lastCandidates"?: [{name}, ...] }
// Response body: { "reply": "...", "candidates": [{name, area, url}, ...] }
//
// `url` links back to the business's real page on 815local.com's directory
// (via `listings.business_id`, backfilled against the main site's
// `businesses` table) so a chatbot recommendation doesn't dead-end the
// visitor in the chat bubble. It's a structured field the widget renders
// as a real link itself, never something Claude writes into its own reply
// text, so there's no dependency on the AI reliably including a link.
//
// `history` and `lastCandidates` are optional and page-load scoped (the
// client resets both on every reload). Both are re-validated here
// regardless of what the client sends, since this is a public,
// unauthenticated endpoint.
//
// Follow-up turns ("any others?", "yes", "contact info") carry no topical
// keywords of their own. Rather than re-guessing the topic by fuzzy-
// matching raw conversation prose (which is full of generic boilerplate
// like "family owned" or "professional services" shared across unrelated
// listings, and produces inconsistent answers), the server returns exactly
// which real listings it used each turn, and the client echoes that back
// as `lastCandidates` on the next request. A follow-up with no candidates
// of its own reuses that exact, already-established set.

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");
const CHAT_MODEL = "claude-haiku-4-5-20251001";

const MAX_HISTORY_MESSAGES = 6; // 3 exchanges
const MAX_MESSAGE_CHARS = 300;
const MAX_CANDIDATES = 8;

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

// Generic quantifiers/backchannel words carry no topic signal on their own
// and previously caused false-positive matches (e.g. "others" coincidentally
// matching unrelated listing text), which produced inconsistent answers
// about how many businesses matched. Filtered out before scoring.
//
// "service"/"services"/"professional"/"business"/"located" are here for the
// same reason: they're generic category-boilerplate words ("Professional
// Services business located in X, IL.") that appear in the corpus of nearly
// every listing regardless of what it actually does, so leaving them
// scoreable turned any query containing "service" or "professional" into a
// near-directory-wide match (94 and 41 of 185 listings respectively, tested
// directly against production data).
const STOPWORDS = new Set([
  "a", "an", "the", "is", "are", "was", "were", "i", "me", "my", "we", "our",
  "you", "your", "have", "has", "had", "do", "does", "did", "for", "of", "to",
  "in", "on", "at", "with", "and", "or", "but", "if", "near", "looking",
  "find", "need", "want", "some", "someone", "any", "anyone", "anything",
  "other", "others", "else", "more", "there", "here", "this", "that", "these",
  "those", "them", "it", "can", "could", "would", "should", "please", "hi",
  "hello", "hey", "good", "best", "around", "local", "town", "area", "one",
  "get", "know", "yes", "no", "yeah", "yep", "nope", "sure", "okay", "ok",
  "thanks", "thank", "what", "where", "when", "who", "why", "how",
  "service", "services", "professional", "business", "businesses", "located",
  "offer", "offers", "provide", "provides", "providing", "serving",
]);

// Curated synonyms so common service intents match listings even when the
// exact word isn't in a listing's tags (e.g. "leak" -> plumbing listings).
// Keys must be single words: `tokenize` splits the query into individual
// words before this map is consulted, so a multi-word key like "tech
// support" would never be looked up as one unit, only "tech" and "support"
// separately.
const SYNONYMS: Record<string, string[]> = {
  leak: ["plumbing", "plumber", "drain", "pipe", "water heater", "faucet"],
  plumber: ["plumbing", "drain", "pipe", "water heater", "faucet"],
  plumbing: ["plumber", "drain", "pipe", "water heater", "faucet"],
  drain: ["plumbing", "plumber"],
  pipe: ["plumbing", "plumber"],
  clog: ["plumbing", "plumber", "drain"],
  clogged: ["plumbing", "plumber", "drain"],
  toilet: ["plumbing", "plumber"],
  faucet: ["plumbing", "plumber"],
  electrician: ["electrical", "wiring", "electric"],
  electrical: ["electrician", "wiring", "electric"],
  wiring: ["electrician", "electrical"],
  furnace: ["hvac", "heating", "cooling"],
  ac: ["hvac", "air conditioning", "cooling"],
  heater: ["hvac", "heating"],
  hvac: ["heating", "cooling", "furnace", "air conditioning"],
  roof: ["roofing"],
  roofing: ["roof"],
  pest: ["exterminator", "pest control"],
  exterminator: ["pest control", "pest"],
  tow: ["towing"],
  towing: ["tow"],
  brunch: ["breakfast"],
  breakfast: ["brunch"],
  beer: ["taproom", "brewery"],
  haircut: ["hair", "barber", "barbershop", "stylist"],
  haircuts: ["hair", "barber", "barbershop", "stylist"],
  therapist: ["counseling", "counselor"],
  lawyer: ["law firm", "legal"],
  attorney: ["law firm", "legal"],
  mechanic: ["automotive"],
  handyman: ["home repair"],
  computer: ["managed it", "helpdesk"],
  tech: ["managed it", "helpdesk", "computer"],
};

// "contact"/"info"/"call"/"phone" stay out of STOPWORDS on purpose: they are
// the trigger keywords for the direct-lookup fast path below, not noise.
const CONTACT_INTENT = /\b(contact|info|information)\b/;
const HOURS_INTENT = /\b(hours?|open|close[sd]?)\b/;
const PHONE_INTENT = /\b(phone|number|call)\b/;

interface Listing {
  id: number;
  name: string;
  category: string;
  tags: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  website: string | null;
  hours_json: Record<string, string> | null;
  description: string | null;
  price_range: string | null;
  rating: number | null;
  featured: boolean | null;
  business_id: string | null;
}

interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w));
}

function expandTokens(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);
  for (const t of tokens) {
    (SYNONYMS[t] || []).forEach((s) => expanded.add(s));
  }
  return [...expanded];
}

// Whole-word matching, not raw substring: "hair" must never match inside
// "wheelchair", and "professional" must never bleed across a phrase inside
// a longer word. Corpus text is tokenized into a set of whole words first,
// and a query term only matches a whole word in that set (or, for terms of
// 5+ letters, a whole word sharing that term's 5-letter root, so
// "plumber"/"plumbing"/"plumbers" match each other without a full stemmer).
// A multi-word synonym target like "law firm" requires every one of its
// words to appear somewhere in the corpus (not necessarily adjacent).
function corpusWordsFor(listing: Listing): Set<string> {
  const text = [listing.name, listing.category, listing.tags, listing.description]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
}

function fuzzyWordMatch(corpusWords: Set<string>, term: string): boolean {
  for (const tw of term.split(/\s+/).filter(Boolean)) {
    if (tw.length >= 5) {
      const prefix = tw.slice(0, 5);
      let found = false;
      for (const w of corpusWords) {
        if (w.startsWith(prefix)) {
          found = true;
          break;
        }
      }
      if (!found) return false;
    } else if (!corpusWords.has(tw)) {
      return false;
    }
  }
  return true;
}

function scoreListing(listing: Listing, terms: string[]): number {
  const corpusWords = corpusWordsFor(listing);
  let score = 0;
  for (const term of terms) {
    if (fuzzyWordMatch(corpusWords, term)) score += 1;
  }
  return score;
}

function matchListings(listings: Listing[], text: string): Listing[] {
  const terms = expandTokens(tokenize(text));
  return listings
    .map((l) => ({ listing: l, score: scoreListing(l, terms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((s) => s.listing);
}

function findNamedListing(listings: Listing[], text: string): Listing | undefined {
  const lower = text.toLowerCase();
  return listings.find((l) => {
    const nameWords = l.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["llc", "inc", "the", "and"].includes(w));
    if (nameWords.length === 0) return false;
    return nameWords.every((w) => lower.includes(w));
  });
}

function formatHours(hours: Record<string, string> | null): string {
  if (!hours) return "I don't have hours on file for that listing.";
  const days = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"];
  return days
    .filter((d) => hours[d])
    .map((d) => `${d[0].toUpperCase()}${d.slice(1)}: ${hours[d]}`)
    .join("\n");
}

function sanitizeHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  let turns: HistoryTurn[] = raw
    .filter((h): h is HistoryTurn => h && typeof h === "object" && typeof h.content === "string")
    .map((h) => ({
      role: h.role === "assistant" ? "assistant" : "user",
      content: String(h.content).slice(0, MAX_MESSAGE_CHARS),
    }));
  // Keep only whole exchanges: history should read user, assistant, user, assistant, ...
  if (turns.length % 2 !== 0) turns = turns.slice(1);
  return turns.slice(-MAX_HISTORY_MESSAGES);
}

function sanitizeLastCandidates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is { name: string } => c && typeof c === "object" && typeof c.name === "string")
    .map((c) => c.name.slice(0, 200))
    .slice(0, MAX_CANDIDATES);
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, "Content-Type": "application/json" },
  });
}

function fallbackReply(candidates: Partial<Listing>[]): string {
  const lines = candidates
    .slice(0, 5)
    .map((c) => `- ${c.name} (${c.area})${c.phone ? `, ${c.phone}` : ""}`);
  return `Here's what I found in the directory:\n${lines.join("\n")}`;
}

function toCandidate(l: Listing): Partial<Listing> {
  return {
    name: l.name,
    category: l.category,
    area: l.area,
    tags: l.tags,
    description: l.description,
    phone: l.phone,
    price_range: l.price_range,
    rating: l.rating,
  };
}

// The client-facing echo (not fed to Claude): just enough to render a link
// back to the business's real directory page and to carry forward as
// `lastCandidates` on the next turn.
function toCandidateEcho(l: Listing): { name: string; area: string | null; url: string | null } {
  return {
    name: l.name,
    area: l.area,
    url: l.business_id ? `https://815local.com/pages/business.html?id=${l.business_id}` : null,
  };
}

async function askClaude(
  message: string,
  history: HistoryTurn[],
  candidates: Partial<Listing>[],
): Promise<string | null> {
  const system = `You are Scout, 815local.com's concierge chatbot. You may ONLY recommend businesses from the CANDIDATES list below. Never invent a business, detail, hours, phone number, or rating that isn't in the list. The candidates list below contains exactly ${candidates.length} real matching business(es) for this turn. If asked how many there are, state exactly that number, don't guess or invent a different count. Use the conversation history to interpret follow-ups like pronouns, "yes", "those", or short requests such as "contact info", they refer to the businesses already listed below. If none of the candidates genuinely fit what the person is asking for, say so honestly instead of forcing a recommendation. Keep replies short and conversational. Never use an em-dash character.

CANDIDATES:
${JSON.stringify(candidates, null, 2)}`;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: CHAT_MODEL,
      max_tokens: 400,
      system,
      messages: [...history, { role: "user", content: message }],
    }),
  });

  if (!res.ok) {
    console.error("Anthropic API error", res.status, await res.text());
    return null;
  }
  const data = await res.json();
  return data?.content?.[0]?.text ?? null;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }

  try {
    const body = await req.json();
    const message = body?.message;
    if (!message || typeof message !== "string") {
      return jsonResponse({ reply: "Ask me something about a business, hours, or a service!", candidates: [] });
    }
    const history = sanitizeHistory(body?.history);
    const lastCandidateNames = sanitizeLastCandidates(body?.lastCandidates);

    const db = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data: listings, error } = await db.from("listings").select("*");
    if (error) throw error;
    const allListings = listings as Listing[];

    const lowerMsg = message.toLowerCase();
    const wantsHours = HOURS_INTENT.test(lowerMsg);
    const wantsPhone = PHONE_INTENT.test(lowerMsg) || CONTACT_INTENT.test(lowerMsg);

    // Direct lookup, current message names a business explicitly.
    if (wantsHours || wantsPhone) {
      const named = findNamedListing(allListings, message);
      if (named) {
        if (wantsHours) {
          return jsonResponse({
            reply: `${named.name}'s hours:\n${formatHours(named.hours_json)}`,
            candidates: [toCandidateEcho(named)],
          });
        }
        return jsonResponse({
          reply: named.phone
            ? `${named.name}'s phone number is ${named.phone}.`
            : `I don't have a phone number on file for ${named.name}.`,
          candidates: [toCandidateEcho(named)],
        });
      }
    }

    const directCandidates = matchListings(allListings, message);
    // A bare follow-up ("any others?", "yes", "contact info") carries no
    // topical keywords of its own. Reuse the EXACT businesses the server
    // already established last turn, rather than re-guessing from prose.
    const carriedCandidates = directCandidates.length === 0 && lastCandidateNames.length > 0
      ? allListings.filter((l) => lastCandidateNames.includes(l.name))
      : [];

    // Direct lookup, bare follow-up ("contact info") inherits a small,
    // already-established set of businesses from earlier in the chat.
    if ((wantsHours || wantsPhone) && directCandidates.length === 0 && carriedCandidates.length > 0 && carriedCandidates.length <= 3) {
      const cands = carriedCandidates.map(toCandidateEcho);
      if (wantsHours) {
        const lines = carriedCandidates.map((l) => `${l.name}:\n${formatHours(l.hours_json)}`);
        return jsonResponse({ reply: lines.join("\n\n"), candidates: cands });
      }
      const lines = carriedCandidates.map((l) =>
        l.phone ? `${l.name}: ${l.phone}` : `${l.name}: no phone number on file`
      );
      return jsonResponse({ reply: lines.join("\n"), candidates: cands });
    }

    const matched = directCandidates.length > 0 ? directCandidates : carriedCandidates;

    if (matched.length === 0) {
      await db.from("unmet_requests").insert({ question: message });
      return jsonResponse({
        reply:
          "I checked, but none of the current 815local.com listings match that. I don't want to send you to the wrong business. Please check back as the directory grows.",
        candidates: [],
      });
    }

    const candidates = matched.map(toCandidate);
    const candidateEcho = matched.map(toCandidateEcho);

    if (!ANTHROPIC_API_KEY) {
      return jsonResponse({ reply: fallbackReply(candidates), candidates: candidateEcho });
    }

    const aiReply = await askClaude(message, history, candidates);
    return jsonResponse({ reply: aiReply || fallbackReply(candidates), candidates: candidateEcho });
  } catch (err) {
    console.error(err);
    return jsonResponse({ reply: "Sorry, something went wrong on my end. Try again in a moment.", candidates: [] }, 500);
  }
});

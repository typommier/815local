// Scout concierge: pure decision logic, runtime-agnostic.
//
// This module holds every piece of Scout's request handling that does NOT
// touch the network, the database, or the Deno runtime: tokenizing, keyword/
// synonym matching, named-business lookup, hours formatting, history/candidate
// sanitizing, and the top-level `route()` that decides which branch a request
// takes. It imports nothing from `Deno.*` or `jsr:` so it runs unchanged under
// both the Supabase edge runtime (via index.ts) and a plain Node test runner
// (tests/concierge/logic.test.ts). Keep it that way: no side effects here.
//
// index.ts owns only the impure shell: serving, the `listings` fetch, per-IP
// rate limiting, the unmet_requests insert, and the Anthropic call. It hands
// the loaded listings to `route()` and acts on the branch it returns.

export const MAX_HISTORY_MESSAGES = 6; // 3 exchanges
export const MAX_MESSAGE_CHARS = 300;
export const MAX_CANDIDATES = 8;

// Generic quantifiers/backchannel words carry no topic signal on their own and
// previously caused false-positive matches (e.g. "others" coincidentally
// matching unrelated listing text). "service"/"professional"/"business"/
// "located" etc. are generic category boilerplate ("Professional Services
// business located in X, IL.") shared by nearly every listing, so leaving them
// scoreable turned any query containing them into a near-directory-wide match.
// All filtered out before scoring.
export const STOPWORDS = new Set<string>([
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
  // Common function/filler words that appear across most listing descriptions
  // ("their customers", "right here") and so carry no topic signal.
  "their", "theirs", "they", "his", "her", "hers", "its", "right", "about",
  "just", "really", "very", "also", "still", "into", "than", "then", "from",
  "much", "many", "only", "even", "ever", "own", "such", "will", "been", "being",
  // Generic praise / marketing boilerplate that appears in many descriptions
  // ("great coffee", "family owned", "friendly service"), so it must not be
  // scoreable: a query like "great clips" would otherwise pull in every listing
  // whose description merely says "great". These are never a business's
  // distinguishing keyword. NOTE: "family" and "community" are intentionally
  // NOT here, they carry real intent ("Kids & Family" is a category).
  "great", "amazing", "awesome", "wonderful", "excellent", "quality",
  "friendly", "owned", "known", "years", "favorite", "welcoming",
  // Generic place-nouns: the distinguishing keyword is always the OTHER word
  // ("coffee shop" -> coffee, "pet store" -> pet), so these only add noise.
  "shop", "shops", "store", "stores", "place", "places", "spot", "spots",
]);

// Curated synonyms so common service intents match listings even when the exact
// word isn't in a listing's tags (e.g. "leak" -> plumbing listings). Keys must
// be single words: `tokenize` splits the query into individual words before
// this map is consulted, so a multi-word key like "tech support" would never be
// looked up as one unit, only "tech" and "support" separately.
export const SYNONYMS: Record<string, string[]> = {
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
  hair: ["haircut", "barber", "barbershop", "stylist", "blonding", "blending", "cutting", "coloring", "colorist"],
  haircut: ["hair", "barber", "barbershop", "stylist", "blonding", "blending", "cutting", "coloring", "colorist"],
  haircuts: ["hair", "barber", "barbershop", "stylist", "blonding", "blending", "cutting", "coloring", "colorist"],
  therapist: ["counseling", "counselor"],
  lawyer: ["law firm", "legal"],
  attorney: ["law firm", "legal"],
  mechanic: ["automotive"],
  handyman: ["home repair"],
  computer: ["managed it", "helpdesk"],
  tech: ["managed it", "helpdesk", "computer"],
  // Dining: the "Food & Drink" category is the largest, but everyday words for
  // it ("eat", "restaurant", "dinner") don't appear in that category label, so
  // map them onto the corpus words "food"/"drink".
  restaurant: ["food", "drink"],
  restaurants: ["food", "drink"],
  dining: ["food", "drink"],
  dinner: ["food", "drink"],
  lunch: ["food", "drink"],
  eat: ["food", "drink"],
  eats: ["food", "drink"],
  cafe: ["coffee"],
  gym: ["fitness"],
  workout: ["fitness", "gym"],
  dentist: ["dental"],
  dental: ["dentist"],
};

// Intent detection runs as a regex on the RAW message (see route), so these
// trigger words must stay out of STOPWORDS. But they must ALSO be kept out of
// the *topical* token stream: `tokenize` feeds only `matchListings`, and words
// like "hours"/"open"/"call"/"now" appear in a handful of listing corpora, so
// leaving them scoreable let a bare follow-up ("what are their hours?") match
// unrelated listings and hijack the topic instead of reusing last turn's set.
// INTENT_WORDS is filtered inside `tokenize` for exactly that reason.
export const INTENT_WORDS = new Set<string>([
  "contact", "info", "information", "phone", "number", "call", "tel", "telephone",
  "hours", "hour", "open", "opens", "opened", "close", "closes", "closed", "closing",
  "today", "now", "tonight",
]);

export const CONTACT_INTENT = /\b(contact|info|information)\b/;
export const HOURS_INTENT = /\b(hours?|open|close[sd]?)\b/;
export const PHONE_INTENT = /\b(phone|number|call)\b/;

export interface Listing {
  id: number;
  name: string;
  category: string;
  tags: string | null;
  area: string | null;
  address: string | null;
  phone: string | null;
  website?: string | null;
  hours_json: Record<string, string | null> | null;
  description: string | null;
  price_range: string | null;
  rating: number | null;
  featured: boolean | null;
  business_id: string | null;
}

export interface HistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export interface EchoCandidate {
  name: string;
  area: string | null;
  url: string | null;
  phone: string | null;
}

export type Branch =
  | "empty-input"
  | "named-hours"
  | "named-phone"
  | "carried-hours"
  | "carried-phone"
  | "no-match"
  | "match";

export interface RouteResult {
  branch: Branch;
  // Deterministic reply for every branch except "match" (which needs Claude).
  reply?: string;
  // Client-facing echo (link + real phone), also carried forward next turn.
  candidates: EchoCandidate[];
  // Claude-facing candidate payload, only set on the "match" branch.
  aiCandidates?: Partial<Listing>[];
  // True on "no-match": index.ts should log the question to unmet_requests.
  logUnmet?: boolean;
}

export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2 && !STOPWORDS.has(w) && !INTENT_WORDS.has(w));
}

export function expandTokens(tokens: string[]): string[] {
  const expanded = new Set<string>(tokens);
  for (const t of tokens) {
    (SYNONYMS[t] || []).forEach((s) => expanded.add(s));
  }
  return [...expanded];
}

// Whole-word matching, not raw substring: "hair" must never match inside
// "wheelchair". Corpus text is tokenized into a set of whole words first, and a
// query term only matches a whole word in that set (or, for terms of 5+ letters,
// a whole word sharing that term's 5-letter root, so "plumber"/"plumbing" match
// each other without a full stemmer). A multi-word synonym target like "law
// firm" requires every one of its words to appear somewhere in the corpus.
export function corpusWordsFor(listing: Listing): Set<string> {
  // `area` and `address` are included so location queries ("anything in
  // Shorewood?", "on Route 6") match even when the town isn't mentioned in the
  // free-text description.
  const text = [listing.name, listing.category, listing.tags, listing.description, listing.area, listing.address]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return new Set(text.split(/[^a-z0-9]+/).filter(Boolean));
}

export function fuzzyWordMatch(corpusWords: Set<string>, term: string): boolean {
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

export function scoreListing(listing: Listing, terms: string[]): number {
  const corpusWords = corpusWordsFor(listing);
  let score = 0;
  for (const term of terms) {
    if (fuzzyWordMatch(corpusWords, term)) score += 1;
  }
  return score;
}

export function matchListings(listings: Listing[], text: string): Listing[] {
  const terms = expandTokens(tokenize(text));
  return listings
    .map((l) => ({ listing: l, score: scoreListing(l, terms) }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, MAX_CANDIDATES)
    .map((s) => s.listing);
}

// Whole-word (not substring) match of a listing's significant name words against
// the message, so a short name word like "sip" can't match inside "mississippi".
// Among listings whose full name is present, return the most specific one (most
// matched name words, tie-broken by longer name) rather than the first hit.
export function findNamedListing(listings: Listing[], text: string): Listing | undefined {
  const msgWords = new Set(
    text.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter(Boolean),
  );
  let best: Listing | undefined;
  let bestLen = 0;
  for (const l of listings) {
    const nameWords = l.name
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((w) => w.length > 2 && !["llc", "inc", "the", "and"].includes(w));
    if (nameWords.length === 0) continue;
    // Match each name word against the message using the same stemming as
    // topical scoring: exact whole word for short words (so "sip" can't match
    // "mississippi"), 5-letter-prefix for longer ones (so a possessive/plural
    // like "corrigans" still matches the listing "Corrigan's Pub").
    if (!nameWords.every((w) => fuzzyWordMatch(msgWords, w))) continue;
    if (nameWords.length > bestLen || (nameWords.length === bestLen && best && l.name.length > best.name.length)) {
      best = l;
      bestLen = nameWords.length;
    }
  }
  return best;
}

// Real `listings` hours use abbreviated day keys (mon/tue/...); older/main-site
// data uses full names. Accept both, skip null/blank day values, and never
// return an empty string (an empty return renders as a business name followed by
// nothing).
const HOURS_NONE = "I don't have hours on file for that listing.";
const DAY_KEYS: [string, string[]][] = [
  ["Monday", ["monday", "mon"]],
  ["Tuesday", ["tuesday", "tues", "tue"]],
  ["Wednesday", ["wednesday", "wed"]],
  ["Thursday", ["thursday", "thurs", "thur", "thu"]],
  ["Friday", ["friday", "fri"]],
  ["Saturday", ["saturday", "sat"]],
  ["Sunday", ["sunday", "sun"]],
];

export function formatHours(hours: Record<string, string | null> | null): string {
  if (!hours || typeof hours !== "object") return HOURS_NONE;
  const lines: string[] = [];
  for (const [label, keys] of DAY_KEYS) {
    let val: string | null = null;
    for (const k of keys) {
      const v = hours[k];
      if (v != null && String(v).trim()) {
        val = String(v).trim();
        break;
      }
    }
    if (val) lines.push(`${label}: ${val}`);
  }
  return lines.length ? lines.join("\n") : HOURS_NONE;
}

export function sanitizeHistory(raw: unknown): HistoryTurn[] {
  if (!Array.isArray(raw)) return [];
  const cleaned: HistoryTurn[] = raw
    .filter((h): h is HistoryTurn => !!h && typeof h === "object" && typeof (h as HistoryTurn).content === "string")
    .map((h) => ({
      role: (h as HistoryTurn).role === "assistant" ? "assistant" : "user",
      content: String((h as HistoryTurn).content).slice(0, MAX_MESSAGE_CHARS),
    }));
  // Enforce strict user-first alternation. The Anthropic Messages API rejects
  // non-alternating roles with a 400, and the caller appends a final user turn,
  // so history must read user, assistant, ... and end on assistant. A single
  // malformed client history must not silently 400 the whole session.
  const out: HistoryTurn[] = [];
  for (const turn of cleaned) {
    if (out.length === 0) {
      if (turn.role !== "user") continue; // must start with user
      out.push(turn);
    } else if (turn.role !== out[out.length - 1].role) {
      out.push(turn);
    }
  }
  if (out.length && out[out.length - 1].role === "user") out.pop(); // end on assistant
  return out.slice(-MAX_HISTORY_MESSAGES);
}

export function sanitizeLastCandidates(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is { name: string } => !!c && typeof c === "object" && typeof (c as { name: unknown }).name === "string")
    .map((c) => (c as { name: string }).name.slice(0, 200))
    .slice(0, MAX_CANDIDATES);
}

export function fallbackReply(candidates: Partial<Listing>[]): string {
  const lines = candidates
    .slice(0, 5)
    .map((c) => `- ${c.name} (${c.area || "nearby"})${c.phone ? `, ${c.phone}` : ""}`);
  return `Here's what I found in the directory:\n${lines.join("\n")}`;
}

// Fed to Claude: enough to describe and rank the candidates. Phone is
// deliberately OMITTED so it can never be echoed into Claude's prose (the widget
// renders the real number from toCandidateEcho instead); hours_json IS included
// so Claude can answer qualitative "what's open now?" style questions, while the
// system prompt tells it to defer exact times and phone numbers to "their info
// below".
export function toCandidate(l: Listing): Partial<Listing> {
  return {
    name: l.name,
    category: l.category,
    area: l.area,
    tags: l.tags,
    description: l.description,
    hours_json: l.hours_json,
    price_range: l.price_range,
    rating: l.rating,
  };
}

// Client-facing echo (not fed to Claude): just enough to render a link and real
// phone number, and to carry forward as `lastCandidates` next turn.
export function toCandidateEcho(l: Listing): EchoCandidate {
  return {
    name: l.name,
    area: l.area,
    url: l.business_id ? `https://815local.com/pages/business.html?id=${l.business_id}` : null,
    phone: l.phone,
  };
}

// Pure decision tree. Mirrors the current Deno.serve handler exactly, minus the
// impure shell (DB fetch, unmet_requests insert, Anthropic call). index.ts calls
// this and acts on `branch`.
export function route(
  message: unknown,
  historyRaw: unknown,
  lastCandidatesRaw: unknown,
  listings: Listing[],
): RouteResult {
  // Normalize once: trim, cap length (guards CPU/token cost on a huge body),
  // and reject empty/whitespace-only input.
  const msg = typeof message === "string" ? message.trim().slice(0, MAX_MESSAGE_CHARS) : "";
  if (!msg) {
    return {
      branch: "empty-input",
      reply: "Ask me something about a business, hours, or a service!",
      candidates: [],
    };
  }

  const lastCandidateNames = sanitizeLastCandidates(lastCandidatesRaw);
  const lowerMsg = msg.toLowerCase();
  const wantsHours = HOURS_INTENT.test(lowerMsg);
  const wantsPhone = PHONE_INTENT.test(lowerMsg) || CONTACT_INTENT.test(lowerMsg);

  // Direct lookup: current message names a business explicitly.
  if (wantsHours || wantsPhone) {
    const named = findNamedListing(listings, msg);
    if (named) {
      if (wantsHours) {
        return {
          branch: "named-hours",
          reply: `${named.name}'s hours:\n${formatHours(named.hours_json)}`,
          candidates: [toCandidateEcho(named)],
        };
      }
      return {
        branch: "named-phone",
        reply: named.phone
          ? `${named.name}'s phone number is ${named.phone}.`
          : `I don't have a phone number on file for ${named.name}.`,
        candidates: [toCandidateEcho(named)],
      };
    }
  }

  // Belt-and-suspenders: if the message has no topical tokens at all (a bare
  // follow-up like "any others?" or "what are their hours?"), skip matching
  // entirely so it always routes to the carried set, even if a future token
  // ever leaks past the STOPWORDS/INTENT_WORDS filters.
  const topicalTerms = expandTokens(tokenize(msg));
  const directCandidates = topicalTerms.length ? matchListings(listings, msg) : [];
  // A bare follow-up ("any others?", "yes", "contact info") carries no topical
  // keywords of its own. Reuse the EXACT businesses established last turn.
  const carriedCandidates = directCandidates.length === 0 && lastCandidateNames.length > 0
    ? listings.filter((l) => lastCandidateNames.includes(l.name))
    : [];

  // Direct lookup, bare follow-up inheriting a small established set.
  if ((wantsHours || wantsPhone) && directCandidates.length === 0 && carriedCandidates.length > 0 && carriedCandidates.length <= 3) {
    const cands = carriedCandidates.map(toCandidateEcho);
    if (wantsHours) {
      const lines = carriedCandidates.map((l) => `${l.name}:\n${formatHours(l.hours_json)}`);
      return { branch: "carried-hours", reply: lines.join("\n\n"), candidates: cands };
    }
    const lines = carriedCandidates.map((l) =>
      l.phone ? `${l.name}: ${l.phone}` : `${l.name}: no phone number on file`
    );
    return { branch: "carried-phone", reply: lines.join("\n"), candidates: cands };
  }

  const matched = directCandidates.length > 0 ? directCandidates : carriedCandidates;

  if (matched.length === 0) {
    return {
      branch: "no-match",
      reply:
        "I checked, but none of the current 815local.com listings match that. I don't want to send you to the wrong business. Please check back as the directory grows.",
      candidates: [],
      logUnmet: true,
    };
  }

  return {
    branch: "match",
    candidates: matched.map(toCandidateEcho),
    aiCandidates: matched.map(toCandidate),
  };
}

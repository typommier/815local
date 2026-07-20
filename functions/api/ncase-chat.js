// Cloudflare Pages Function for POST /api/ncase-chat
//
// Backend for the N-Case Heating & Cooling demo's booking assistant
// (mockups/mk-5b987e077929/ncase-heating-cooling.html). The browser used to
// call api.anthropic.com directly, which meant either shipping a key in page
// source or (as shipped) sending no key at all and always falling back to the
// offline script. This function keeps the key server-side: it reads
// ANTHROPIC_API_KEY from the Cloudflare Pages environment (set it in the
// dashboard, never commit it), holds the system prompt here so it isn't in the
// page source, and proxies a single Anthropic Messages call.
//
// Conventions (timeout, retry, headers, retriable-status logic) mirror the
// hardened Scout call in supabase/functions/chat/index.ts.

const CHAT_MODEL = 'claude-haiku-4-5-20251001';
const ANTHROPIC_TIMEOUT_MS = 12_000;
const ANTHROPIC_MAX_RETRIES = 2;
const MAX_MESSAGES = 40;      // conversation turns we'll forward
const MAX_CHARS = 4000;       // per-message content cap

// The assistant persona. Moved out of the client so it isn't shipped in page
// source and can't be tampered with. Keep the guardrails: never quote a price,
// never diagnose with certainty, at most one free thing to check, flag no-heat
// / no-cool as priority, emit the [[BOOK]] marker only when all six items are
// collected.
const SYSTEM = `You are the scheduling assistant for N-Case Heating & Cooling, a local HVAC company in Minooka, Illinois, in business since 2003. Owner: Baker. Phone: 815-409-2445. You answer 24/7. Service, installation, and sales.

Service area: Minooka, Channahon, Shorewood, Morris, Wilmington, Lisbon, Seward, Coal City, Plainfield, Joliet, and the rest of Grundy County.
Services: furnace repair and replacement, A/C repair and replacement, ductless mini-splits, seasonal maintenance, gas line installation, light commercial. Financing available.

YOUR JOB: book a service visit, fast and warmly. Talk like a competent dispatcher, not a chatbot. Short replies, two or three sentences max. Never use bullet points.

First figure out what kind of visit this is. If they're reporting a problem, collect, in roughly this order, one or two items per message:
1. What the system is doing and whether it is heating or cooling
2. Whether they have NO heat or NO cooling right now (that makes it urgent)
3. Name
4. Street address or at least the town
5. Best phone number
6. When they would like someone out

If instead they're asking for a seasonal tune-up, routine maintenance, or a quote/estimate on a new system, nothing is broken, so skip items 1 and 2 entirely, don't ask a diagnostic question like "is it blowing cold air," and don't treat it as urgent. Just acknowledge what they want and move straight to collecting name, address, phone, and preferred window.

Rules:
- If they have no heat and it is cold, say Baker prioritizes no-heat calls and offer the soonest window today.
- Never quote a repair price. Say the tech gives a firm number on site before any work starts.
- Never diagnose with certainty. You may suggest one free thing to check: thermostat batteries, breaker, filter, furnace door switch. This only applies to reported problems, not tune-ups or quotes.
- If they are outside the service area, say so kindly and suggest they still call the office.
- Offer realistic windows: today 2-4 PM, today 4-6 PM, tomorrow 8-10 AM, tomorrow 10 AM-noon, tomorrow 1-3 PM. For urgent no-heat, offer a next-available window inside two hours. Tune-ups and quotes are never urgent, offer normal windows.

WHEN YOU HAVE ALL SIX ITEMS: confirm the appointment in one friendly sentence, then on a brand new final line output exactly this and nothing after it:
[[BOOK]]{"name":"","phone":"","address":"","issue":"","system":"furnace|ac|other","urgent":true,"window":"","sms":""}[[/BOOK]]

"issue" is a short dispatch note summarizing the symptom, under 12 words. "sms" is the confirmation text to send the customer, under 200 characters, signed with the company name. Output the marker only once, only when everything is collected.`;

function json(body, status) {
  return new Response(JSON.stringify(body), {
    status: status || 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Accept the browser's history, keep only well-formed user/assistant turns, cap
// count and length. The client sends { messages: [{role, content}, ...] }.
function sanitize(messages) {
  if (!Array.isArray(messages)) return null;
  const clean = [];
  for (const m of messages) {
    if (!m || (m.role !== 'user' && m.role !== 'assistant')) continue;
    const content = typeof m.content === 'string' ? m.content.slice(0, MAX_CHARS) : '';
    if (!content) continue;
    clean.push({ role: m.role, content });
  }
  if (!clean.length) return null;
  return clean.slice(-MAX_MESSAGES);
}

// Single Anthropic call with timeout + retry. Returns reply text, or null on any
// failure so the caller returns a non-2xx and the page's offline script kicks in.
async function askClaude(messages, apiKey) {
  const payload = JSON.stringify({
    model: CHAT_MODEL,
    max_tokens: 1000,
    system: SYSTEM,
    messages,
  });

  for (let attempt = 0; attempt <= ANTHROPIC_MAX_RETRIES; attempt++) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ANTHROPIC_TIMEOUT_MS);
    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
        },
        body: payload,
        signal: ctrl.signal,
      });

      if (res.ok) {
        const data = await res.json();
        const text = (data?.content || [])
          .filter((b) => b.type === 'text')
          .map((b) => b.text)
          .join('\n')
          .trim();
        return text || null;
      }

      // Retry transient statuses; give up on other 4xx (e.g. 401 bad key).
      const retriable = res.status === 429 || res.status === 529 || res.status >= 500;
      console.error('Anthropic API error', res.status, await res.text().catch(() => ''));
      if (!retriable || attempt === ANTHROPIC_MAX_RETRIES) return null;
      const retryAfter = Number(res.headers.get('retry-after'));
      await sleep(Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1) ** 2);
    } catch (err) {
      // AbortError (timeout) or network failure: retry, then give up.
      console.error('Anthropic fetch failed', err?.name ?? err);
      if (attempt === ANTHROPIC_MAX_RETRIES) return null;
      await sleep(500 * (attempt + 1) ** 2);
    } finally {
      clearTimeout(timer);
    }
  }
  return null;
}

export async function onRequestPost({ request, env }) {
  const apiKey = env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    console.error('ANTHROPIC_API_KEY is not set on this Pages project');
    return json({ error: 'assistant_unavailable' }, 503);
  }

  const body = await request.json().catch(() => null);
  const messages = sanitize(body && body.messages);
  if (!messages) return json({ error: 'bad_request' }, 400);

  const reply = await askClaude(messages, apiKey);
  if (!reply) return json({ error: 'assistant_unavailable' }, 502);

  return json({ reply });
}
// Only POST is defined; Cloudflare Pages returns 405 for other methods.

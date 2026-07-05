import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, apikey",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: CORS_HEADERS });
  }
  if (req.method !== "POST") {
    return json({ error: "POST only" }, 405);
  }

  let body: { message?: string };
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON body" }, 400);
  }

  const message = (body.message || "").trim();
  if (!message) return json({ error: "Missing 'message'" }, 400);

  const directHit = await tryDirectLookup(message);
  if (directHit) return json({ reply: directHit, type: "direct" });

  const candidates = await findCandidates(message);

  if (candidates.length === 0) {
    await logUnmetRequest(message);
    return json({
      reply:
        "I don't have a listing that matches that yet — I've logged your question so we can look into adding one. Is there something else in the area I can help you find?",
      type: "no_match",
    });
  }

  const reply = await askClaude(message, candidates);
  return json({ reply, type: "recommendation", matched: candidates.map((c: any) => c.name) });
});

function json(obj: unknown, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...CORS_HEADERS },
  });
}

async function tryDirectLookup(message: string) {
  const lower = message.toLowerCase();
  const wantsHours = /hour|open|close/.test(lower);
  const wantsPhone = /phone|number|call/.test(lower);
  if (!wantsHours && !wantsPhone) return null;

  const { data: results } = await supabase.from("listings").select("*");
  if (!results) return null;

  const match = results.find((r: any) => lower.includes(r.name.toLowerCase()));
  if (!match) return null;

  if (wantsHours) {
    const hours = match.hours_json || {};
    const day = new Date().toLocaleDateString("en-US", { weekday: "short" }).toLowerCase().slice(0, 3);
    const today = hours[day] || "not listed";
    const fullWeek = Object.entries(hours).map(([d, h]) => `${d} ${h}`).join(", ");
    return `${match.name} — today's hours: ${today}. Full week: ${fullWeek}.`;
  }
  if (wantsPhone) {
    return `${match.name}: ${match.phone || "no phone on file"}${match.address ? " — " + match.address : ""}.`;
  }
  return null;
}

async function findCandidates(message: string) {
  const lower = message.toLowerCase();
  const { data: results } = await supabase.from("listings").select("*");
  if (!results) return [];

  const words = lower.split(/\W+/).filter((w) => w.length > 2);

  const scored = results
    .map((r: any) => {
      const haystack = `${r.category} ${r.tags} ${r.description}`.toLowerCase();
      let score = 0;
      for (const w of words) {
        if (haystack.includes(w)) score += 1;
      }
      if (r.featured) score += 0.5;
      return { ...r, score };
    })
    .filter((r: any) => r.score > 0)
    .sort((a: any, b: any) => b.score - a.score)
    .slice(0, 5);

  return scored;
}

async function logUnmetRequest(message: string) {
  try {
    await supabase.from("unmet_requests").insert({ question: message });
  } catch {
    // non-fatal
  }
}

async function askClaude(message: string, candidates: any[]) {
  const listingsText = candidates
    .map(
      (c) =>
        `- ${c.name} (${c.category}, ${c.area}): ${c.description} Price: ${c.price_range || "n/a"}. Phone: ${c.phone || "n/a"}.`
    )
    .join("\n");

  const systemPrompt = `You are the concierge chat assistant for 815local.com, a hyperlocal business directory.
Rules:
- Recommend ONLY businesses from the provided list. Never invent or reference any business not listed.
- Keep replies short (2-4 sentences), warm, and specific — mention why a listing fits what was asked.
- If none of the provided listings truly fit, say so honestly rather than forcing a recommendation.
- Do not make up hours, prices, or details beyond what's provided.`;

  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": Deno.env.get("ANTHROPIC_API_KEY")!,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-5",
      max_tokens: 300,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: `Visitor question: "${message}"\n\nAvailable matching listings:\n${listingsText}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errText = await response.text();
    console.error("Anthropic API error", response.status, errText);
    return "Sorry, I had trouble putting that together — please try rephrasing your question.";
  }

  const data = await response.json();
  const text = data?.content?.find((b: any) => b.type === "text")?.text;
  return text || "Sorry, I had trouble putting that together — please try rephrasing your question.";
}

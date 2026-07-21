# 815local.com: Project Instructions for Claude

Last updated: May 25, 2026

---

## What this is

**815local.com** is a hyperlocal business directory and community hub for the 815 area code in northern Illinois. The active focus is three towns: **Minooka, Channahon, and Shorewood**. Other 815 towns (Morris, Coal City, Joliet, Elwood) are included opportunistically and surfaced separately under an "Around the 815" tab.

The project is live, pre-revenue, and solo-built by Ty. Decisions favor data integrity, local character, and slow deliberate growth over feature sprawl. There is no roadmap pressure to ship quickly.

---

## Operating principles

These shape every decision. When in doubt, fall back to these.

1. **Only real data, always.** No fabricated businesses, reviews, ratings, hours, or stats. If a section has no data, show a friendly empty state. This rule was learned the hard way. The original seed data was largely fake and had to be scrapped.
2. **Data integrity over visual completeness.** When data is missing, hide the UI. Don't fill a missing photo with a placeholder; hide the photo block entirely.
3. **Chains welcome, clearly labeled.** Chains are part of the community and locals frequent them, but they don't qualify as "local" and never appear in homepage featured slots.
4. **Three-town focus, 815 inclusive.** Minooka, Channahon, Shorewood are the core. Other 815 towns appear in their own tab with a teal "Serves the 815" badge.
5. **Grow before monetizing.** The advertise page is waitlist-only on purpose. Paid tiers come back once the directory is denser and the audience is real.
6. **Plain language, direct edits.** Ty prefers concise, plain explanations over over-engineered solutions. Skip preamble.

---

## Stack

| Layer | Technology |
|---|---|
| Frontend | Plain HTML/CSS/JS, no framework, no build step |
| Backend | Supabase (Postgres + Auth + Storage + Edge Functions) |
| Hosting | Cloudflare Pages, auto-deploy from GitHub `main` |
| Data source | Google Places API (New, v1) |
| Tests | Playwright (E2E) |
| Repo | `github.com/typommier/815local` (public) |
| Local working dir | `C:\Users\typom\Desktop\815 Local\` (Ty's Windows machine) |
| Contact email | `815local@gmail.com` |

### Supabase connection (project ID `kyneaettrynagavewefi`)
- URL: `https://kyneaettrynagavewefi.supabase.co`
- Anon key (frontend, RLS-enforced):
  `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk`
- JS SDK via CDN: `https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2`

When working on the main directory/site data, use `project_id: kyneaettrynagavewefi`. There is a second, separate Supabase project for the concierge chat widget (see below) — use `project_id: ubcagczbnxfpoligmsqq` only when working on that system specifically. Don't mix the two up.

---

## Concierge chat widget ("Scout", separate Supabase project)

**Status: pulled from the live site (July 21, 2026).** Ty found it was
producing incorrect information and didn't want it live until that's
resolved. The `<script src="/assets/js/815local-widget.js">` tag has been
removed from every page it was on (`index.html`, `pages/{about,blog,business,
deals,directory,events}.html`, `pages/blog/origin-story.html`), so the
launcher no longer renders anywhere. The widget script, the edge function,
and the `815local-concierge` Supabase project are all untouched, only the
site-side wiring was removed, so it can be re-enabled by re-adding the
script tags once the underlying accuracy problem is diagnosed and fixed.
The offline/live test harness (`npm run test:concierge`) and the dead
`tests/e2e/scout-widget.spec.js` Playwright spec (removed, since it drove
`#ol-launcher` which no longer exists on any page) are the relevant test
notes. Don't re-add the widget without first figuring out what was giving
bad answers.

A chat bubble (bottom-right, on public pages), named **Scout**, that lets
visitors ask about business hours, get recommendations ("best tacos in
town"), or find a service provider. Answers only from real `listings` rows,
never invented. Built July 2026, runs on its **own** Supabase project,
independent of the main directory database.

- **Supabase project**: `815local-concierge` (ref `ubcagczbnxfpoligmsqq`),
  same org as the main project (`avvujmfsxzrmnuekpjsq`), region us-east-1.
  This is a **different project ID** than the main site's
  `kyneaettrynagavewefi` — don't point MCP calls at the wrong one.
- **Tables**: `listings` (name, category, tags, area, address, phone,
  website, hours_json, description, price_range, rating, featured) and
  `unmet_requests` (logs questions the widget couldn't match to a
  listing — a running list of unmet demand, useful for business
  recruitment).
- **Edge Function** `chat`, live at
  `https://ubcagczbnxfpoligmsqq.supabase.co/functions/v1/chat`. Source is
  tracked in this repo across two files: `supabase/functions/chat/index.ts`
  (the impure shell: serving, `listings` fetch, rate limiting, the Anthropic
  call) and `supabase/functions/chat/logic.ts` (all pure decision logic:
  tokenizing, matching, named lookup, hours formatting, the branch tree).
  `logic.ts` imports nothing from `Deno.*`/`jsr:` so it runs unchanged under
  the offline test harness (see Testing). Committing these files does **not**
  deploy them, this project has no CI wired to the concierge Supabase project;
  deploy both manually together (Supabase MCP `deploy_edge_function` or
  `supabase functions deploy chat`) whenever either changes. Deployed function
  version 15 as of July 2026. POST
  `{ "message": "...", "history"?: [{role, content}, ...], "lastCandidates"?: [{name}, ...] }`,
  response `{ "reply": "...", "candidates": [{name, area, url}, ...] }`. `url`
  (built from `listings.business_id`) links back to the business's real
  directory page, rendered by the widget as a real `<a>` element, never
  something Claude writes into its own reply text.
  Conversation memory is page-load scoped: the widget tracks `history`
  and echoes back `lastCandidates` (the exact real businesses the server
  used last turn) so bare follow-ups ("any others?", "yes", "contact
  info") stay on the established topic instead of losing context or
  re-guessing from noisy prose. Direct lookups (hours/phone, for a named
  business or an inherited small candidate set) answer straight from the
  DB with no AI call; open-ended questions narrow candidates by
  keyword/tag/synonym match, then call Claude restricted to only
  recommending matched candidates.
- **Widget script**: `assets/js/815local-widget.js`, vanilla JS, no
  dependencies, styled in site branding. Wired in via a `<script>` tag
  before `</body>` on `index.html` and `pages/{about,blog,business,
  deals,directory,events}.html` and `pages/blog/origin-story.html`.
  Not on `profile.html`, `advertise.html`, `submit/*.html`, `legal/*.html`,
  or `404.html`.
- **Branding**: named Scout as of July 2026. Logo is a compass-motif mark
  at `uploads/scout-icon.svg`, used for both the launcher button and the
  panel header mark. Colors (`#C4622D` orange, `#F4EDE1` cream, `#3A3532`
  charcoal) are set as the widget's `BURNT_ORANGE`/`CREAM`/`CHARCOAL`
  constants; the orange matches the main site's `--orange` design-system
  color exactly. Scout auto-opens and greets once per browsing session
  (`sessionStorage` key `ol_scout_auto_opened`), after a ~2.5s delay, then
  stays quiet (but still clickable) for the rest of that session.
- **Status**: the `ANTHROPIC_API_KEY` secret is **confirmed working** as of
  July 2026 (verified live against the deployed function: a multi-candidate
  query returns a real conversational Claude reply, not the templated
  fallback). If AI replies ever revert to the plain "Here's what I found in
  the directory:" list, the key is missing/invalid again, reset it in Supabase
  dashboard → `815local-concierge` → Edge Functions → Manage secrets → exact
  name `ANTHROPIC_API_KEY`, then redeploy. Direct hours/phone lookups work
  regardless since they bypass the Claude call.
- **Reliability hardening (July 2026)**: the function now has a per-IP
  rate limit (30 req/min, via the `chat_rate_limits` table +
  `check_chat_rate_limit` RPC, fails open), a 12s Anthropic timeout with
  retry on transient errors, a 300-char cap on the incoming message, a
  column-scoped `select` with a 1000-row cap warning, and strict
  history-alternation sanitizing. `hours_json` in `listings` uses
  **abbreviated day keys** (`mon`/`tue`/.../`sun`), so `formatHours` maps
  both abbreviated and full day names (an earlier bug filtered only full
  names and returned blank hours for every listing).
- **CORS**: locked to `https://815local.com` (and `https://www.815local.com`)
  as of July 2026, echoing the request origin from an allowlist. Add a host
  to `ALLOWED_ORIGINS` in `index.ts` (and redeploy) if the widget ever runs
  on another domain.
- **`listings` data**: 185 rows as of July 2026 (this had drifted stale
  in project notes, checked directly against the DB), not synced with
  the real `businesses` table (117 rows). Still worth a real import to
  keep the two from diverging further, see Open Work.

---

## File structure (live, as of May 25, 2026)

The structure has been refactored since earlier sessions. Root-level `815local-*.html` files at the repo root are **redirect stubs** that send visitors to the real files under `/pages/`. Do not edit the stubs except to update the redirect target.

```
/
├── index.html                          ← homepage (the real one)
├── 404.html                            ← custom 404 page
├── sitemap.xml
├── robots.txt
├── package.json                        ← Playwright + serve dev deps
├── playwright.config.js
├── .gitignore
│
├── assets/
│   └── js/
│       └── analytics-tracker.js        ← client-side localStorage analytics
│
├── uploads/                            ← logo + brand assets
│
├── pages/
│   ├── directory.html                  ← browse all businesses
│   ├── business.html                   ← business detail (?id=<uuid>)
│   ├── events.html                     ← events calendar
│   ├── deals.html                      ← deals listings
│   ├── profile.html                    ← logged-in user profile
│   ├── advertise.html                  ← waitlist-only advertise page
│   ├── about.html
│   ├── blog.html                       ← blog index
│   ├── blog/
│   │   └── origin-story.html
│   └── submit/
│       ├── business.html               ← submit new business (wired to DB)
│       ├── event.html                  ← submit event
│       ├── deal.html                   ← submit deal
│       └── claim-business.html         ← business owner claim request
│
├── legal/
│   ├── privacy.html
│   └── terms.html
│
└── tests/
    └── e2e/
        ├── homepage.spec.js
        ├── directory.spec.js
        ├── business-detail.spec.js
        └── fixtures/
            └── supabase-mock.js
```

### Redirect stubs (do not edit content, only update if `/pages/` path changes)
- `/815local-homepage.html` → `/index.html`
- `/815local-directory.html` → `/pages/directory.html`
- `/815local-business.html` → `/pages/business.html`
- `/815local-events.html` → `/pages/events.html`
- `/815local-profile.html` → `/pages/profile.html`
- `/815local-submit-business.html` → `/pages/submit/business.html`
- `/815local-blog.html` → `/pages/blog.html`
- `/815local-wireframes.html` → (still exists at root, not in nav)

### Removed/deprecated
- `815local-analytics.html`. The dashboard is gone. The tracker script `assets/js/analytics-tracker.js` still records page views to localStorage, but no UI surfaces it.

### Local-only (not in repo)
- `fetch_photos.py` / `fetch_photos_local.py` - Google Places photo scrapers. Run locally from Ty's machine because the scraper API key cannot be used server-side and the sandboxed environment can't reach `places.googleapis.com`.

---

## Database schema (live, public schema)

12 tables, all backed by RLS policies. Plus one view (`businesses_with_ratings`) and one stats function (`get_homepage_stats`).

### Core tables

**`businesses`** (25 columns). The heart of the directory.
Key columns:
- `id` (uuid, PK), `name`, `category`, `subcategory`, `description`
- `address`, `city`, `state` ('IL'), `zip`
- `phone`, `website`, `order_url`
- `price_range` ('$', '$$', etc.)
- `hours` (JSONB, see format below)
- `features` (text[] - tags including the `"Chain"` flag)
- `image_url` (single hero/card image), `photos` (text[] up to 5 Google Places URLs), `photo_positions` (text[] CSS object-position values)
- `google_place_id`
- `is_featured`, `is_active`, `is_locally_owned`, `is_claimed`
- `story` (long-form owner story)
- `created_at`

**`reviews`** (13 columns). Moderated review system with rate limiting, IP/email blocking, and a flagging workflow. Visible reviews query against `is_flagged IS NOT TRUE`.

**`events`** (21 columns). Community events. `is_active = false` is the pending-review queue.

**`deals`** (13 columns). Same pattern as events.

**`profiles`** (8 columns). Extends Supabase Auth users (display_name, avatar_url, etc.). New users autopopulate via the `handle_new_user` trigger.

**`saved_businesses`**. Users bookmark businesses.

**`claim_requests`** (14 columns). Business owners requesting verified ownership of a listing.

### Supporting tables
- `advertise_waitlist`. Captures interest until paid tiers return
- `newsletter_subscribers` (email-only, 6 subs as of last check)
- `blog_notify`. Blog launch notification list
- `blocked_emails`, `blocked_ips`. Abuse protection tables
- (Plus two admin views: `flagged_reviews_admin`, `recent_reviews_admin`)

### View

**`businesses_with_ratings`** joins `businesses` with aggregated review data (`avg_rating`, `review_count`). **Always query this view, not `businesses` directly**, when displaying ratings.

### Functions

- `get_homepage_stats()` RPC powering all homepage trust-bar counts. Never hardcode these.
- `check_review_rate_limit()` abuse protection on review writes.
- `block_banned_email()`, `handle_new_user()`, `handle_updated_at()` triggers.

### Database constraints (enforced at the DB layer)
- `no_chain_featured` chains can never be `is_featured = true`
- `no_chain_locally_owned` chains can never be `is_locally_owned = true`

These two constraints exist specifically because both have been violated in past data work. Trust them; don't try to bypass.

### Hours format (JSONB)
```json
{
  "monday":    "9:00 AM - 5:00 PM",
  "tuesday":   "9:00 AM - 5:00 PM",
  "wednesday": "9:00 AM - 5:00 PM",
  "thursday":  "9:00 AM - 5:00 PM",
  "friday":    "9:00 AM - 5:00 PM",
  "saturday":  "10:00 AM - 2:00 PM",
  "sunday":    "Closed"
}
```
All seven days present. Use `"Closed"` or `"By Appointment"` where applicable. **No em-dashes anywhere in stored data.**

### Features array
Short human-readable tags. Special-purpose tags:
- `"Chain"` required on national/regional chains
- Common tags: `"Free WiFi"`, `"Takeout Available"`, `"Dog Friendly"`, etc.

Insert as PostgreSQL array literal: `ARRAY['Tag One','Tag Two']` or `'{"Tag One","Tag Two"}'`.

---

## Frontend patterns

### Supabase init (on every page that touches data)
```javascript
const SUPABASE_URL = 'https://kyneaettrynagavewefi.supabase.co';
const SUPABASE_KEY = '<anon key>';
const { createClient } = supabase;
const db = createClient(SUPABASE_URL, SUPABASE_KEY);
```

### Querying businesses
```javascript
const { data } = await db
  .from('businesses_with_ratings')
  .select('*')
  .eq('is_active', true)
  .order('is_featured', { ascending: false });
```

### Directory tab segregation (already shipped, do not rebuild)
The directory has three tabs powered by client-side filtering:
- **🏡 Local Businesses** (non-chain, in core towns)
- **🔗 Chains** (anything tagged `Chain`)
- **📍 Around the 815** (outside core towns)

Implemented via:
```javascript
const HOME_TOWNS = new Set(['minooka', 'channahon', 'shorewood']);
function isAroundThe815(b) {
  const c = (b.city || '').trim().toLowerCase();
  return c.length > 0 && !HOME_TOWNS.has(c);
}
```

Cards for `isAroundThe815(b) === true` get a teal `area-served-badge` (`#0E7490` background, `📍 Serves the 815`). The badge logic is in `pages/directory.html`. If you ever add Morris or another town to the core focus, just add it to `HOME_TOWNS`.

### Auth flow
Full Supabase Auth (signInWithPassword, signUp, resetPasswordForEmail, signOut). Auth UI is an overlay modal on `index.html`. New users get a row in `profiles` automatically via the `handle_new_user` trigger.

### Star rendering
```javascript
function starsHtml(rating) {
  const full = Math.round(rating);
  return '★'.repeat(full) + '☆'.repeat(5 - full);
}
```

### Category emoji map (used across pages)
```javascript
const catEmoji = {
  'Food & Drink':         '🍔',
  'Coffee':               '☕',
  'Bars & Nightlife':     '🍺',
  'Health & Wellness':    '💆',
  'Beauty & Salons':      '💇',
  'Retail & Shops':       '🛍️',
  'Home Services':        '🔧',
  'Arts & Events':        '🎭'
};
```

### Page labels (analytics tracker)
`index.html`, `business.html`, `directory.html`, `events.html`, `profile.html` are the tracked pages. The tracker writes to `localStorage`, no server logging.

---

## Design system

- **Primary:** Burnt orange `--orange: #C4622D`
- **Background:** Cream `--cream: #F7F1E3`, `--cream-dark: #EDE4CF`
- **Text:** Dark charcoal `--charcoal`
- **Accent (Around the 815 badge):** Teal `#0E7490`
- **Accent (Owner Verified badge):** Forest green `#2D6A4F`
- **Fonts:** Plus Jakarta Sans (body), Playfair Display (display), Caveat Brush (logo/brand)
- Mobile bottom nav exists on most pages alongside the desktop top nav

---

## Data sourcing

### Google Places API (New, v1)
- Endpoint: `POST https://places.googleapis.com/v1/places:searchText`
- Auth: `X-Goog-Api-Key` header
- Field mask: `X-Goog-FieldMask` (all fields prefixed with `places.`) (e.g. `places.displayName,places.formattedAddress`)
- Pagination: mandatory **2-second delay** between `nextPageToken` requests
- Enterprise SKU pricing kicks in when including `regularOpeningHours`, `nationalPhoneNumber`, or `websiteUri`. Design queries accordingly.

### Two API keys
- **Frontend key** (`AIzaSyDODOqjj5L4Xqrd16tbWiBUGbkbwzbC4bM`) (domain-restricted, browser-only), cannot be used server-side.
- **Scraper key**. Used by `fetch_photos.py` on Ty's local machine. Claude's sandbox **cannot reach `places.googleapis.com`**, so all scraping is done locally.

### Business inclusion rules
- ✅ Locally owned businesses in Minooka, Channahon, or Shorewood
- ✅ National/regional chains in those towns (mark with `"Chain"` in features, set `is_locally_owned = false`)
- ✅ Businesses in other 815 towns that **serve** the core area (mobile/in-home services especially)
- ❌ Closed businesses (set `is_active = false`)
- ❌ Destination businesses outside the 815 with no real connection to the area

A dead/non-resolving website is a strong signal a business has closed.

---

## Working patterns

### How Ty likes to work
- Plain-language explanations, no over-engineering
- Direct edits, no excessive permission-asking
- Verify assumptions before changing things, especially around files (the "is `index.html` the homepage or is it `815local-homepage.html`" lesson cost real time)
- Push back when the request would create work that's already been done

### Supabase changes
- Use MCP tools directly (`apply_migration`, `execute_sql`). Don't generate SQL files for manual execution unless the MCP tools fail.
- Migrations get named in `snake_case` (e.g. `no_chain_locally_owned_constraint`).
- For abuse-protection RLS patterns: enable RLS, public anon INSERT for user content, public read filtered to `is_active = true` for moderated content.

### HTML edits
- Use Python `str.replace()` scripts when bulk-editing complex template literals or JS blocks. More reliable than `sed` or single `str_replace` calls for HTML.
- Verify with `grep -n` targeting the function or string pattern before delivering files.
- Files are delivered via `/mnt/user-data/outputs/`.

### Deployment
1. Edit files in `C:\Users\typom\Desktop\815 Local\` on Ty's machine
2. `git add`, `git commit -m "..."`, `git push` from that folder
3. Cloudflare Pages auto-deploys from `main`

### Hard-won gotchas
- **Empty array check:** `array_length(photos, 1) IS NULL OR array_length(photos, 1) = 0`. A simple `photos IS NULL` misses empty arrays.
- **Boolean nullability:** `is_flagged = false` excludes NULL rows; use `IS NOT TRUE` or handle NULLs explicitly.
- **No em-dashes anywhere.** Not in stored data, not in copy, not in messages, not in commits. Use periods, commas, parentheses, or rephrase.
- **JS string safety:** Apostrophes/smart quotes inside single-quoted JS literals cause silent syntax errors. Use double quotes or escape carefully.
- **Supabase SDK in sandboxed contexts:** If the JS SDK throws `DataCloneError`, fall back to plain `fetch()` against the REST API with `apikey` and `Authorization: Bearer` headers.
- **Homepage stats are RPC-driven.** Never hardcode counts; always read from `get_homepage_stats()`.

---

## Testing

Playwright E2E tests live under `tests/e2e/`. Run with:
```bash
npm test              # CI / list reporter
npm run test:report   # HTML report
```

Tests mock Supabase via `tests/e2e/fixtures/supabase-mock.js` and serve the static site on `localhost:3000` via `npx serve`. Coverage as of now:
- Homepage (nav, hero, trust stats, community picks)
- Directory
- Business detail
- Scout widget (`tests/e2e/scout-widget.spec.js`: in-flight lock, error/timeout
  handling, https-only links, follow-up context) via a mocked chat endpoint

Add tests when shipping non-trivial frontend changes.

### Concierge (Scout) tests

The `chat` function's pure logic (`logic.ts`) has a dedicated harness that
imports the real module and runs a large adversarial query suite against a
committed snapshot of the real `listings` data (`tests/concierge/`). It needs
no browser or Supabase, just Node >= 22 (which strips TypeScript types on
import):
```bash
npm run test:concierge        # offline: matching, branching, hours, follow-ups
SCOUT_LIVE=1 npm run test:concierge:live   # live: hits the deployed endpoint
```
The live suite is skipped unless `SCOUT_LIVE=1` and must run from a network
that can reach the Supabase functions host. To refresh the data snapshot after
`listings` changes materially, re-pull it into
`tests/concierge/listings.snapshot.json` (`select * from listings order by id`
on the concierge project). Run the offline suite after any edit to `logic.ts`.

---

## Current state snapshot (May 25, 2026)

- **117 active businesses** (74 Minooka, 22 Channahon, 16 Shorewood, 5 around the 815)
- **86 locally owned, 28 chains, 3 unclassified**
- **6 organic reviews** (none flagged)
- **6 newsletter subscribers**, 1 approved business claim
- **8 upcoming events**, no pending events
- **23 businesses missing photos**, 13 missing phones, 27 missing websites
- **No active deals**

---

## Open work

These are the genuinely outstanding items. Items previously on this list that have been quietly completed (Submit Business form, meta/OG tags, 404 page, "Serves the 815" badge) are off.

### Data quality
- Fill missing photos for the 20 local businesses that lack them (chains less urgent since they're not on the homepage anyway)
- Fill missing phone numbers (13)
- Resolve the 3 businesses with `is_locally_owned IS NULL` (should be classified one way or the other)
- (Done July 2026) Verified Taco Fixx is in the DB (both the main `businesses`
  data and the concierge `listings` table, Minooka, with real hours)

### Growth
- Scan Shorewood for missing additions (only 16 businesses vs. Minooka's 74)
- Seed reviews from friends/family to push above 10
- Build up event and deal listings

### SEO / discoverability
- Confirm sitemap is submitted to Google Search Console
- Add `<lastmod>` dates to sitemap URLs
- Add `/pages/profile.html` exclusion (or leave as not-indexed; it's already absent from sitemap, which is correct)

### Code maintenance
- Shared nav/footer components to eliminate copy-paste across HTML files
- Newsletter export to Mailchimp/Resend (infrastructure exists via `newsletter_subscribers` table)
- Reintroduce paid advertising tiers once directory density supports it

### Concierge widget
- (Done July 2026) `ANTHROPIC_API_KEY` confirmed working; CORS locked to
  `https://815local.com`; a full reliability pass fixed the follow-up
  topic-hijack bug, the blank-hours bug, missing timeouts/retries, and
  added rate limiting plus an offline+live test harness (see Testing). The
  `chat` function was refactored into `index.ts` + `logic.ts`.
- `listings` (185 rows) now has a `business_id` column linking every row to
  its real `businesses.id` (backfilled July 2026, near-100% match via phone
  number plus name+city fallback), used to render a real link back to the
  business's directory page in chatbot replies. Still worth a proper import
  pipeline so the two tables stop being maintained independently.
- Periodically review `unmet_requests` on the concierge project for
  business-recruitment leads
- **55 of 185 `listings` rows (30%) have empty `tags` and a generic
  boilerplate `description`** ("[Category] business located in [City], IL.")
  with no real, matchable content, found via a full directory audit (July
  2026). The chatbot can never legitimately recommend these since there's
  nothing true to say about them. Worst hit: Professional Services (22/35,
  including nearly every insurance agent, eye doctor, and most law offices
  and CPAs), Kids & Family (9/10), and four single-listing categories that
  are 100% boilerplate (Storage, Body Art, Lodging, Car Wash). Needs real
  tags/descriptions entered, same as the photo backlog above; not something
  that can be fixed in code.

---

## Things to remember

- **The repo is now public** as of May 25, 2026. Don't put secrets in it.
- **Memory and Project instructions can drift.** When in doubt about the current state of files or features, check the actual repo before making changes or recommendations.
- **Cloudflare Pages, not Netlify.** Netlify was the original host but the project moved.
- **No em-dashes in any written content, ever.**
- **Banned copy phrase:** never use "actually deserves" (e.g. "a website your local business actually deserves") in any copy. Ty dislikes it.

# 815local Weekly Newsletter Email

The master template for the weekly newsletter sent to the `newsletter_subscribers`
list. It is **not** a web page. Nothing here is served to browsers, linked from the
site, or listed in the sitemap. Keep it isolated under `email/`.

Files:

- `newsletter-weekly.html` : the master template. Contains every section and only
  `{{merge_tags}}`. No real or invented business names.
- `README.md` : this file.

## Status

The template is ready to populate. The populate/send pipeline and the unsubscribe
endpoint are **not built yet**. Do not run a real campaign until the items under
"Before any real send" are done.

## Design

On-brand with the live site (tokens read from `index.html` `:root`, not the stale
CLAUDE.md design section). The live fonts are Space Grotesk (display) and Inter
(body); email clients are unreliable about web fonts, so web-safe fallback stacks
carry the layout and the Google Fonts `<link>` is progressive enhancement only.

- orange `#C4622D`, orange-deep `#A44C1E`, ember `#E07A48`
- ink `#221A17`, bone `#FBF6EA`, cream `#F1E7D2`, cream-soft `#F7EFDD`
- teal `#0E7490` (Serves the 815), forest `#2D6A4F` (Owner Verified)
- Signature pill: 2px ink border, hard offset shadow `5px 5px 0`. The true CSS
  shadow fails in Outlook, so it is emulated with a 2px-offset ink table cell
  behind the pill.
- CTA band uses the site diagonal-stripe texture via the `<style>` block, with a
  solid orange `bgcolor` fallback for clients that drop gradients.

Table-based layout, 600px wide, inline CSS, MSO/Outlook conditional comments,
bulletproof VML button, mobile media queries, partial dark-mode handling.

## Merge fields

ESP-agnostic Handlebars-style `{{snake_case}}` tags. Convert to your ESP at
adoption time (see "ESP conversion" below).

### Scalars (one value per issue)

| Tag | Meaning | Example |
|---|---|---|
| `{{preheader_text}}` | Hidden inbox preview line | New spots, deals, and what is on this weekend. |
| `{{issue_date}}` | Issue date, masthead | June 25, 2026 |
| `{{greeting_line}}` | Intro greeting | Hey neighbor, |
| `{{intro_line}}` | One short intro paragraph | (free text) |
| `{{mailing_address}}` | Physical postal address (CAN-SPAM, required) | (real PO box or street address) |
| `{{unsubscribe_url}}` | One-click unsubscribe link (placeholder, see below) | |
| `{{year}}` | Copyright year | 2026 |

Static URLs are hardcoded in the template (directory, events, business detail).

### Repeating blocks

Each repeating block is delimited by HTML comment markers. The populator clones
the single sub-template row between the markers once per source record and
substitutes the per-record tags.

- `<!-- BEGIN:new_spots -->` ... `<!-- END:new_spots -->`
  - `{{business_category_emoji}}`, `{{business_name}}`, `{{business_town}}`,
    `{{business_badge}}` (empty, or a badge span), `{{business_blurb}}`,
    `{{business_id}}` (used in the listing URL).
- `<!-- BEGIN:deals -->` ... `<!-- END:deals -->`
  - `{{deal_title}}`, `{{deal_discount}}`, `{{deal_business_name}}`.
- `<!-- BEGIN:events -->` ... `<!-- END:events -->`
  - `{{event_date_short}}`, `{{event_title}}`, `{{event_time}}`, `{{event_location}}`.

### Omittable sections

When a source array is empty, the populator must remove the **entire** wrapping
block, section header included. The site frequently has zero active deals, so this
is required, not optional. Do not leave a "no deals this week" placeholder.

- `<!-- BEGIN:deals_section -->` ... `<!-- END:deals_section -->`
- `<!-- BEGIN:events_section -->` ... `<!-- END:events_section -->`

The `new_spots` section is expected to always have content, so it has no section
toggle. If you ever expect it to be empty, wrap it the same way.

## Data sources (Supabase, project `kyneaettrynagavewefi`)

Pull live data weekly. Map columns to tags as below.

- **New spots** from the `businesses_with_ratings` view (query the view, not the
  `businesses` table). Filter `is_active = true`, exclude chains
  (`features` containing `"Chain"`), order by `created_at desc`, take the newest
  few. Map: `name` to `{{business_name}}`, `city` to `{{business_town}}`,
  `description` (trimmed) to `{{business_blurb}}`, `id` to `{{business_id}}`.
  - `{{business_category_emoji}}` from the category map below.
  - `{{business_badge}}`: Owner Verified (forest `#2D6A4F`) when `is_claimed`;
    Serves the 815 (teal `#0E7490`) when `city` is non-empty and not Minooka,
    Channahon, or Shorewood (the `isAroundThe815` rule in `pages/directory.html`).
    Otherwise empty.
- **Deals** from the `deals` table. Filter `is_active = true` and not expired
  (`expiry_date >= today`). Map: `title` to `{{deal_title}}`,
  `discount` to `{{deal_discount}}`, `business_name` to `{{deal_business_name}}`.
- **Events** from the `events` table. Filter `is_active = true` and
  `event_date >= today`, order by `event_date`, limit to the next few. Map:
  `event_date` to `{{event_date_short}}` (e.g. "JUN 27"), `title` to
  `{{event_title}}`, `start_time` to `{{event_time}}`, and `location_name`
  (optionally with `city`) to `{{event_location}}`.

### Category emoji map

```
Food & Drink        🍔
Coffee              ☕
Bars & Nightlife    🍺
Health & Wellness   💆
Beauty & Salons     💇
Retail & Shops      🛍️
Home Services       🔧
Arts & Events       🎭
```

(The live `index.html` currently inlines a subset; this is the full canonical set.)

## ESP conversion

The markup hardcodes no ESP. At adoption time:

- **Mailchimp**: find/replace `{{tag}}` with `*|TAG|*` merge syntax. Use
  `*|UNSUB|*` for `{{unsubscribe_url}}` and `*|CURRENT_YEAR|*` for `{{year}}`.
  Repeating blocks become a repeatable content block or are pre-rendered by the
  populator before import.
- **Resend / MJML / generic**: most engines consume `{{...}}` directly. The
  recommended path is to pre-render the full HTML with a small script (below) and
  hand finished HTML to `emails.send`, rather than relying on ESP-side templating
  for the repeating blocks.

## Send pipeline (not built yet)

Intended flow for a future Supabase Edge Function (sibling to existing
`supabase/functions/*`) or a small Node script:

1. Query the three sources above.
2. Substitute scalar tags, clone each repeating sub-template per record, and
   delete any empty `*_section` block.
3. Send the rendered HTML via the ESP to `newsletter_subscribers` filtered to
   `status = 'active'` (using the `status` / `unsubscribed_at` columns).

Building this is out of scope for the template itself.

## Before any real send

- [ ] Supply a real `{{mailing_address}}`. CAN-SPAM requires a valid physical
      postal address in every commercial email.
- [ ] Build a real unsubscribe endpoint and point `{{unsubscribe_url}}` at it.
      There is no endpoint yet. The DB already has `status` and `unsubscribed_at`
      on `newsletter_subscribers`; the endpoint should set
      `status = 'unsubscribed'` (the trigger stamps `unsubscribed_at`).
- [ ] Confirm `functions/sitemap.xml.js` does not enumerate `email/` (it does not
      today). Keep the template out of the sitemap and out of search indexing.

## Verification

1. Open `newsletter-weekly.html` in a browser to check layout, colors, and that no
   `{{tag}}` is malformed.
2. Lint the rules: search the file for em-dashes and for any hardcoded business
   name. Both should return nothing.
3. Paste the rendered HTML into Litmus or Email on Acid (or send a seed test):
   check the Outlook MSO button, the emulated offset-shadow pills, the stripe-band
   fallback, Gmail dark mode, and iOS.
4. Once a populator exists, render with a zero-deals dataset and confirm the whole
   `deals_section` disappears.
5. Send one populated test through mail-tester.com for a spam score and to confirm
   the CAN-SPAM elements (physical address, unsubscribe) are present.

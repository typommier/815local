# 815 Weekly (email newsletter)

The standing design and layout for the 815local email newsletter. Sent weekly
(Fridays) via **Resend**. This is an email, not a website page, so it is not
linked from the site and is not served by Cloudflare. Only the images it points
at are hosted on the site.

## Files

- `template.html` — the locked design. Copy this to start a new issue. Every
  editable spot is marked with a `[SLOT]` placeholder and an HTML comment.
- `archive/815-weekly-issue-05.html` — a real past issue (Crossroads Fest,
  July 31, 2026). Use it as a worked example of a filled-in template.

## Assets

All newsletter images live under `uploads/newsletter/` (that is how they end up
at `https://815local.com/uploads/newsletter/...` once pushed, since Cloudflare
Pages serves the repo).

- **`uploads/newsletter/815local-logo.png` is the one permanent asset.** It is
  the masthead logo and never changes. Do not rename or move it.
- **Every other image is per-issue** and lives in a dated folder named for the
  issue date: `uploads/newsletter/YYYY-MM-DD/`. Standard slot filenames:
  - `lead.png` — the wide hero image at the top (optional)
  - `biz-1.png`, `biz-2.png`, `biz-3.png` — the 88x88 thumbnails in
    "New on 815local"
  Keeping the same slot names each week means the template's image paths only
  need one thing changed: the date folder.

## Weekly process

1. Copy `template.html` to `archive/815-weekly-issue-NN.html` (next number).
2. Add this week's images to `uploads/newsletter/YYYY-MM-DD/` using the slot
   names above. The logo stays where it is.
3. In the new file, find/replace `__ISSUE_DATE__` with `YYYY-MM-DD`, then set
   `__NN__`, the issue date in the masthead, and the preheader.
4. Fill every `[SLOT]`. Delete any block marked `OPTIONAL` you are not using
   (lead image, weather, day-by-day, good-to-know, sponsor). Add or remove
   repeatable cards to match how many items you actually have.
5. Commit and push. Cloudflare deploys the images so their URLs resolve.
6. Paste the finished HTML into Resend and send. `{{{RESEND_UNSUBSCRIBE_URL}}}`
   in the footer is filled in by Resend automatically, leave it.

## Notes

- **Real content only**, same as the rest of the site. Only feature businesses,
  events, and details that are true. If there are fewer than three new
  businesses, run fewer cards.
- **No em-dashes in copy** (house rule). Use commas, periods, or parentheses.
  En-dashes in time ranges (`5&ndash;9 PM`) are fine and part of the design.
- **The email palette is its own thing.** It intentionally does not use the
  site's Warm Sage tokens. Core colors: near-black `#1B1B1F`, burnt orange
  `#D95A22`, cream `#FAF5EA`, page background `#E8E4DA`, body text `#2E2E33`.
  Georgia for headlines, Arial/Helvetica for body (email-safe). Do not
  "correct" these to the website's colors.
- **Layout is table-based on purpose.** That is what survives Outlook and Gmail.
  Keep the `role="presentation"` tables and inline styles; do not refactor to
  modern CSS layout.

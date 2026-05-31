# Sourdough You Know - Website Mockup (Design Option 3: "Modern Editorial / Minimal")

The **third design direction**, a clean, minimal, gallery/boutique look: lots of
white space, oversized light-weight serif headlines (Cormorant Garamond), tiny
letter-spaced labels, hairline rules, and a single quiet clay accent. The opposite
of decoration. Siblings:

- `../sourdough-you-know-mockup/`     - v1, warm rustic artisan
- `../sourdough-you-know-mockup-v2/`  - v2, bold farmers-market
- `../sourdough-you-know-mockup-v3/`  - v3, modern editorial (this folder)

Same five pages and identical real content across all three, so the owner can pick a
favorite. Fully self-contained: open it, share it, or deploy it on its own. No backend,
no build step, no shared assets with 815local.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home: hero, the self-serve cart, favorites, "more than bread", markets + story teasers |
| `menu.html` | Menu: sourdough loaves, sweet bakes, and the local-makers cart, with Order CTA |
| `about.html` | Our Story: the cottage bakery, values, and the marketplace cart |
| `events.html` | **Markets & Events**: full 2026 season schedule, June 7 vendor lineup, and the flyer gallery |
| `contact.html` | Find Us: cart days/hours, Order on Hotplate, Facebook, demo contact form |

Brand styling lives in **`assets/css/style.css`** (one file; edit the `:root` tokens to
retune). Shared behavior (mobile nav, flyer lightbox, "next market" highlight, demo form)
lives in **`assets/js/main.js`**.

## Preview it locally

```bash
cd sourdough-you-know-mockup-v3
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Add the farmers market flyers

Drop the two flyer images in `assets/img/` as:

```
assets/img/flyer-vendors.jpg     <- the June 7 vendor-lineup flyer
assets/img/flyer-schedule.jpg    <- the season-schedule flyer
```

Until then, the gallery shows a tidy placeholder and all flyer details still appear as
text on the Events page (the schedule is fully native, so nothing looks broken).

## Deploy side-by-side on Cloudflare Pages

Create a **third** Pages project (separate from v1/v2) so all three can be compared:

- Connect the `typommier/815local` repo, production branch **`sourdough-site`**.
- Framework preset **None**, build command empty.
- **Build output directory: `sourdough-you-know-mockup-v3`**
- Project name e.g. `sourdough-you-know-v3` gives `sourdough-you-know-v3.pages.dev`.

The v1 and v2 projects are untouched. All rebuild from the `sourdough-site` branch.

## Where the owner edits content

- **Accent color / palette:** tokens at the top of `assets/css/style.css` (`:root`).
- **Menu items & prices:** the `.menu-row` lines in `menu.html` (price says "add price").
- **Market dates:** the `.sched-row` lines in `events.html`. The "next market" highlight
  is automatic from each row's `data-date="YYYY-MM-DD"`.
- **Cart address / map:** placeholders in `contact.html`.
- **Photos:** anywhere with a `.ph` placeholder block, swap in a real `<img>` (spots are
  commented in the HTML, e.g. the wide hero figure in `index.html`).

## Real links wired in

- Order: <https://www.hotplate.com/sourdoughyouknow1>
- Facebook: <https://www.facebook.com/p/Sourdough-You-Know-61564619462863/>
- Market: Channahon Tractor Supply, 26829 W Eames St, Channahon, IL 60410

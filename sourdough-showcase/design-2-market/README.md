# Sourdough You Know - Website Mockup (Design Option 2: "Bold Farmers-Market")

This is the **second design direction** for the Sourdough You Know website, a bold,
playful, market-day look (chunky type, sticker badges, hard shadows, tomato/mustard/teal).
The first direction (warm rustic artisan) lives in the sibling folder
`../sourdough-you-know-mockup/`. Same pages, same real content, totally different vibe,
so the owner can pick a favorite.

It is fully self-contained: open it, share it, or deploy it on its own. No backend,
no build step, no shared assets with 815local.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home: hero, the self-serve cart, favorites, "more than bread", markets teaser, story teaser |
| `menu.html` | Menu: sourdough loaves, sweet bakes, and the local-makers cart, with Order CTA |
| `about.html` | Our Story: the cottage bakery, values, and the marketplace cart |
| `events.html` | **Markets & Events**: full 2026 season schedule, June 7 vendor lineup, and the flyer gallery |
| `contact.html` | Find Us: cart days/hours, Order on Hotplate, Facebook, demo contact form |

Brand styling lives in **`assets/css/style.css`** (one file controls the whole look,
change the tokens at the top to recolor). Shared behavior (mobile nav, flyer lightbox,
"next market" highlight, demo form) lives in **`assets/js/main.js`**.

## Preview it locally

No build step. Open `index.html` directly, or serve the folder:

```bash
cd sourdough-you-know-mockup-v2
python3 -m http.server 8000
# then visit http://localhost:8000
```

## Add the farmers market flyers

Drop the two flyer images in `assets/img/` as:

```
assets/img/flyer-vendors.jpg     <- the June 7 vendor-lineup flyer
assets/img/flyer-schedule.jpg    <- the season-schedule flyer
```

Until then, the gallery shows a tidy placeholder and all flyer details still appear
as text on the Events page, so nothing looks broken.

## Deploy side-by-side on Cloudflare Pages

Create a **second** Pages project (separate from the v1 one) so you can compare both:

- Connect the `typommier/815local` repo, production branch **`sourdough-site`**.
- Framework preset **None**, build command empty.
- **Build output directory: `sourdough-you-know-mockup-v2`**
- Project name e.g. `sourdough-you-know-v2` gives `sourdough-you-know-v2.pages.dev`.

Your v1 project (output dir `sourdough-you-know-mockup`) is untouched. Both auto-rebuild
from the `sourdough-site` branch.

## Where the owner edits content

- **Brand colors:** tokens at the top of `assets/css/style.css` (`:root`).
- **Menu items & prices:** the cards in `menu.html` (price tags say "add price").
- **Market dates:** the `.date-card` rows in `events.html`. The "next market" highlight
  is automatic from each card's `data-date="YYYY-MM-DD"`.
- **Cart address / map:** placeholders in `contact.html`.
- **Photos:** anywhere with a dashed placeholder, swap in a real `<img>` (spots are
  commented in the HTML, e.g. the hero in `index.html`).

## Real links wired in

- Order: <https://www.hotplate.com/sourdoughyouknow1>
- Facebook: <https://www.facebook.com/p/Sourdough-You-Know-61564619462863/>
- Market: Channahon Tractor Supply, 26829 W Eames St, Channahon, IL 60410

# Sourdough You Know - Website Mockup

A bespoke, multi-page website mockup for **Sourdough You Know, LLC**, the small-batch
cottage bakery in Minooka, IL. Built as a self-contained static site so it can be
previewed, shared, or deployed completely on its own. It is intentionally kept
**separate from 815local** and has no shared assets, backend, or dependencies.

## Pages

| File | Purpose |
|---|---|
| `index.html` | Home: hero, the self-serve cart, favorites, "more than bread", markets teaser, story teaser |
| `menu.html` | Menu: sourdough loaves, sweet bakes, and the local-makers cart, with Order CTA |
| `about.html` | Our Story: the cottage bakery, values, and the marketplace cart |
| `events.html` | **Markets & Events**: full 2026 season schedule, June 7 vendor lineup, and the flyer gallery |
| `contact.html` | Find Us: cart days/hours, Order on Hotplate, Facebook, demo contact form |

Shared brand styling lives in **`assets/css/style.css`** (one file controls the whole
look). Shared behavior (mobile nav, flyer lightbox, "next market" highlight, demo form)
lives in **`assets/js/main.js`**.

## Preview it locally

No build step. Either open `index.html` directly in a browser, or serve the folder:

```bash
cd sourdough-you-know-mockup
python3 -m http.server 8000
# then visit http://localhost:8000
```

or with Node: `npx serve` from inside the folder.

## Add the farmers market flyers

The Events page shows two flyers in a clickable gallery. Drop the two images in here:

```
assets/img/flyer-vendors.jpg     <- the June 7 vendor-lineup flyer
assets/img/flyer-schedule.jpg    <- the season-schedule flyer
```

Until those files exist, the gallery shows a tidy placeholder, and all the flyer
information (dates, vendors, food trucks, music) is still on the page as real text,
so nothing looks broken. JPG or PNG both work (keep the same filenames, or update
the `src`/`data-flyer` paths in `events.html`).

## Share it with the owner

It is fully self-contained, so you can simply **zip the `sourdough-you-know-mockup`
folder** and email it, or host it for free as its own project:

- **Cloudflare Pages / Netlify:** create a *new* project and drag-and-drop this folder.
  Do **not** point it at 815local's `main` branch; this is a standalone site.
- **GitHub Pages:** publish this subfolder from a branch.

## Where the owner edits content

Everything is plain HTML, easy to edit in any text editor:

- **Brand colors:** change the tokens at the top of `assets/css/style.css` (`:root`).
- **Menu items & prices:** edit the cards in `menu.html` (price slots say "add price").
- **Market dates:** edit the `.date-card` rows in `events.html`. The "next market"
  highlight is automatic based on each card's `data-date="YYYY-MM-DD"`.
- **Cart address / map:** fill the placeholders in `contact.html`.
- **Photos:** anywhere you see a dashed placeholder, swap in a real `<img>` (the spots
  are commented in the HTML, e.g. the hero in `index.html`).

## What's real vs. placeholder

- **Real:** business description, self-serve cart days/hours, Hotplate order link,
  Facebook link, and the entire farmers market schedule + vendor lineup (from the flyers).
- **Placeholder (owner fills in):** specific loaf names, prices, exact cart address,
  map embed, and hero/about photos. These are clearly marked so nothing fake ships.

## Real links wired in

- Order: <https://www.hotplate.com/sourdoughyouknow1>
- Facebook: <https://www.facebook.com/p/Sourdough-You-Know-61564619462863/>
- Market: Channahon Tractor Supply, 26829 W Eames St, Channahon, IL 60410

# Sourdough You Know - Website Concepts (Showcase)

One folder, one deploy, one link to share with the owner. The landing page
(`index.html`) is a "pick a design" chooser that links to three full website
concepts, each in its own self-contained subfolder:

```
sourdough-showcase/
├── index.html              <- chooser landing (share this)
├── design-1-rustic/        <- Warm rustic artisan
├── design-2-market/        <- Bold farmers-market
└── design-3-editorial/     <- Modern editorial / minimal
```

All three designs have the **same five pages and the same real content** (menu,
story, full 2026 farmers market schedule, June 7 lineup, flyer gallery,
Hotplate + Facebook links). Only the look differs.

## Preview locally

```bash
cd sourdough-showcase
python3 -m http.server 8000
# visit http://localhost:8000  -> chooser
```

## Deploy as ONE Cloudflare Pages project (recommended)

- Connect the `typommier/815local` repo, production branch **`sourdough-site`**.
- Framework preset **None**, build command empty.
- **Build output directory: `sourdough-showcase`**
- Project name e.g. `sourdough-you-know` gives one URL: `sourdough-you-know.pages.dev`.

That single URL shows the chooser, and the three designs live at
`/design-1-rustic/`, `/design-2-market/`, `/design-3-editorial/`. Send the owner
just the one link.

> If you previously started a Pages project pointed at the old folder names
> (`sourdough-you-know-mockup`, `-v2`, `-v3`), repoint its output directory to
> `sourdough-showcase` or delete it; the folders now live inside this showcase.

## The flyers

Each design reads the flyer images from its own `assets/img/`. Drop the two
files into **each** design you care about (or just the one the owner picks):

```
design-1-rustic/assets/img/flyer-vendors.jpg
design-1-rustic/assets/img/flyer-schedule.jpg
design-2-market/assets/img/...
design-3-editorial/assets/img/...
```

Until added, the Events page shows a placeholder and the schedule still reads
fine as text. (Once the owner picks a design, you only need to maintain that one.)

## After the owner picks

Tell me which design wins and I can promote it to be the main site (its own
clean folder / project), wire the contact form to a real inbox, and drop in real
photos and prices.

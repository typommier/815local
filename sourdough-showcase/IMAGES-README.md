# Where to drop the images

Right now only the **Modern Editorial** design (`design-3-editorial/`) is wired for
photos, so dropping files in takes zero code edits. (Designs 1 and 2 still show
their styled placeholders; say the word and I'll wire them the same way once a
direction is chosen.)

## For the Modern Editorial design

Drop these files into:

```
sourdough-showcase/design-3-editorial/assets/img/
```

```
hero.jpg            big homepage hero (landscape)   a crust/crumb or cart shot
story.jpg           our-story image (portrait)      you / the kitchen / hands in dough
market.jpg          a market-day photo (portrait)   your booth at the market
cart.jpg            the self-serve cart (portrait)
flyer-vendors.jpg   the June 7 vendor-lineup flyer
flyer-schedule.jpg  the season-schedule flyer
```

Each one auto-appears the moment the file exists; until then a tidy placeholder
shows and all the text content stays intact.

## Notes

- **JPG or PNG** both work. Keep names exactly as above, lowercase.
- **Orientation:** `hero.jpg` looks best landscape/wide; the rest look best
  upright/portrait.
- Don't worry about exact sizes, they crop to fit. Bigger is fine (aim for at
  least ~1200px on the long edge for crispness).
- Prefer different names? Just change the `src="..."` in the HTML.

## Handing me the files

If it's easier, give me the image files and I'll place them in the right folder,
verify, and push to `sourdough-site` so Cloudflare rebuilds automatically.

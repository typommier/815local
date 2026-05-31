# Where to drop the images

Quick guide for adding the flyers and photos. Everything auto-appears once the
files are in place, no code editing needed. Until then, tidy placeholders show.

## The fastest way

Put this set of files into **each** design's `assets/img/` folder:

```
hero.jpg            big homepage hero (landscape)   a crust/crumb or cart shot
story.jpg           our-story image (portrait)      you / the kitchen / hands in dough
market.jpg          a market-day photo (portrait)   your booth at the market
cart.jpg            the self-serve cart (portrait)
flyer-vendors.jpg   the June 7 vendor-lineup flyer
flyer-schedule.jpg  the season-schedule flyer
```

The three folders are:

```
sourdough-showcase/design-1-rustic/assets/img/
sourdough-showcase/design-2-market/assets/img/
sourdough-showcase/design-3-editorial/assets/img/
```

(Designs 1 and 2 only use `hero`, `story`, and the two flyers; design 3 also uses
`market` and `cart`. Dropping all six into all three is totally fine, the extras
are just ignored where unused.)

## Notes

- **JPG or PNG** both work. Keep names exactly as above, lowercase.
- **Orientation:** `hero.jpg` looks best landscape/wide; the rest look best
  upright/portrait.
- Don't worry about exact sizes, they're set to crop-to-fit. Bigger is fine
  (aim for at least ~1200px on the long edge for crispness).
- If you'd rather use different names, just change the `src="..."` in the HTML.

## Once you've added them

Commit and push to the `sourdough-site` branch (or hand the files to me and I'll
place + push them), and Cloudflare rebuilds in about a minute.

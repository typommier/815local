/* 815local photo crop rules, shared by the public pages and the admin tool.
 *
 * Every surface that cover-crops a business photo (listing hero, listing
 * thumbnails, phone swiper, directory cards, homepage cards, spotlight,
 * "nearby" cards) resolves its CSS background-position through this file, and
 * so does admin/edit-business-photos.html. Before this existed the rule was
 * copy-pasted into four pages that had quietly drifted apart, so the same
 * stored value framed a photo three different ways depending on where you
 * looked, and the admin preview matched none of them.
 *
 * Stored values live in businesses.photo_positions, indexed to match
 * businesses.photos. An empty string means "auto", nobody picked a focal
 * point. A value that IS stored, 'center' included, is honored literally on
 * every surface. Only the auto fallback varies, and it varies by surface
 * because the cells genuinely differ:
 *
 *   'hero'  the listing's 16:9 hero, its square thumbnails, its phone swiper,
 *           and the homepage hero banner. Much wider or much taller than a
 *           typical phone photo, so a cover crop trims hard on one axis.
 *           Anchoring to the top keeps heads and sign tops in frame instead
 *           of cutting evenly from both edges.
 *   'card'  directory and homepage cards (5:4), the spotlight, nearby cards.
 *           Barely wider than a 4:3 source, so there is little to trim and
 *           centering reads better than biasing.
 *
 * Picking a real focal point in the admin tool overrides both.
 *
 * No build step here: this is a plain global, loaded with a <script> tag in
 * <head> before the inline page scripts that call it.
 */
(function (global) {
  'use strict';

  var SAFE_POSITIONS = new Set([
    'center', 'top', 'bottom', 'left', 'right',
    'top left', 'top right', 'bottom left', 'bottom right',
    'left top', 'right top', 'left bottom', 'right bottom'
  ]);

  // What an unset (auto) photo_positions entry renders as, per surface.
  var FALLBACK = { hero: 'top', card: 'center' };

  function storedAt(positions, i) {
    var v = positions && positions[i];
    return typeof v === 'string' ? v.trim() : '';
  }

  // True when nothing deliberate is stored for photo i. Drives the admin
  // picker's "Auto" chip.
  function isAuto(positions, i) {
    return !SAFE_POSITIONS.has(storedAt(positions, i));
  }

  // The CSS background-position / object-position value for photo i on the
  // given surface ('hero' or 'card'). Unknown surface falls back to 'hero'.
  function positionFor(positions, i, surface) {
    var v = storedAt(positions, i);
    if (SAFE_POSITIONS.has(v)) return v;
    return FALLBACK[surface] || FALLBACK.hero;
  }

  // Inline style for a cover-cropped photo cell. The caller owns the box
  // (aspect-ratio, radius, overflow); this only paints it.
  function cellStyle(url, pos) {
    var safeUrl = String(url == null ? '' : url).replace(/'/g, "\\'");
    return "background-image:url('" + safeUrl + "');background-position:" + pos +
      ';background-size:cover;background-repeat:no-repeat;';
  }

  global.PhotoCrop = {
    SAFE_POSITIONS: SAFE_POSITIONS,
    FALLBACK: FALLBACK,
    isAuto: isAuto,
    positionFor: positionFor,
    cellStyle: cellStyle
  };
})(window);

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
 * point. Auto resolves to 'top' rather than 'center' because these cells are
 * wider than a typical phone photo, so a cover crop trims vertically, and
 * biasing to the top keeps the full top of the frame (heads, sign tops)
 * instead of cutting evenly from both edges.
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

  // What an unset (auto) photo_positions entry renders as.
  var AUTO_FALLBACK = 'top';

  function storedAt(positions, i) {
    var v = positions && positions[i];
    return typeof v === 'string' ? v.trim() : '';
  }

  // True when nothing deliberate is stored for photo i. Drives the admin
  // picker's "Auto" chip.
  function isAuto(positions, i) {
    return !SAFE_POSITIONS.has(storedAt(positions, i));
  }

  // The CSS background-position / object-position value for photo i.
  function positionFor(positions, i) {
    var v = storedAt(positions, i);
    return SAFE_POSITIONS.has(v) ? v : AUTO_FALLBACK;
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
    AUTO_FALLBACK: AUTO_FALLBACK,
    isAuto: isAuto,
    positionFor: positionFor,
    cellStyle: cellStyle
  };
})(window);

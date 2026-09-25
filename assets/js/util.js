// Shared front-end utilities for 815local.
(function (global) {
  function escapeHtml(value) {
    if (value === null || value === undefined) return '';
    // Entities are built with '&' + '...' so an editor or paste step that
    // decodes HTML entities can't silently turn this into a no-op again
    // (that is what commit ac0d8d6 did to this function).
    return String(value)
      .replace(/&/g, '&' + 'amp;')
      .replace(/</g, '&' + 'lt;')
      .replace(/>/g, '&' + 'gt;')
      .replace(/"/g, '&' + 'quot;')
      .replace(/'/g, '&' + '#39;');
  }

  function slugifyBiz(name, city) {
    var base = String(name || '')
      .toLowerCase()
      .replace(/&/g, ' and ')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    var town = String(city || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '');
    return town ? base + '-' + town : base;
  }

  function bizPath(b) {
    if (!b) return '/pages/directory.html';
    if (b.id && b.name) return '/b/' + slugifyBiz(b.name, b.city);
    if (b.id) return '/pages/business.html?id=' + encodeURIComponent(b.id);
    return '/pages/directory.html';
  }

  // Owner-supplied photos for recurring local events that almost never come
  // with an image of their own: Minooka football games and the Channahon
  // Farmers Market. eventPhoto(ev) returns { src, alt, pos } or null, where
  // pos is a CSS object-position / background-position focal point.
  // An event's own image_url always wins unless it is a generic placeholder.
  var EVENT_PHOTOS = {
    football: { src: '/uploads/event-football-minooka.jpg', alt: 'Minooka football under the lights', pos: 'center 70%' },
    market: [
      { src: '/uploads/event-channahon-market-1.jpg', alt: 'Channahon Farmers Market', pos: 'center 50%' },
      { src: '/uploads/event-channahon-market-2.jpg', alt: 'Channahon Farmers Market', pos: '62% 20%' }
    ]
  };
  var OTHER_TOWNS = /\b(minooka|shorewood|morris|joliet|coal city|elwood|plainfield|oswego|yorkville)\b/;

  function eventText(v) {
    return String(v || '').toLowerCase().replace(/[\u2018\u2019'`]/g, '').replace(/\s+/g, ' ').trim();
  }

  // Minooka varsity football: title names Minooka (or MCHS) and football.
  // Not flag/powder puff/youth football, and never the Aces car cruise.
  function isMinookaFootball(ev) {
    var t = eventText(ev && ev.title);
    if (!/\b(minooka|mchs)\b/.test(t)) return false;
    if (!/\bfootball\b/.test(t)) return false;
    if (/\baces\b/.test(t)) return false;
    return !/\b(flag|powder ?puff|youth|junior|jr|pee ?wee|fantasy)\b/.test(t);
  }

  // Channahon Farmers Market: a farmers market with Channahon in the title, or
  // one listed in Channahon whose title names no other town. Other towns'
  // markets (Minooka, Shorewood, ...) never match.
  function isChannahonMarket(ev) {
    var t = eventText(ev && ev.title);
    if (!/\bfarmers? market\b/.test(t)) return false;
    if (/\bchannahon\b/.test(t)) return true;
    return eventText(ev && ev.city) === 'channahon' && !OTHER_TOWNS.test(t);
  }

  // Week number counted from Monday 1970-01-05, from the YYYY-MM-DD string
  // (UTC math, so the visitor's time zone can't shift it).
  function weekIndex(dateStr) {
    var p = String(dateStr || '').split('-').map(Number);
    if (p.length < 3 || !p[0]) return 0;
    var days = Math.floor(Date.UTC(p[0], p[1] - 1, p[2]) / 86400000);
    return Math.floor((days - 4) / 7);
  }

  function isPlaceholderImage(url) {
    return /(placeholder|default[-_.]|no[-_]?image|coming[-_]?soon)/i.test(String(url || ''));
  }

  function eventPhoto(ev) {
    if (!ev) return null;
    if (ev.image_url && !isPlaceholderImage(ev.image_url)) {
      return { src: ev.image_url, alt: '', pos: 'center' };
    }
    if (isMinookaFootball(ev)) return EVENT_PHOTOS.football;
    if (isChannahonMarket(ev)) {
      // The market runs every other Sunday, so plain week parity would pick
      // the same photo every market day. Alternate on a two-week cycle
      // instead: same date, same photo; consecutive market days alternate.
      return EVENT_PHOTOS.market[((weekIndex(ev.event_date) >> 1) + 1) % 2];
    }
    return null;
  }

  global.escapeHtml = escapeHtml;
  global.slugifyBiz = slugifyBiz;
  global.bizPath = bizPath;
  global.eventPhoto = eventPhoto;
  global.isMinookaFootball = isMinookaFootball;
  global.isChannahonMarket = isChannahonMarket;
})(typeof window !== 'undefined' ? window : this);

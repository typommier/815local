/* Resolve an event photo from a matching listing. No stock images. */
(function (root) {
  function norm(s) {
    return String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  }
  function pickImg(b) {
    if (!b) return null;
    return b.image_url || (Array.isArray(b.photos) && b.photos[0]) || null;
  }
  const ALIASES = {
    'aces garage bar grill': 'aces garage bar grill',
    'aux sable springs park': 'aux sable springs park',
    'veterans dog park': 'veterans memorial park',
    "veteran's dog park": 'veterans memorial park'
  };
  function attach(events, listings) {
    const byName = {};
    (listings || []).forEach(function (b) {
      if (b && b.name) byName[norm(b.name)] = b;
    });
    (events || []).forEach(function (ev) {
      if (!ev || ev.image_url) return;
      const keys = [ev.location_name, ev.organizer].map(norm).filter(function (k) { return k.length > 3; });
      for (var i = 0; i < keys.length; i++) {
        var b = byName[keys[i]] || byName[ALIASES[keys[i]]];
        var img = pickImg(b);
        if (img) {
          ev.image_url = img;
          if (!ev.business_id && b) ev.business_id = b.id;
          return;
        }
      }
    });
    return events;
  }
  root.EventPhotos = { attach: attach, pickImg: pickImg, norm: norm };
})(window);

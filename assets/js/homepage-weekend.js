/* Homepage: this-week events as photo cards, right under the hero. */
(function () {
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  function fmtTime(t) {
    if (!t) return '';
    var parts = String(t).split(':');
    var h = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10) || 0;
    var ap = h >= 12 ? 'PM' : 'AM';
    var hr = ((h + 11) % 12) + 1;
    return hr + ':' + String(m).padStart(2, '0') + ' ' + ap;
  }

  function esc(s) {
    if (window.escapeHtml) return window.escapeHtml(s);
    return String(s || '').replace(/[&<>"']/g, function (c) {
      if (c === '&') return '&' + 'amp;';
      if (c === '<') return '&' + 'lt;';
      if (c === '>') return '&' + 'gt;';
      if (c === '"') return '&' + 'quot;';
      return '&#39;';
    });
  }

  function moveSection() {
    var upcoming = document.getElementById('upcoming-section');
    var hero = document.querySelector('section.hero');
    if (!upcoming || !hero || !hero.parentNode) return;
    if (hero.nextElementSibling === upcoming) return;
    hero.parentNode.insertBefore(upcoming, hero.nextSibling);
    var eye = upcoming.querySelector('.eyebrow');
    var title = upcoming.querySelector('.sec-title');
    if (eye) eye.textContent = 'This weekend';
    if (title) title.innerHTML = "What's on <em>around here</em>";
    upcoming.style.display = '';
    upcoming.classList.add('visible');
    var row = document.getElementById('upcoming-row');
    if (row) row.classList.add('weekend-row');
  }

  function cardHTML(e) {
    var d = e.event_date ? new Date(e.event_date + 'T00:00:00') : null;
    var place = e.location_name || e.city || '';
    var dateLabel = d ? (DAYS[d.getDay()] + ' ' + d.getDate()) : '';
    var media = e.image_url
      ? '<img class="wk-photo" src="' + esc(e.image_url) + '" alt="">'
      : '<div class="wk-fallback">' + (d ? d.getDate() : '') + '</div>';
    return '<a class="wk-card" href="/pages/events.html?event=' + encodeURIComponent(e.id) + '">' +
      media +
      '<div class="wk-shade"></div>' +
      '<div class="wk-txt">' +
        (dateLabel ? '<span class="wk-date">' + esc(dateLabel) + (e.start_time ? ' · ' + fmtTime(e.start_time) : '') + '</span>' : '') +
        '<h3>' + esc(e.title || 'Community event') + '</h3>' +
        (place ? '<p>' + esc(place) + '</p>' : '') +
      '</div></a>';
  }

  async function fillEvents() {
    var row = document.getElementById('upcoming-row');
    var section = document.getElementById('upcoming-section');
    if (!row || !window.supabase) return;
    try {
      var client = window.supabase.createClient(
        'https://kyneaettrynagavewefi.supabase.co',
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt5bmVhZXR0cnluYWdhdmV3ZWZpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY2MTQyNjYsImV4cCI6MjA5MjE5MDI2Nn0.M0II61ANo67dJk-8kz4VCkiwaI4uxdtIFsLI0aR0uZk'
      );
      var today = new Date().toISOString().slice(0, 10);
      var res = await client.from('events').select('id,title,event_date,start_time,location_name,city,image_url').eq('is_active', true).gte('event_date', today).order('event_date', { ascending: true }).limit(3);
      var events = res.data || [];
      if (!events.length) return;
      row.classList.add('weekend-row');
      row.innerHTML = events.map(cardHTML).join('');
      if (section) {
        section.style.display = '';
        section.classList.add('visible');
      }
    } catch (err) {
      console.warn('homepage-weekend events', err);
    }
  }

  function boot() {
    document.body.classList.add('home');
    moveSection();
    fillEvents();
    var row = document.getElementById('upcoming-row');
    if (row && window.MutationObserver) {
      var obs = new MutationObserver(function () { moveSection(); });
      obs.observe(row, { childList: true });
      setTimeout(function () { obs.disconnect(); fillEvents(); }, 4000);
    } else {
      setTimeout(fillEvents, 2500);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

/* Homepage: this-week events first, photos when we have them.
   Does not require rewriting index.html. */
(function () {
  var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var DAYS = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

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
      return ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'})[c];
    });
  }

  function moveSection() {
    var upcoming = document.getElementById('upcoming-section');
    var stats = document.querySelector('section.stats');
    if (!upcoming || !stats || !stats.parentNode) return;
    if (upcoming.nextElementSibling === stats) return;
    stats.parentNode.insertBefore(upcoming, stats);
    var eye = upcoming.querySelector('.eyebrow');
    var title = upcoming.querySelector('.sec-title');
    if (eye) eye.textContent = 'This week in the 815';
    if (title) title.innerHTML = 'What is happening <em>around here</em>';
    upcoming.style.display = '';
    upcoming.classList.add('visible');
  }

  function cardHTML(e) {
    var d = e.event_date ? new Date(e.event_date + 'T00:00:00') : null;
    var place = e.location_name || e.city || '';
    var meta = [e.start_time ? fmtTime(e.start_time) : '', place].filter(Boolean).join(' \u00b7 ');
    var media = e.image_url
      ? '<div class="fresh-photo"><div style="width:100%;height:100%;background:url(\'' + esc(e.image_url) + '\') center/cover no-repeat;"></div><span class="fresh-new">' + (d ? MONTHS[d.getMonth()] + ' ' + d.getDate() : '') + '</span></div>'
      : '<div class="ev-date"><span class="ev-mon">' + (d ? MONTHS[d.getMonth()] : '') + '</span><span class="ev-day">' + (d ? d.getDate() : '') + '</span><span class="ev-dow">' + (d ? DAYS[d.getDay()] : '') + '</span></div>';
    return '<a class="fresh-card" href="/pages/events.html?event=' + encodeURIComponent(e.id) + '">' +
      media +
      '<div class="fresh-body">' +
        '<div class="fresh-cat">' + esc(place || 'Event') + '</div>' +
        '<div class="fresh-name">' + esc(e.title || 'Community event') + '</div>' +
        (meta ? '<div class="fresh-meta">' + esc(meta) + '</div>' : '') +
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
      var res = await client.from('events').select('id,title,event_date,start_time,location_name,city,image_url').eq('is_active', true).gte('event_date', today).order('event_date', { ascending: true }).limit(8);
      var events = res.data || [];
      if (!events.length) return;
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
    moveSection();
    fillEvents();
    // Homepage fills the strip later; move again after it lands.
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

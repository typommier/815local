/* Homepage: this-week events as photo cards, right under the hero. */
(function () {
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  if (!document.getElementById('wk-poster-css')) {
    var st = document.createElement('style');
    st.id = 'wk-poster-css';
    st.textContent = '.wk-card .wk-fallback{width:100%;height:280px;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding:22px 20px;gap:2px;position:relative;overflow:hidden;font-size:inherit;color:#fff;background:radial-gradient(120% 80% at 100% 0%,rgba(255,215,176,.22),transparent 55%),repeating-linear-gradient(-28deg,transparent 0 14px,rgba(255,255,255,.05) 14px 15px),linear-gradient(165deg,#3a322c,#141414)}.wk-card .wk-fallback::after{content:\"\";position:absolute;left:0;right:0;bottom:0;height:4px;background:#e05a12}.wk-fallback .wk-kicker{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#ffd7b0;position:relative;z-index:1}.wk-fallback .wk-bigday{font-family:Georgia,serif;font-size:4.2rem;line-height:.9;font-weight:500;color:#fff;position:relative;z-index:1}.wk-fallback .wk-mon{font-size:13px;font-weight:700;letter-spacing:.18em;color:rgba(255,250,244,.7);position:relative;z-index:1}.wk-t-sports{background:radial-gradient(90% 70% at 110% 10%,rgba(224,90,18,.35),transparent 50%),repeating-linear-gradient(-28deg,transparent 0 14px,rgba(255,255,255,.05) 14px 15px),linear-gradient(165deg,#3a2418,#141414)}.wk-t-market{background:radial-gradient(90% 70% at 110% 10%,rgba(91,122,87,.4),transparent 50%),repeating-linear-gradient(-28deg,transparent 0 14px,rgba(255,255,255,.05) 14px 15px),linear-gradient(165deg,#243028,#141414)}.wk-t-music,.wk-t-festival{background:radial-gradient(90% 70% at 110% 10%,rgba(176,70,80,.4),transparent 50%),repeating-linear-gradient(-28deg,transparent 0 14px,rgba(255,255,255,.05) 14px 15px),linear-gradient(165deg,#2c1820,#141414)}.wk-t-food{background:radial-gradient(90% 70% at 110% 10%,rgba(224,90,18,.45),transparent 50%),repeating-linear-gradient(-28deg,transparent 0 14px,rgba(255,255,255,.05) 14px 15px),linear-gradient(165deg,#3a2014,#141414)}.wk-t-arts{background:radial-gradient(90% 70% at 110% 10%,rgba(196,140,70,.4),transparent 50%),repeating-linear-gradient(-28deg,transparent 0 14px,rgba(255,255,255,.05) 14px 15px),linear-gradient(165deg,#2c2418,#141414)}.list-event-card{box-shadow:none!important;border:1px solid #ebe1cc!important}.list-event-card:hover{transform:none!important}.list-event-card:not(:has(.lec-photo)) .lec-color{width:88px!important;position:relative;background-image:repeating-linear-gradient(-28deg,transparent 0 12px,rgba(255,255,255,.12) 12px 13px)!important}.lec-poster{width:108px;flex-shrink:0;display:flex;flex-direction:column;align-items:flex-start;justify-content:flex-end;padding:16px 14px;color:#fff;position:relative;overflow:hidden;background:radial-gradient(120% 80% at 100% 0%,rgba(255,215,176,.2),transparent 55%),repeating-linear-gradient(-28deg,transparent 0 12px,rgba(255,255,255,.06) 12px 13px),linear-gradient(180deg,#2c2622,#141414)}.lec-poster-kicker{font-size:10px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#ffd7b0;margin-bottom:6px}.lec-poster-day{font-family:Georgia,serif;font-size:2.4rem;line-height:.9}.lec-poster-mon{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:rgba(255,250,244,.65);margin-top:4px}';
    document.documentElement.appendChild(st);
  }

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

  var MONTHS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
  var TYPE_SLUG = {
    music:'music', food:'food', arts:'arts', market:'market',
    community:'community', sports:'sports', sport:'sports',
    festival:'festival'
  };
  function typeSlug(t) {
    return TYPE_SLUG[String(t || '').toLowerCase()] || 'other';
  }
  function typeLabel(t) {
    var s = typeSlug(t);
    return s === 'other' ? 'Event' : s.charAt(0).toUpperCase() + s.slice(1);
  }

  function cardHTML(e) {
    var d = e.event_date ? new Date(e.event_date + 'T00:00:00') : null;
    var place = e.location_name || e.city || '';
    var dateLabel = d ? (DAYS[d.getDay()] + ' ' + d.getDate()) : '';
    var slug = typeSlug(e.event_type);
    var media = e.image_url
      ? '<img class="wk-photo" src="' + esc(e.image_url) + '" alt="">'
      : '<div class="wk-fallback wk-t-' + slug + '">' +
          '<span class="wk-kicker">' + esc(typeLabel(e.event_type)) + '</span>' +
          '<span class="wk-bigday">' + (d ? d.getDate() : '') + '</span>' +
          '<span class="wk-mon">' + (d ? MONTHS[d.getMonth()] : '') + '</span>' +
        '</div>';
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
      var res = await client.from('events').select('id,title,event_date,start_time,location_name,city,image_url,event_type').eq('is_active', true).gte('event_date', today).order('event_date', { ascending: true }).limit(3);
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

  function keepNewsletterFocus() {
    if (window.location.hash !== '#newsletter') return;
    var section = document.getElementById('newsletter');
    var input = document.getElementById('newsletter-email');
    if (section) section.classList.add('visible');
    if (input) input.focus({ preventScroll: true });
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
    if (window.location.hash === '#newsletter') {
      setTimeout(keepNewsletterFocus, 900);
      setTimeout(keepNewsletterFocus, 1200);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();

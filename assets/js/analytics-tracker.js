/**
 * 815local Analytics Tracker
 * localStorage page views + named actions (phone, directions, search).
 */
(function() {
  'use strict';

  const STORE_KEY   = '815local_analytics';
  const SESSION_KEY = '815local_session';
  const ACTIVE_KEY  = '815local_active';
  const PAGE_LABELS = {
    'index.html':     'Homepage',
    'business.html':  'Business Listing',
    'directory.html': 'Directory',
    'events.html':    'Events Calendar',
    'minooka.html':   'Town: Minooka',
    'channahon.html': 'Town: Channahon',
    'shorewood.html': 'Town: Shorewood',
    'analytics.html': 'Analytics Dashboard'
  };

  function getStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || defaultStore();
    } catch(e) { return defaultStore(); }
  }
  function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch(e) {}
  }
  function defaultStore() {
    return {
      totalViews: 0,
      todayViews: 0,
      todayDate: today(),
      pages: {},
      actions: {},
      sessions: [],
      hourly: Array(24).fill(0),
      daily: {},
      referrers: {}
    };
  }
  function today() { return new Date().toISOString().slice(0,10); }
  function pageName() {
    const path = location.pathname.replace(/\/$/, '') || '/';
    if (path === '/minooka' || path === '/channahon' || path === '/shorewood') return 'Town: ' + path.slice(1);
    if (path.indexOf('/b/') === 0) return 'Business Listing';
    const f = path.split('/').pop() || '/';
    return PAGE_LABELS[f] || f;
  }
  function sessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  }

  function recordView() {
    const s = getStore();
    const now = new Date();
    const d = today();
    const hour = now.getHours();
    const page = pageName();
    if (s.todayDate !== d) { s.todayViews = 0; s.todayDate = d; s.hourly = Array(24).fill(0); }
    if (!s.actions) s.actions = {};
    s.totalViews++;
    s.todayViews++;
    s.hourly[hour] = (s.hourly[hour] || 0) + 1;
    s.pages[page] = (s.pages[page] || 0) + 1;
    s.daily[d] = (s.daily[d] || 0) + 1;
    const ref = document.referrer ? document.referrer.split('/')[2] : 'direct';
    s.referrers[ref] = (s.referrers[ref] || 0) + 1;
    const keys = Object.keys(s.daily).sort();
    if (keys.length > 30) { delete s.daily[keys[0]]; }
    s.sessions.push({ id: sessionId(), page, time: now.toISOString() });
    if (s.sessions.length > 200) s.sessions = s.sessions.slice(-200);
    saveStore(s);
  }

  function track(action, detail) {
    const s = getStore();
    if (!s.actions) s.actions = {};
    s.actions[action] = (s.actions[action] || 0) + 1;
    s.sessions.push({ id: sessionId(), page: pageName(), action: action, detail: detail || '', time: new Date().toISOString() });
    if (s.sessions.length > 200) s.sessions = s.sessions.slice(-200);
    saveStore(s);
  }

  function heartbeat() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
      raw[sessionId()] = { page: pageName(), ts: Date.now() };
      Object.keys(raw).forEach(k => { if (Date.now() - raw[k].ts > 30000) delete raw[k]; });
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(raw));
    } catch(e) {}
  }

  let bc;
  try { bc = new BroadcastChannel('815local_analytics'); } catch(e) {}

  recordView();
  heartbeat();
  setInterval(heartbeat, 10000);

  document.addEventListener('click', function (e) {
    const a = e.target.closest && e.target.closest('a,button');
    if (!a) return;
    const href = (a.getAttribute('href') || '').toLowerCase();
    if (href.indexOf('tel:') === 0) track('click_phone', href);
    else if (href.indexOf('mailto:') === 0) track('click_email', href);
    else if (/google.com\/maps|maps.apple.com|destination=/.test(href)) track('click_directions', href);
  }, true);

  function paintCorrectionCta() {
    try {
      var params = new URLSearchParams(window.location.search);
      var id = params.get('id') || (window.__BIZ_ID || '');
      var nameEl = document.getElementById('h-name');
      var name = nameEl ? nameEl.textContent.trim() : '';
      var href = '/pages/submit/correction.html' +
        (id || name ? ('?id=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(name)) : '');
      document.querySelectorAll('a.claim-btn:not(.deal-btn)').forEach(function (a) {
        a.href = href;
        if (/claim/i.test(a.textContent)) a.textContent = 'Tell us what\'s wrong \u2192';
      });
      var title = document.querySelector('#claim-card .claim-title');
      var sub = document.querySelector('#claim-card .claim-sub');
      if (title) title.textContent = 'See a mistake?';
      if (sub) sub.textContent = 'Wrong hours, phone, or photos? Tell us. We update the listing. No account needed.';
    } catch (e) {}
  }
  paintCorrectionCta();
  setTimeout(paintCorrectionCta, 400);
  setTimeout(paintCorrectionCta, 1600);

  window._815analytics = {
    getStore,
    track,
    getActive: function() {
      try {
        const raw = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
        return Object.values(raw).filter(v => Date.now() - v.ts < 30000);
      } catch(e) { return []; }
    },
    pageName,
    bc
  };
})();

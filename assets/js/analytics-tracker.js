/**
 * 815local Analytics Tracker
 * Lightweight client-side tracker using localStorage + BroadcastChannel
 * Drop-in script — add <script src="/assets/js/analytics-tracker.js"></script>
 * before </body> on every page.
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
    'profile.html':   'User Profile',
    'analytics.html': 'Analytics Dashboard'
  };

  /* ── helpers ── */
  function getStore() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY) || 'null') || defaultStore(); }
    catch(e) { return defaultStore(); }
  }
  function saveStore(s) { try { localStorage.setItem(STORE_KEY, JSON.stringify(s)); } catch(e) {} }
  function defaultStore() {
    return {
      totalViews: 0,
      todayViews: 0,
      todayDate: today(),
      pages: {},
      sessions: [],
      hourly: Array(24).fill(0),
      daily: {},
      referrers: {}
    };
  }
  function today() { return new Date().toISOString().slice(0,10); }
  function pageName() {
    const f = location.pathname.split('/').pop() || '/';
    return PAGE_LABELS[f] || f;
  }
  function sessionId() {
    let id = sessionStorage.getItem(SESSION_KEY);
    if (!id) { id = Math.random().toString(36).slice(2); sessionStorage.setItem(SESSION_KEY, id); }
    return id;
  }

  /* ── record page view ── */
  function recordView() {
    const s = getStore();
    const now = new Date();
    const d = today();
    const hour = now.getHours();
    const page = pageName();

    // Reset daily if new day
    if (s.todayDate !== d) { s.todayViews = 0; s.todayDate = d; s.hourly = Array(24).fill(0); }

    s.totalViews++;
    s.todayViews++;
    s.hourly[hour] = (s.hourly[hour] || 0) + 1;
    s.pages[page] = (s.pages[page] || 0) + 1;
    s.daily[d] = (s.daily[d] || 0) + 1;

    // Keep last 30 days only
    const keys = Object.keys(s.daily).sort();
    if (keys.length > 30) { delete s.daily[keys[0]]; }

    // Sessions (keep last 200)
    s.sessions.push({ id: sessionId(), page, time: now.toISOString(), ua: navigator.userAgent.slice(0,80) });
    if (s.sessions.length > 200) s.sessions = s.sessions.slice(-200);

    saveStore(s);
  }

  /* ── active user heartbeat via localStorage ── */
  function heartbeat() {
    try {
      const raw = JSON.parse(localStorage.getItem(ACTIVE_KEY) || '{}');
      raw[sessionId()] = { page: pageName(), ts: Date.now() };
      // Prune stale (>30s)
      Object.keys(raw).forEach(k => { if (Date.now() - raw[k].ts > 30000) delete raw[k]; });
      localStorage.setItem(ACTIVE_KEY, JSON.stringify(raw));
    } catch(e) {}
  }

  /* ── broadcast to dashboard ── */
  let bc;
  try { bc = new BroadcastChannel('815local_analytics'); } catch(e) {}

  function broadcast() {
    if (bc) {
      try { bc.postMessage({ type: 'pageview', page: pageName(), time: Date.now() }); } catch(e) {}
    }
    // Also fire storage event for cross-tab
    heartbeat();
  }

  /* ── init ── */
  recordView();
  broadcast();
  heartbeat();
  setInterval(heartbeat, 10000); // heartbeat every 10s

  /* ── expose globally for dashboard ── */
  window._815analytics = {
    getStore,
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

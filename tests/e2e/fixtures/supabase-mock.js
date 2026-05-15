/**
 * Minimal Supabase mock for Playwright tests.
 * Exposes window.supabase = { createClient } that returns a fake client
 * with chainable query builder methods.
 *
 * Inject via page.addInitScript() BEFORE the page's own scripts run.
 */

const BUSINESSES = [
  {
    id: 'biz-001',
    name: "Rosario's Tavern",
    category: 'Restaurants',
    subcategory: 'Italian',
    description: 'Great Italian food in the heart of the 815.',
    phone: '8155551234',
    website: 'https://example.com',
    address: '123 Lincoln Ave, Minooka IL',
    is_active: true,
    is_claimed: true,
    photos: [],
    image_url: null,
    avg_rating: 4.9,
    review_count: 12,
    features: ['Dine-in', 'Takeout'],
  },
  {
    id: 'biz-002',
    name: 'Oak Street Coffee Co.',
    category: 'Restaurants',
    subcategory: 'Café',
    description: 'Your neighborhood café.',
    phone: '8155559876',
    website: 'https://example.com',
    address: '456 Oak St, Channahon IL',
    is_active: true,
    is_claimed: false,
    photos: [],
    image_url: null,
    avg_rating: 4.8,
    review_count: 8,
    features: ['Workspace', 'Wi-Fi'],
  },
  {
    id: 'biz-003',
    name: 'Elm City Barbershop',
    category: 'Services',
    subcategory: 'Barber',
    description: 'Classic cuts, modern style.',
    phone: '8155554321',
    website: null,
    address: '789 Elm St, Shorewood IL',
    is_active: true,
    is_claimed: true,
    photos: [],
    image_url: null,
    avg_rating: 4.7,
    review_count: 5,
    features: ['Walk-ins Welcome'],
  },
];

const REVIEWS = [
  {
    id: 'rev-001',
    business_id: 'biz-001',
    reviewer_name: 'Jane D.',
    rating: 5,
    body: 'Best pizza around!',
    created_at: '2026-04-01T12:00:00Z',
    helpful_count: 3,
    businesses: { name: "Rosario's Tavern" },
  },
];

const NEWSLETTER = [];
const EVENTS = [];

/**
 * Returns a chainable mock query object.
 * .from(table).select(cols).eq(col,val).limit(n)  → resolves to { data, error }
 */
function makeQuery(table) {
  const state = { table, filters: {}, limitN: null, selectCols: '*' };

  let dataFn = () => {
    switch (state.table) {
      case 'businesses':
      case 'businesses_with_ratings': {
        let rows = BUSINESSES.filter(b => {
          for (const [k, v] of Object.entries(state.filters)) {
            if (b[k] !== v) return false;
          }
          return true;
        });
        if (state.limitN) rows = rows.slice(0, state.limitN);
        return rows;
      }
      case 'reviews':
        return REVIEWS.filter(r => {
          for (const [k, v] of Object.entries(state.filters)) {
            if (r[k] !== v) return false;
          }
          return r;
        });
      case 'events':
        return EVENTS;
      case 'newsletter_subscribers':
        return NEWSLETTER;
      default:
        return [];
    }
  };

  const q = {
    select(cols) { state.selectCols = cols; return q; },
    eq(col, val) { state.filters[col] = val; return q; },
    neq(col, val) { return q; },
    order() { return q; },
    limit(n) { state.limitN = n; return q; },
    single() {
      return Promise.resolve({ data: dataFn()[0] || null, error: null });
    },
    then(resolve) {
      return Promise.resolve({ data: dataFn(), error: null }).then(resolve);
    },
    insert(rows) {
      return Promise.resolve({ data: rows, error: null });
    },
    upsert(rows) {
      return Promise.resolve({ data: rows, error: null });
    },
  };
  return q;
}

window.supabase = {
  createClient(url, key) {
    return {
      from(table) {
        const q = makeQuery(table);
        return {
          ...q,
          insert(rows) { return Promise.resolve({ data: rows, error: null }); },
          upsert(rows) { return Promise.resolve({ data: rows, error: null }); },
          update(rows) { return { eq() { return Promise.resolve({ data: rows, error: null }); } }; },
        };
      },
      auth: {
        getSession() { return Promise.resolve({ data: { session: null }, error: null }); },
        onAuthStateChange(cb) { return { data: { subscription: { unsubscribe() {} } } }; },
        signInWithPassword() { return Promise.resolve({ data: {}, error: null }); },
        signUp() { return Promise.resolve({ data: {}, error: null }); },
        signOut() { return Promise.resolve({ error: null }); },
      },
      storage: {
        from() {
          return {
            upload() { return Promise.resolve({ data: {}, error: null }); },
            getPublicUrl() { return { data: { publicUrl: '' } }; },
          };
        },
      },
    };
  },
};

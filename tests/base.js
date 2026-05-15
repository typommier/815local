// @ts-check
const { test: base, expect } = require('@playwright/test');
const path = require('path');

const SUPABASE_UMD = path.resolve(
  __dirname, '..', 'node_modules', '@supabase', 'supabase-js', 'dist', 'umd', 'supabase.js'
);

const MOCK_BUSINESSES = [
  {
    id: '31969cba-d40f-4cdc-b8f7-240128639af9',
    name: 'AM/FM Plumbing & Services INC.',
    category: 'Home Services',
    subcategory: 'Plumbing',
    description: 'A family-owned plumbing company proudly serving the area since 2020.',
    address: '26115 S Rachael Drive',
    city: 'Channahon',
    state: 'IL',
    zip: '60410',
    phone: '(815) 545-2529',
    website: 'amfmplumbing.com',
    price_range: '$$',
    hours: {
      monday: '24-Hour Emergency Service Available',
      tuesday: '24-Hour Emergency Service Available',
      wednesday: '24-Hour Emergency Service Available',
      thursday: '24-Hour Emergency Service Available',
      friday: '24-Hour Emergency Service Available',
      saturday: '24-Hour Emergency Service Available',
      sunday: '24-Hour Emergency Service Available',
    },
    features: ['24-Hour Emergency Service', 'Licensed & Insured', 'Bonded'],
    image_url: null,
    photos: [],
    is_featured: true,
    is_active: true,
    is_locally_owned: true,
    is_claimed: true,
    avg_rating: 4.8,
    review_count: 3,
    google_place_id: null,
    order_url: null,
    created_at: '2026-04-19T21:00:15Z',
  },
  {
    id: 'e5fec155-d1e4-475b-a729-0527776343bc',
    name: 'Aspire Therapy Center',
    category: 'Health & Wellness',
    subcategory: 'Mental Health Therapy',
    description: 'A mental health counseling practice in Channahon, IL.',
    address: '24735 W Eames Street, Unit 11',
    city: 'Channahon',
    state: 'IL',
    zip: '60410',
    phone: '(815) 846-2221',
    website: 'aspiretherapycenter.org',
    price_range: '$$$',
    hours: {
      monday: '8:00 AM – 8:00 PM',
      tuesday: '8:00 AM – 8:00 PM',
      wednesday: '8:00 AM – 8:00 PM',
      thursday: '8:00 AM – 8:00 PM',
      friday: '8:00 AM – 8:00 PM',
      saturday: '8:00 AM – 5:00 PM',
      sunday: '8:00 AM – 5:00 PM',
    },
    features: ['Individual Therapy', 'Telehealth Available', 'EMDR Certified'],
    image_url: null,
    photos: [],
    is_featured: false,
    is_active: true,
    is_locally_owned: true,
    is_claimed: false,
    avg_rating: 0,
    review_count: 0,
    google_place_id: null,
    order_url: null,
    created_at: '2026-05-15T01:40:55Z',
  },
];

const MOCK_REVIEWS = [
  {
    id: 'aaa-111',
    business_id: '31969cba-d40f-4cdc-b8f7-240128639af9',
    user_id: null,
    reviewer_name: 'Test Reviewer',
    rating: 5,
    review_text: 'Great service, would highly recommend to anyone!',
    helpful_count: 2,
    is_flagged: false,
    flag_reason: null,
    flagged_at: null,
    review_source: 'web',
    session_token: 'test-token',
    created_at: '2026-05-01T10:00:00Z',
    businesses: { name: 'AM/FM Plumbing & Services INC.', category: 'Home Services' },
  },
];

const test = base.extend({
  page: async ({ page }, use) => {
    // Serve Supabase JS from node_modules instead of the blocked CDN
    await page.route('**/cdn.jsdelivr.net/**supabase**', route =>
      route.fulfill({ path: SUPABASE_UMD, contentType: 'application/javascript; charset=utf-8' })
    );

    // Mock Supabase REST API — note: must NOT use **/supabase.co because the
    // subdomain (kyneaettrynagavewefi.) uses a dot, not a slash, so the leading
    // **/ glob segment never matches. Use **supabase.co without the leading slash.
    await page.route('**supabase.co/rest/**', async route => {
      const url = route.request().url();
      const accept = route.request().headers()['accept'] || '';
      // .single() sends Accept: application/vnd.pgrst.object+json and expects one object back
      const wantsSingle = accept.includes('vnd.pgrst.object');

      if (url.includes('businesses_with_ratings') || url.includes('businesses')) {
        if (wantsSingle) {
          // Find by id param if present, otherwise return first mock business
          const idMatch = url.match(/id=eq\.([^&]+)/);
          const match = idMatch
            ? MOCK_BUSINESSES.find(b => b.id === decodeURIComponent(idMatch[1]))
            : null;
          return route.fulfill({ json: match || MOCK_BUSINESSES[0] });
        }
        return route.fulfill({ json: MOCK_BUSINESSES });
      }

      if (url.includes('/reviews')) {
        if (wantsSingle) return route.fulfill({ json: MOCK_REVIEWS[0] });
        return route.fulfill({ json: MOCK_REVIEWS });
      }

      // profiles, saved_businesses, etc.
      return route.fulfill({ json: wantsSingle ? {} : [] });
    });

    // Mock Supabase Auth — always unauthenticated in tests
    await page.route('**supabase.co/auth/**', route =>
      route.fulfill({ json: { access_token: null, user: null, session: null } })
    );

    await use(page);
  },
});

module.exports = { test, expect };

// POST /api/listing-correction
// Emails 815local@gmail.com when someone flags a listing mistake.
// Tries Resend first (RESEND_API_KEY on Cloudflare Pages), then the
// existing Supabase notify-submission function as a backup.

const TO = '815local@gmail.com';
const NOTIFY_URL = 'https://kyneaettrynagavewefi.supabase.co/functions/v1/notify-submission';

export async function onRequestPost(context) {
  const cors = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  };
  let body = {};
  try {
    body = await context.request.json();
  } catch (e) {
    return json({ ok: false, error: 'invalid_json' }, 400, cors);
  }

  const biz = String(body.business_name || '').slice(0, 160);
  const name = String(body.claimant_name || '').slice(0, 120);
  const role = String(body.role || '').slice(0, 40);
  const email = String(body.email || '').slice(0, 160);
  const phone = String(body.phone || '').slice(0, 40);
  const issues = Array.isArray(body.issues) ? body.issues.map(String).slice(0, 8) : [];
  const notes = String(body.notes || '').slice(0, 2000);
  const listing = body.business_id
    ? 'https://815local.com/pages/business.html?id=' + encodeURIComponent(body.business_id)
    : '';

  const text = [
    'Listing correction from 815local.com',
    '',
    'Business: ' + (biz || '(none)'),
    listing ? 'Listing: ' + listing : '',
    'From: ' + name + (role ? ' (' + role + ')' : ''),
    email ? 'Email: ' + email : '',
    phone ? 'Phone: ' + phone : '',
    issues.length ? 'Issues: ' + issues.join('; ') : '',
    notes ? 'Notes:\n' + notes : '',
  ].filter(Boolean).join('\n');

  let emailed = false;
  const via = [];

  const key = context.env && context.env.RESEND_API_KEY;
  if (key) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + key,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          from: '815 Local <notifications@815local.com>',
          to: [TO],
          reply_to: email || undefined,
          subject: 'Listing correction: ' + (biz || 'Unknown business'),
          text,
        }),
      });
      if (res.ok) {
        emailed = true;
        via.push('resend');
      }
    } catch (e) {}
  }

  try {
    const notifyRes = await fetch(NOTIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'claim',
        business_id: body.business_id || null,
        business_name: biz,
        claimant_name: name,
        role: role || 'Correction',
        email,
        phone,
        verification_method: 'listing_correction',
        notes: (issues.length ? 'Issues: ' + issues.join('; ') + '\n' : '') + (notes || ''),
        to: TO,
      }),
    });
    if (notifyRes.ok) {
      emailed = true;
      via.push('notify-submission');
    }
  } catch (e) {}

  return json({ ok: true, emailed, via, to: TO }, 200, cors);
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

function json(body, status, cors) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...cors },
  });
}

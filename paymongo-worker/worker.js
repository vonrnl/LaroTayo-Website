// Laro Tayo - PayMongo Checkout backend (Cloudflare Worker)
//   POST /create-checkout  -> { id, checkoutUrl }
//   GET  /status?id=...    -> { paid, reference, method, last4, amount, paymentId }
//
// Secret: PAYMONGO_SECRET_KEY  (sk_test_... for testing, sk_live_... for real money)
// Vars:   ALLOWED_ORIGIN       (your website, no trailing slash)

const FEE = 500;                       // pesos. Set here, never trusted from the browser.
const API = 'https://api.paymongo.com/v1';

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin'
    }
  });

const auth = env => 'Basic ' + btoa(env.PAYMONGO_SECRET_KEY + ':');

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN;
    const url = new URL(req.url);

    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 204,
        headers: {
          'Access-Control-Allow-Origin': origin,
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type',
          'Access-Control-Max-Age': '86400'
        }
      });
    }

    if (req.headers.get('Origin') !== origin) return json({ error: 'Forbidden' }, 403, origin);

    try {
      // ---------- CREATE CHECKOUT ----------
      if (url.pathname === '/create-checkout' && req.method === 'POST') {
        const b = await req.json();
        if (!b.reference || !b.email || !b.returnUrl) return json({ error: 'Missing fields.' }, 400, origin);
        if (new URL(b.returnUrl).origin !== origin) return json({ error: 'Bad return URL.' }, 400, origin);

        const m = String(b.method || '').toLowerCase();
        const types = m.includes('gcash') ? ['gcash']
                    : m.includes('card')  ? ['card']
                    : ['gcash', 'card', 'paymaya'];

        const res = await fetch(API + '/checkout_sessions', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth(env) },
          body: JSON.stringify({
            data: {
              attributes: {
                billing: { name: String(b.name || 'School').slice(0, 60), email: b.email },
                line_items: [{
                  currency: 'PHP',
                  amount: FEE * 100,                       // centavos
                  name: 'Laro Tayo School Registration',
                  quantity: 1
                }],
                payment_method_types: types,
                description: 'Laro Tayo School Registration (one-time fee)',
                reference_number: b.reference,             // the Firebase uid
                send_email_receipt: true,
                show_description: true,
                show_line_items: true,
                success_url: b.returnUrl + '?paid=1',
                cancel_url:  b.returnUrl + '?cancelled=1',
                metadata: { uid: b.reference, school: String(b.school || '').slice(0, 80) }
              }
            }
          })
        });
        const out = await res.json().catch(() => ({}));
        const d = out.data;
        if (!res.ok || !d || !d.attributes || !d.attributes.checkout_url) {
          const msg = out.errors && out.errors[0] && out.errors[0].detail;
          return json({ error: msg || 'PayMongo error' }, 502, origin);
        }
        return json({ id: d.id, checkoutUrl: d.attributes.checkout_url }, 200, origin);
      }

      // ---------- STATUS ----------
      if (url.pathname === '/status' && req.method === 'GET') {
        const id = url.searchParams.get('id');
        if (!id || !/^[A-Za-z0-9_-]{10,80}$/.test(id)) return json({ paid: false }, 400, origin);

        const res = await fetch(API + '/checkout_sessions/' + id, {
          headers: { Authorization: auth(env) }
        });
        if (!res.ok) return json({ paid: false }, 200, origin);
        const a = ((await res.json()).data || {}).attributes || {};

        const pay = (a.payments || []).find(p =>
          p.attributes && p.attributes.status === 'paid' && Number(p.attributes.amount) >= FEE * 100);
        if (!pay) return json({ paid: false }, 200, origin);

        const src = pay.attributes.source || {};
        return json({
          paid: true,
          reference: a.reference_number,
          method: src.type || 'paymongo',
          last4: src.last4 || null,
          amount: Number(pay.attributes.amount) / 100,
          paymentId: pay.id
        }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'Server error' }, 500, origin);
    }
  }
};
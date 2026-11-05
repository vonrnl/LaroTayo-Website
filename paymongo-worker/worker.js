// Laro Tayo - Maya Checkout backend (Cloudflare Worker)
//   POST /create-checkout  -> { id, checkoutUrl }
//   GET  /status?id=...    -> { paid, reference, method, last4, amount, paymentId }
//
// Secrets: MAYA_PUBLIC_KEY (pk-...), MAYA_SECRET_KEY (sk-...)
// Vars:    ALLOWED_ORIGIN (your website, no trailing slash)
//          MAYA_API  https://pg-sandbox.paymaya.com  (sandbox)  |  https://pg.maya.ph  (live)

const FEE = 500;   // pesos. Set here, never trusted from the browser.

const json = (body, status, origin) =>
  new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': origin,
      'Vary': 'Origin'
    }
  });

const basic = key => 'Basic ' + btoa(key + ':');

export default {
  async fetch(req, env) {
    const origin = env.ALLOWED_ORIGIN;
    const api = env.MAYA_API || 'https://pg-sandbox.paymaya.com';
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

        const res = await fetch(api + '/checkout/v1/checkouts', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: basic(env.MAYA_PUBLIC_KEY) },
          body: JSON.stringify({
            totalAmount: { value: FEE, currency: 'PHP' },
            buyer: {
              firstName: String(b.name || 'School').slice(0, 60),
              contact: { email: b.email }
            },
            items: [{
              name: 'Laro Tayo School Registration',
              quantity: 1,
              totalAmount: { value: FEE }
            }],
            redirectUrl: {
              success: b.returnUrl + '?paid=1',
              failure: b.returnUrl + '?cancelled=1',
              cancel:  b.returnUrl + '?cancelled=1'
            },
            requestReferenceNumber: b.reference,        // the Firebase uid
            metadata: { school: String(b.school || '').slice(0, 80) }
          })
        });
        const out = await res.json().catch(() => ({}));
        if (!res.ok || !out.checkoutId) {
          return json({ error: out.message || 'Maya error' }, 502, origin);
        }
        return json({ id: out.checkoutId, checkoutUrl: out.redirectUrl }, 200, origin);
      }

      // ---------- STATUS ----------
      if (url.pathname === '/status' && req.method === 'GET') {
        const id = url.searchParams.get('id');
        if (!id || !/^[A-Za-z0-9-]{10,64}$/.test(id)) return json({ paid: false }, 400, origin);

        const res = await fetch(api + '/checkout/v1/checkouts/' + id, {
          headers: { Authorization: basic(env.MAYA_SECRET_KEY) }
        });
        if (!res.ok) return json({ paid: false }, 200, origin);
        const c = await res.json();

        const value = Number(c.totalAmount && c.totalAmount.value);
        const paid = c.paymentStatus === 'PAYMENT_SUCCESS' && value >= FEE;
        if (!paid) return json({ paid: false }, 200, origin);

        const efs = (c.paymentDetails && c.paymentDetails.responses && c.paymentDetails.responses.efs) || {};
        const pan = String(efs.maskedPan || (c.paymentDetails && c.paymentDetails.maskedPan) || '');
        return json({
          paid: true,
          reference: c.requestReferenceNumber,
          method: 'maya',
          last4: pan ? pan.slice(-4) : null,
          amount: value,
          paymentId: efs.paymentTransactionReferenceNo || c.id || id
        }, 200, origin);
      }

      return json({ error: 'Not found' }, 404, origin);
    } catch (e) {
      return json({ error: 'Server error' }, 500, origin);
    }
  }
};
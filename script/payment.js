// ---- TEST PAYMENT (no real money) ----
// Simulates a GCash / card checkout so the whole flow can be tried and demoed.
// To go live later, replace collectTestPayment() with a real PayMongo call
// (that needs a small backend, because the secret key must never be in the browser).

export const REGISTRATION_FEE = 500;          // pesos
export const TEST_MODE = true;

// ---- WHICH PAYMENT TO USE ----
//   'sim'      = the built-in fake checkout (no PayMongo, no backend needed)
//   'paymongo' = real PayMongo checkout page (use test keys = still no real money)
export const PAYMENT_MODE = 'sim';
// Your Cloudflare Worker address (see paymongo-worker/worker.js), no trailing slash.
export const PAYMONGO_API = 'https://YOUR-WORKER.YOUR-NAME.workers.dev';

const GCASH_TEST_OTP = '123456';

// ---- RECEIPT EMAIL (EmailJS) ----
// Fill these 3 values from your EmailJS dashboard (emailjs.com, free plan).
// Leave them as-is to skip sending receipt emails.
const EMAILJS = {
  serviceId:  'YOUR_SERVICE_ID',
  templateId: 'YOUR_TEMPLATE_ID',
  publicKey:  'YOUR_PUBLIC_KEY'
};

// Test cards: any other number is rejected with "use a test card".
const TEST_CARDS = {
  '4343434343434345': 'ok',            // Visa
  '4571736000000075': 'ok',            // Visa debit
  '5555444444444457': 'ok',            // Mastercard
  '4000000000000002': 'declined',      // always declined
  '4000000000009995': 'insufficient'   // insufficient funds
};

export const peso = n =>
  '\u20B1' + Number(n).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const sleep = ms => new Promise(r => setTimeout(r, ms));
const $ = id => document.getElementById(id);

function makeReference() {
  const rnd = Math.random().toString(36).slice(2, 6).toUpperCase();
  return 'LT-' + Date.now().toString(36).toUpperCase() + rnd;
}

function header(amount, title) {
  return `
    <div class="pay-modal">
      <p class="pay-amt-label" style="margin-top:0">${title}</p>
      <div class="pay-amt">${peso(amount)}</div>
      <p class="pay-sub">Laro Tayo &bull; School Admin Registration (one-time fee)</p>`;
}

// ---------- GCASH ----------
async function gcashStep(amount) {
  const step1 = await Swal.fire({
    title: 'GCash Payment',
    width: 'min(92vw, 440px)',
    customClass: { popup: 'pay-popup', confirmButton: 'pay-confirm', cancelButton: 'pay-cancel' },
    html: header(amount, 'Amount to Pay') + `
        <label class="pay-label" for="pay-mobile">GCash mobile number</label>
        <input id="pay-mobile" class="pay-input" inputmode="numeric" maxlength="11" placeholder="09XXXXXXXXX" autocomplete="off">
        <p class="pay-hint">Enter your 11-digit GCash number (starts with 09).</p>
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Next',
    cancelButtonText: 'Cancel',
    focusConfirm: false,
    didOpen: () => {
      const m = $('pay-mobile');
      m.addEventListener('input', () => { m.value = m.value.replace(/\D/g, '').slice(0, 11); });
      m.focus();
    },
    preConfirm: () => {
      const v = $('pay-mobile').value;
      if (!/^09\d{9}$/.test(v)) {
        Swal.showValidationMessage('Enter an 11-digit GCash number starting with 09.');
        return false;
      }
      return v;
    }
  });
  if (!step1.isConfirmed) return null;
  const mobile = step1.value;

  const step2 = await Swal.fire({
    title: 'Authorize in GCash',
    width: 'min(92vw, 440px)',
    customClass: { popup: 'pay-popup', confirmButton: 'pay-confirm', cancelButton: 'pay-cancel' },
    html: header(amount, 'Confirm payment') + `
        <p class="pay-hint">A code was sent to <b>${mobile.slice(0, 4)}***${mobile.slice(-3)}</b>.<br>
        Enter <b>${GCASH_TEST_OTP}</b>.</p>
      </div>`,
    input: 'text',
    inputAttributes: { inputmode: 'numeric', maxlength: 6, autocomplete: 'off', placeholder: '6-digit code' },
    inputValidator: v => (v === GCASH_TEST_OTP ? undefined : 'Wrong code. Use ' + GCASH_TEST_OTP + '.'),
    showCancelButton: true,
    confirmButtonText: 'Pay ' + peso(amount),
    cancelButtonText: 'Cancel'
  });
  if (!step2.isConfirmed) return null;
  return { detail: 'GCash ' + mobile.slice(0, 4) + '***' + mobile.slice(-3) };
}

// ---------- CARD ----------
async function cardStep(amount) {
  const res = await Swal.fire({
    title: 'Card Payment',
    width: 'min(92vw, 440px)',
    customClass: { popup: 'pay-popup', confirmButton: 'pay-confirm', cancelButton: 'pay-cancel' },
    html: header(amount, 'Amount to Pay') + `
        <label class="pay-label" for="pay-card-name">Name on card</label>
        <input id="pay-card-name" class="pay-input" placeholder="Juan Dela Cruz" maxlength="60" autocomplete="off">

        <label class="pay-label" for="pay-card-num">Card number</label>
        <input id="pay-card-num" class="pay-input" inputmode="numeric" placeholder="1234 5678 9012 3456" maxlength="19" autocomplete="off">

        <div class="pay-row">
          <div>
            <label class="pay-label" for="pay-card-exp">Expiry</label>
            <input id="pay-card-exp" class="pay-input" inputmode="numeric" placeholder="MM/YY" maxlength="5" autocomplete="off">
          </div>
          <div>
            <label class="pay-label" for="pay-card-cvc">CVC</label>
            <input id="pay-card-cvc" class="pay-input" inputmode="numeric" placeholder="123" maxlength="4" autocomplete="off">
          </div>
        </div>

        <div class="pay-testcards">
          <b>Test cards</b> (any future expiry, any CVC)<br>
          <button type="button" class="pay-fill" data-card="4343434343434345">4343 4343 4343 4345 &middot; success</button>
          <button type="button" class="pay-fill" data-card="4000000000000002">4000 0000 0000 0002 &middot; declined</button>
        </div>
      </div>`,
    showCancelButton: true,
    confirmButtonText: 'Pay ' + peso(amount),
    cancelButtonText: 'Cancel',
    focusConfirm: false,
    didOpen: () => {
      const num = $('pay-card-num'), exp = $('pay-card-exp'), cvc = $('pay-card-cvc');
      num.addEventListener('input', () => {
        num.value = num.value.replace(/\D/g, '').slice(0, 16).replace(/(.{4})/g, '$1 ').trim();
      });
      exp.addEventListener('input', () => {
        let d = exp.value.replace(/\D/g, '').slice(0, 4);
        if (d.length > 2) d = d.slice(0, 2) + '/' + d.slice(2);
        exp.value = d;
      });
      cvc.addEventListener('input', () => { cvc.value = cvc.value.replace(/\D/g, '').slice(0, 4); });
      document.querySelectorAll('.pay-fill').forEach(b => b.addEventListener('click', () => {
        num.value = b.dataset.card.replace(/(.{4})/g, '$1 ').trim();
        if (!exp.value) exp.value = '12/30';
        if (!cvc.value) cvc.value = '123';
        if (!$('pay-card-name').value) $('pay-card-name').value = 'Test Student';
      }));
      $('pay-card-name').focus();
    },
    preConfirm: async () => {
      const name = $('pay-card-name').value.trim();
      const num  = $('pay-card-num').value.replace(/\s/g, '');
      const exp  = $('pay-card-exp').value;
      const cvc  = $('pay-card-cvc').value;

      if (name.length < 3) return Swal.showValidationMessage('Enter the name on the card.'), false;
      if (num.length < 13) return Swal.showValidationMessage('Enter the full card number.'), false;

      const m = /^(\d{2})\/(\d{2})$/.exec(exp);
      if (!m || +m[1] < 1 || +m[1] > 12) return Swal.showValidationMessage('Expiry must look like MM/YY.'), false;
      const now = new Date();
      const expEnd = new Date(2000 + +m[2], +m[1], 1);          // first day after the expiry month
      if (expEnd <= now) return Swal.showValidationMessage('This card has expired.'), false;

      if (cvc.length < 3) return Swal.showValidationMessage('Enter the 3-digit CVC.'), false;

      await sleep(900);                                          // pretend to talk to the bank
      const outcome = TEST_CARDS[num];
      if (!outcome) return Swal.showValidationMessage('Please use one of the cards below.'), false;
      if (outcome === 'declined') return Swal.showValidationMessage('Card declined. Try another card.'), false;
      if (outcome === 'insufficient') return Swal.showValidationMessage('Insufficient funds. Try another card.'), false;
      return { last4: num.slice(-4) };
    }
  });
  if (!res.isConfirmed) return null;
  return { detail: 'Card ending ' + res.value.last4 };
}

// ---------- PUBLIC: run the whole payment ----------
// Resolves { ok:true, reference, method, detail, amount, paidAt } or { ok:false } if cancelled.
export async function collectTestPayment({ method, amount = REGISTRATION_FEE }) {
  const step = method === 'GCash' ? await gcashStep(amount) : await cardStep(amount);
  if (!step) return { ok: false };

  Swal.fire({
    title: 'Processing payment...',
    html: 'Please do not close this page.',
    allowOutsideClick: false,
    allowEscapeKey: false,
    showConfirmButton: false,
    customClass: { popup: 'pay-popup' },
    didOpen: () => Swal.showLoading()
  });
  await sleep(1600);

  return {
    ok: true,
    reference: makeReference(),
    method,
    detail: step.detail,
    amount,
    paidAt: new Date()
  };
}


// ---------- RECEIPT EMAIL ----------
// Sends "you have paid" to the school admin's email. Never blocks registration:
// returns true if sent, false if skipped or failed.
export async function sendReceiptEmail({ toEmail, toName, school, pay }) {
  if (EMAILJS.serviceId.startsWith('YOUR_')) return false;   // not set up yet
  try {
    const res = await fetch('https://api.emailjs.com/api/v1.0/email/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_id: EMAILJS.serviceId,
        template_id: EMAILJS.templateId,
        user_id: EMAILJS.publicKey,
        template_params: {
          to_email:  toEmail,
          to_name:   toName,
          school:    school,
          amount:    peso(pay.amount),
          method:    pay.detail,
          reference: pay.reference,
          paid_at:   pay.paidAt.toLocaleString('en-PH'),
          mode:      'PAID'
        }
      })
    });
    return res.ok;
  } catch (_) {
    return false;
  }
}


// ---------- PAYMONGO (real checkout page, via your Worker) ----------
export async function createPayMongoCheckout({ uid, name, email, method, school }) {
  const res = await fetch(PAYMONGO_API + '/create-checkout', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      reference: uid, name, email, method, school,
      returnUrl: location.origin + location.pathname      // PayMongo sends the user back here
    })
  });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error('[PAYMONGO]', out);
    throw new Error('Could not start the payment. ' + (out.error || ''));
  }
  return out;   // { id, checkoutUrl }
}

export async function getPayMongoStatus(sessionId) {
  const res = await fetch(PAYMONGO_API + '/status?id=' + encodeURIComponent(sessionId));
  return res.json().catch(() => ({ paid: false }));
}
import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  deleteUser,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  writeBatch,
  Timestamp,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  collectTestPayment, sendReceiptEmail, createPayMongoCheckout, getPayMongoStatus,
  REGISTRATION_FEE, PAYMENT_MODE, peso
} from "./payment.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtB1ouns3wY1ljekvHm8h-_V_ChAcNjJw",
  authDomain: "bestinthesis-ef4e4.firebaseapp.com",
  projectId: "bestinthesis-ef4e4",
  storageBucket: "bestinthesis-ef4e4.firebasestorage.app",
  messagingSenderId: "774078773253",
  appId: "1:774078773253:web:28a0345c51393e9d9e046c"
};

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

// ---- LOGIN MODAL: one login form for everyone (+ school sign-up view) ----
let keepAuthView = false;

function showAuthView(name) {
  ['login', 'signup'].forEach(v => {
    const el = document.getElementById('auth-' + v);
    if (el) el.hidden = v !== name;
  });
  const modal = document.querySelector('#login .modal');
  if (modal) modal.scrollTop = 0;
  const err = document.getElementById('login-err');
  if (err) err.textContent = '';
}

function openLogin() {
  keepAuthView = location.hash !== '#login';
  showAuthView('login');
  window.location.hash = 'login';
}

document.querySelectorAll('[data-back]').forEach(btn =>
  btn.addEventListener('click', () => showAuthView('login')));
document.querySelectorAll('[data-goto]').forEach(link =>
  link.addEventListener('click', e => { e.preventDefault(); showAuthView(link.dataset.goto); }));
// footer "For Schools" link: open the modal straight on the school sign-up form
document.querySelectorAll('[data-open-admin-signup]').forEach(link =>
  link.addEventListener('click', () => {
    keepAuthView = location.hash !== '#login';
    showAuthView('signup');
  }));
// opening the modal any other way (nav LOGIN, "Sign In to Rate") starts at the login form
window.addEventListener('hashchange', () => {
  if (location.hash === '#login' && !keepAuthView) showAuthView('login');
  keepAuthView = false;
});

// Shows the "verify your email" popup with a Resend option.
// The caller signs the user out afterwards.
async function promptVerifyEmail(user) {
  const res = await Swal.fire({
    icon: 'info',
    title: 'Verify Your Email',
    html: 'We sent a verification link to <b>' + esc(user.email) + '</b>.<br>Open it, then log in again.<br><small>Check your Spam folder too.</small>',
    showCancelButton: true,
    confirmButtonText: 'Resend email',
    cancelButtonText: 'OK'
  });
  if (res.isConfirmed) {
    try {
      await sendEmailVerification(user);
      Swal.fire({ icon: 'success', title: 'Sent!', text: 'A new verification email is on its way.' });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Could not send', text: e.code === 'auth/too-many-requests' ? 'Too many requests. Please wait a few minutes.' : e.message });
    }
  }
}

// ---- UNIFIED LOGIN (student + school admin + website admin) ----
// One form for everyone. After sign-in we look for a 'teachers' doc:
//   role 'admin'   -> admin.html
//   role 'teacher' -> school-admin.html
//   anything else              -> dashboard.html (student)
const loginBtn = document.getElementById('login-btn');
if (loginBtn) {
  const doLogin = async () => {
    const email = document.getElementById('login-email').value.trim();
    const pass  = document.getElementById('login-password').value;
    const err   = document.getElementById('login-err');

    if (!email || !pass) { err.textContent = 'Please enter your email and password.'; return; }

    err.textContent = '';
    loginBtn.textContent = 'Logging in...';
    loginBtn.disabled = true;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);

      let isStaff = false;
      let staffData = null;
      try {
        const teacherSnap = await getDoc(doc(db, 'teachers', cred.user.uid));
        if (teacherSnap.exists() && ['admin', 'teacher'].includes(teacherSnap.data().role)) {
          isStaff = true;
          staffData = teacherSnap.data();
        }
      } catch (_) { /* no access / no doc -> treat as student */ }

      // New school admin accounts must verify their email first.
      // New accounts have an 'approved' field; older staff accounts do not, so they are not locked out.
      if (isStaff && staffData.role === 'teacher' && 'approved' in staffData && !cred.user.emailVerified) {
        await promptVerifyEmail(cred.user);
        await signOut(auth);
        loginBtn.textContent = 'Login';
        loginBtn.disabled = false;
        return;
      }

      // New students must verify their email first (older accounts are not affected)
      if (!isStaff && !cred.user.emailVerified) {
        let needsVerify = false;
        try {
          const stuSnap = await getDoc(doc(db, 'students', cred.user.uid));
          needsVerify = stuSnap.exists() && stuSnap.data().requireEmailVerification === true;
        } catch (_) {}

        if (needsVerify) {
          await promptVerifyEmail(cred.user);
          await signOut(auth);
          loginBtn.textContent = 'Login';
          loginBtn.disabled = false;
          return;
        }
      }

      window.location.href = isStaff
        ? (staffData.role === 'admin' ? 'admin.html' : 'school-admin.html')
        : 'dashboard.html';

    } catch (e) {
      const msgs = {
        "auth/user-not-found":     "No account found with that email.",
        "auth/wrong-password":     "Incorrect password. Please try again.",
        "auth/invalid-email":      "Please enter a valid email.",
        "auth/invalid-credential": "Wrong email or password.",
        "auth/too-many-requests":  "Too many attempts. Please wait and try again."
      };
      err.textContent = msgs[e.code] || e.message;
      loginBtn.textContent = 'Login';
      loginBtn.disabled = false;
    }
  };

  loginBtn.addEventListener('click', doLogin);
  document.getElementById('login-password')
    .addEventListener('keydown', e => { if (e.key === 'Enter') doLogin(); });
}

function esc(t) {
  return String(t).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

// ---- TERMS AND CONDITIONS ----
const regTerms  = document.getElementById('sch-terms');
const termsLink = document.getElementById('terms-link');

if (termsLink) {
  termsLink.addEventListener('click', async (e) => {
    e.preventDefault();
    const result = await Swal.fire({
      title: 'Terms and Conditions',
      width: 'min(92vw, 560px)',
      customClass: { popup: 'terms-popup' },
      html: `
        <div class="terms-body">
          <h4>1. Purpose</h4>
          <p>Laro Tayo is a thesis project that helps preserve Filipino traditional games through gamification. School accounts are used only for this educational purpose.</p>
          <h4>2. Information we collect</h4>
          <p>When a school registers we collect the admin's name, category, school name, email address, and chosen payment method. When the school adds students, we also store each student's username, email, game progress, and achievements.</p>
          <h4>3. Your responsibility as a school admin</h4>
          <p>You will create accounts for students, so you confirm that your school has the consent needed for students to take part, including parent or guardian consent for minors.</p>
          <h4>4. How we use information</h4>
          <p>Information is used to run accounts, save progress, and support the research of this project. We do not sell it or share it with advertisers. You can only see the students your school added.</p>
          <h4>5. Data privacy</h4>
          <p>We handle data in line with the Data Privacy Act of 2012 (RA 10173). You may ask the project team to correct or delete an account at any time.</p>
          <h4>6. Your account</h4>
          <p>Keep your password private. Accounts that are misused may be suspended.</p>
          <h4>7. Changes</h4>
          <p>These terms may be updated as the project develops. Continuing to use Laro Tayo means you accept the latest version.</p>
        </div>`,
      showCancelButton: true,
      confirmButtonText: 'I Agree',
      cancelButtonText: 'Close'
    });
    if (result.isConfirmed && regTerms) regTerms.checked = true;
  });
}

// ---- SHOW / HIDE PASSWORD (eye buttons) ----
document.querySelectorAll('[data-toggle-pass]').forEach(btn =>
  btn.addEventListener('click', () => {
    const input = document.getElementById(btn.dataset.togglePass);
    if (!input) return;
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    const icon = btn.querySelector('.material-symbols-rounded');
    if (icon) icon.textContent = show ? 'visibility_off' : 'visibility';
    btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
  }));

// ---- PRIVACY POLICY ----
const privacyLink = document.getElementById('privacy-link');
if (privacyLink) {
  privacyLink.addEventListener('click', e => {
    e.preventDefault();
    Swal.fire({
      title: 'Privacy Policy',
      width: 'min(92vw, 560px)',
      customClass: { popup: 'terms-popup' },
      html: `
        <div class="terms-body">
          <h4>What we collect</h4>
          <p>School admins: name, category, school, email, and chosen payment method. Students: username, email, game progress, badges, and friends list.</p>
          <h4>Why we collect it</h4>
          <p>To create and run accounts, save game progress, show teachers their own students' progress, and support the research of this thesis project.</p>
          <h4>Who can see it</h4>
          <p>A school admin can only see the students their school added. Other players can see a student's username, avatar, and score for friends and rankings. We do not sell data or share it with advertisers.</p>
          <h4>Children's data</h4>
          <p>Student accounts are created by schools. The school confirms it has the consent needed, including parent or guardian consent for minors.</p>
          <h4>Your rights</h4>
          <p>Under the Data Privacy Act of 2012 (RA 10173) you may ask the project team to see, correct, or delete your data at any time.</p>
          <h4>Security</h4>
          <p>Data is stored with Google Firebase. Passwords are handled by Firebase Authentication and are never visible to us. Keep your password private.</p>
        </div>`,
      confirmButtonText: 'Close'
    });
  });
}

// ---- SCHOOL REGISTRATION ----
const schoolBtn = document.getElementById('school-register-btn');
const PAY_LABEL = 'Pay ' + peso(REGISTRATION_FEE) + ' & Register';
const PENDING_KEY = 'laro_pending_reg';     // remembers the form while the user is on PayMongo's page
if (schoolBtn) schoolBtn.textContent = PAY_LABEL;

const resetBtn = () => { if (schoolBtn) { schoolBtn.textContent = PAY_LABEL; schoolBtn.disabled = false; } };
const tryDelete = async (u) => { try { await deleteUser(u); } catch (_) {} };

// Creates the login. If an earlier attempt made the login but never finished
// (cancelled / closed the tab), the same email + password picks it up again.
async function createOrReuseAccount(email, password) {
  try {
    return (await createUserWithEmailAndPassword(auth, email, password)).user;
  } catch (e) {
    if (e.code !== 'auth/email-already-in-use') throw e;
    let user;
    try { user = (await signInWithEmailAndPassword(auth, email, password)).user; } catch (_) { throw e; }
    let taken = false;
    try {
      taken = (await getDoc(doc(db, 'teachers', user.uid))).exists()
           || (await getDoc(doc(db, 'students', user.uid))).exists();
    } catch (_) {}
    if (!taken) return user;
    await signOut(auth);
    throw e;
  }
}

// Saves the school record, sends emails, shows the receipt. Used by both payment modes.
async function finishRegistration(user, data, pay) {
  try {
    await updateProfile(user, { displayName: data.name });
    // School record + payment record are saved together (all or nothing),
    // so the admin panel sees the school as Paid right away. No manual "Record payment".
    const paidAt    = Timestamp.fromDate(pay.paidAt instanceof Date ? pay.paidAt : new Date());
    const batch = writeBatch(db);
    batch.set(doc(db, 'teachers', user.uid), {
      uid: user.uid,
      username: data.name,
      email: data.email,
      role: 'teacher',
      category: data.category,
      school: data.school,
      paymentMethod: data.payment,
      termsAccepted: true,
      approved: true,
      paid: true,
      paidAt,
      createdAt: serverTimestamp()
    });
    batch.set(doc(db, 'payments', String(pay.reference)), {   // same reference = never saved twice
      schoolId: user.uid,
      schoolName: data.school,
      adminName: data.name,
      email: data.email,
      amount: Number(pay.amount) || REGISTRATION_FEE,
      method: pay.detail || data.payment,
      reference: String(pay.reference),
      paidAt,
      recordedBy: user.uid,
      source: 'registration'
    });
    await batch.commit();
  } catch (inner) {
    console.error('[SAVE ERROR]', inner);
    Swal.close();
    await Swal.fire({
      icon: 'error',
      title: 'Payment OK, account not saved',
      html: 'Your payment went through, but we could not save your account.<br>Reference: <b>' + esc(pay.reference) + '</b><br>Please contact the project team with this reference.'
    });
    return false;
  }

  try { await sendEmailVerification(user); } catch (_) {}
  // PayMongo emails its own receipt; the built-in test checkout uses EmailJS instead.
  const receiptSent = PAYMENT_MODE === 'paymongo'
    ? false
    : await sendReceiptEmail({ toEmail: data.email, toName: data.name, school: data.school, pay });
  await signOut(auth);
  localStorage.removeItem(PENDING_KEY);

  ['sch-name', 'sch-school', 'sch-email', 'sch-password', 'sch-confirm'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  const cat = document.getElementById('sch-category'); if (cat) cat.value = '';
  if (regTerms) regTerms.checked = false;
  document.querySelectorAll('input[name="sch-pay"]').forEach(r => r.checked = false);

  await Swal.fire({
    icon: 'success',
    title: 'Payment Successful!',
    width: 'min(92vw, 460px)',
    html:
      '<div class="pay-receipt">' +
        '<div class="pay-receipt-row"><span>School</span><b>' + esc(data.school) + '</b></div>' +
        '<div class="pay-receipt-row"><span>Amount</span><b>' + peso(pay.amount) + (PAYMENT_MODE === 'sim' ? ' (test)' : '') + '</b></div>' +
        '<div class="pay-receipt-row"><span>Method</span><b>' + esc(pay.detail) + '</b></div>' +
        '<div class="pay-receipt-row"><span>Reference</span><b>' + esc(pay.reference) + '</b></div>' +
        '<div class="pay-receipt-row"><span>Date</span><b>' + pay.paidAt.toLocaleString('en-PH') + '</b></div>' +
      '</div>' +
      '<p style="margin-top:12px">Your school account is ready.' +
        (receiptSent ? '<br>A payment receipt was sent to <b>' + esc(data.email) + '</b>.' : '') +
        '<br>We sent a verification link to <b>' + esc(data.email) + '</b>. Open it, then log in.</p>',
    confirmButtonText: 'Go to Login'
  });

  if (document.getElementById('login')) openLogin();
  else window.location.href = 'index.html#login';
  return true;
}

if (schoolBtn) {
  schoolBtn.addEventListener('click', async () => {
    const name     = document.getElementById('sch-name').value.trim();
    const category = document.getElementById('sch-category').value;
    const school   = document.getElementById('sch-school').value.trim();
    const email    = document.getElementById('sch-email').value.trim().toLowerCase();   // must match the lowercase email in the auth token (Firestore rule)
    const password = document.getElementById('sch-password').value;
    const confirm  = document.getElementById('sch-confirm').value;
    const payment  = (document.querySelector('input[name="sch-pay"]:checked') || {}).value || '';

    const warn = (title, text) => Swal.fire({ icon: 'warning', title, text });

    if (!name || !category || !school || !email || !password || !confirm) {
      warn('Missing Fields', 'Please fill in all fields.'); return;
    }
    if (name.length < 3) { warn('Name Too Short', 'Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { warn('Invalid Email', 'Please enter a valid email address.'); return; }
    if (password.length < 6) { warn('Weak Password', 'Password must be at least 6 characters.'); return; }
    if (password !== confirm) {
      Swal.fire({ icon: 'error', title: 'Password Mismatch', text: 'Passwords do not match.' }); return;
    }
    if (!payment) { warn('Payment Method', 'Please choose a payment method.'); return; }
    if (regTerms && !regTerms.checked) {
      warn('Terms and Conditions', 'Please read and agree to the Terms and Conditions to continue.'); return;
    }

    schoolBtn.textContent = 'Creating account...';
    schoolBtn.disabled = true;

    try {
      // 1) Create the login first, so a taken email fails BEFORE anyone pays.
      const user = await createOrReuseAccount(email, password);
      const data = { name, category, school, email, payment };

      // 2a) REAL PayMongo checkout: go to PayMongo's page, come back to this page after.
      if (PAYMENT_MODE === 'paymongo') {
        schoolBtn.textContent = 'Opening PayMongo...';
        let co;
        try {
          co = await createPayMongoCheckout({ uid: user.uid, name, email, method: payment, school });
        } catch (e) {
          await tryDelete(user);
          throw e;
        }
        localStorage.setItem(PENDING_KEY, JSON.stringify({ uid: user.uid, sessionId: co.id, data }));
        window.location.href = co.checkoutUrl;
        return;
      }

      // 2b) Built-in test checkout (no real money)
      schoolBtn.textContent = 'Waiting for payment...';
      let pay;
      try {
        pay = await collectTestPayment({ method: payment, amount: REGISTRATION_FEE });
      } catch (payErr) {
        await tryDelete(user);
        throw payErr;
      }
      if (!pay.ok) {
        await tryDelete(user);
        resetBtn();
        Swal.fire({ icon: 'info', title: 'Payment Cancelled', text: 'No payment was made and no account was created. You can try again anytime.' });
        return;
      }

      // 3) Payment done -> save the school record
      await finishRegistration(user, data, pay);
      resetBtn();
    } catch (err) {
      console.error('[SCHOOL REG ERROR]', err.code, err.message);
      const messages = {
        'auth/email-already-in-use': 'That email is already registered.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password is too weak.',
        'auth/network-request-failed': 'Network problem. Check your connection and try again.',
        'permission-denied': 'Database permission denied. Check Firestore rules.'
      };
      Swal.fire({ icon: 'error', title: 'Registration Failed', text: messages[err.code] || err.message });
      resetBtn();
    }
  });
}

// ---- COMING BACK FROM PAYMONGO (?paid=1 or ?cancelled=1) ----
async function handlePayMongoReturn() {
  const params = new URLSearchParams(location.search);
  const paid = params.get('paid') === '1';
  const cancelled = params.get('cancelled') === '1';
  if (!paid && !cancelled) return;
  history.replaceState(null, '', location.pathname + location.hash);

  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (_) {}
  if (!pending) {
    Swal.fire({ icon: 'info', title: 'Nothing to finish', text: 'We could not find a registration in progress on this device.' });
    return;
  }

  // wait for Firebase to restore the signed-in user
  const user = await new Promise(res => { const off = onAuthStateChanged(auth, u => { off(); res(u); }); });
  if (!user || user.uid !== pending.uid) {
    Swal.fire({ icon: 'error', title: 'Please register again', text: 'Your session expired before the payment was confirmed.' });
    localStorage.removeItem(PENDING_KEY);
    return;
  }

  if (cancelled) {
    await tryDelete(user);
    try { await signOut(auth); } catch (_) {}
    localStorage.removeItem(PENDING_KEY);
    Swal.fire({ icon: 'info', title: 'Payment Cancelled', text: 'No payment was made. You can register again anytime.' });
    return;
  }

  // paid=1 in the address is NOT proof: ask PayMongo (through the Worker)
  const check = async () => {
    Swal.fire({ title: 'Confirming your payment...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    let st = { paid: false };
    for (let i = 0; i < 5 && !st.paid; i++) {
      st = await getPayMongoStatus(pending.sessionId);
      if (!st.paid) await new Promise(r => setTimeout(r, 2000));
    }
    return st;
  };

  let st = await check();
  while (!(st.paid && st.reference === user.uid)) {
    const r = await Swal.fire({
      icon: 'warning',
      title: 'Payment not confirmed yet',
      text: 'PayMongo has not confirmed the payment. If you just paid, wait a few seconds and check again.',
      showCancelButton: true,
      confirmButtonText: 'Check again',
      cancelButtonText: 'Cancel registration'
    });
    if (!r.isConfirmed) {
      await tryDelete(user);
      try { await signOut(auth); } catch (_) {}
      localStorage.removeItem(PENDING_KEY);
      return;
    }
    st = await check();
  }

  const labels = { gcash: 'GCash', card: 'Card', qrph: 'QR Ph', maya: 'Maya' };
  const detail = (labels[st.method] || 'Maya') + (st.last4 ? ' ending ' + st.last4 : '');
  await finishRegistration(user, pending.data, {
    amount: st.amount != null ? st.amount : REGISTRATION_FEE,
    detail,
    reference: st.paymentId || pending.sessionId,
    paidAt: new Date()
  });
}
handlePayMongoReturn();

// ---- AUTH STATE ----
onAuthStateChanged(auth, async (user) => {
  const isDashboard = window.location.pathname.includes('dashboard');

  if (isDashboard) {
    if (!user) { window.location.href = 'index.html'; return; }

    // New students who haven't verified their email can't stay on the dashboard
    if (!user.emailVerified) {
      try {
        const s = await getDoc(doc(db, 'students', user.uid));
        if (s.exists() && s.data().requireEmailVerification === true) {
          await signOut(auth);
          window.location.href = 'index.html#login';
        }
      } catch (_) {}
    }
    return;
  }

  const navLoginItem = document.querySelector('a[href="#login"].nav-item, a.nav-item[data-auth]');
  if (!navLoginItem) return;

  if (user) {
    // Logged in: show DASHBOARD button
    navLoginItem.innerHTML = `<span class="material-symbols-rounded">dashboard</span><span>DASHBOARD</span>`;
    navLoginItem.href = 'dashboard.html';
    navLoginItem.setAttribute('data-auth', 'in');
    navLoginItem.onclick = null;
  } else {
    // Not logged in: show LOGIN button
    navLoginItem.innerHTML = `<span class="material-symbols-rounded">lock</span><span>LOGIN</span>`;
    navLoginItem.href = '#login';
    navLoginItem.setAttribute('data-auth', 'out');
    navLoginItem.onclick = null;
  }
});
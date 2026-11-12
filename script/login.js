import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  sendEmailVerification,
  sendPasswordResetEmail,
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
import { fileToCompressedDataUrl, DOC_MAX_UPLOAD_MB } from "./shared.js";

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
// ---- FORGOT PASSWORD: email a reset link ----
const forgotLink = document.getElementById('forgot-link');
if (forgotLink) {
  forgotLink.addEventListener('click', async () => {
    const typed = (document.getElementById('login-email').value || '').trim();
    const res = await Swal.fire({
      title: 'Forgot password?',
      text: 'Type your email and we will send you a link to set a new password.',
      input: 'email',
      inputValue: typed,
      inputPlaceholder: 'Email',
      inputAttributes: { autocomplete: 'email' },
      showCancelButton: true,
      confirmButtonText: 'Send link',
      confirmButtonColor: '#F4A234',
      inputValidator: v => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((v || '').trim()) ? undefined : 'Please enter a valid email.'),
    });
    if (!res.isConfirmed) return;
    const email = res.value.trim();
    try {
      await sendPasswordResetEmail(auth, email);
    } catch (e) {
      // Do not reveal whether an email has an account (auth/user-not-found is treated like success).
      if (e.code === 'auth/too-many-requests') {
        Swal.fire({ icon: 'error', title: 'Too many requests', text: 'Please wait a few minutes and try again.', confirmButtonColor: '#e53935' });
        return;
      }
      if (e.code === 'auth/invalid-email') {
        Swal.fire({ icon: 'error', title: 'Invalid email', text: 'Please check the email and try again.', confirmButtonColor: '#e53935' });
        return;
      }
      if (e.code !== 'auth/user-not-found') console.error(e);
    }
    Swal.fire({
      icon: 'success', title: 'Check your email',
      html: 'If <b>' + email.replace(/[&<>"\']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])) + '</b> has an account, we sent a link to set a new password. Check Spam too.',
      confirmButtonColor: '#F4A234',
    });
  });
}

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
        if (teacherSnap.exists() && ['admin', 'teacher', 'staff'].includes(teacherSnap.data().role)) {
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

      // A student whose account was disabled or deleted by the school admin / teacher cannot log in.
      if (!isStaff) {
        let blocked = '';
        try {
          const dSnap = await getDoc(doc(db, 'students', cred.user.uid));
          if (dSnap.exists()) blocked = dSnap.data().status === 'deleted' ? 'deleted' : (dSnap.data().status === 'disabled' ? 'disabled' : '');
        } catch (_) { /* can't check: let them through */ }
        if (blocked) {
          await signOut(auth);
          loginBtn.textContent = 'Login';
          loginBtn.disabled = false;
          Swal.fire({
            icon: 'info',
            title: blocked === 'deleted' ? 'Account removed' : 'Account disabled',
            text: blocked === 'deleted' ? 'This account was removed. Please ask your school admin.' : 'Your account is disabled. Please ask your teacher or school admin.',
            confirmButtonColor: '#F4A234'
          });
          return;
        }
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
          <p>When a school registers we collect the admin's name, category, school name, email address, and a photo of a document that shows your position (such as a school ID). The document is used only to check that you work at the school, can only be seen by the Laro Tayo admin, and is deleted once your account is approved. Payment is handled at checkout after approval. When the school adds students, we also store each student's username, email, game progress, and achievements.</p>
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
          <p>School admins: name, category, school, email, and a proof-of-position document (kept only until your account is reviewed). Students: username, email, game progress, badges, and friends list.</p>
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
// 1) The school admin sends their details + a proof-of-position photo (status "pending").
// 2) The website admin reviews it in admin.html and approves or rejects.
// 3) After approval, the school admin logs in and pays the one-time fee (school-admin.html).
const schoolBtn = document.getElementById('school-register-btn');
const SUBMIT_LABEL = 'Submit for Verification';
if (schoolBtn) schoolBtn.textContent = SUBMIT_LABEL;

const resetBtn = () => { if (schoolBtn) { schoolBtn.textContent = SUBMIT_LABEL; schoolBtn.disabled = false; } };
const tryDelete = async (u) => { try { await deleteUser(u); } catch (_) {} };

// Creates the login. If an earlier attempt made the login but never finished
// (closed the tab, network error), the same email + password picks it up again.
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

// little preview of the chosen photo
const docInput   = document.getElementById('sch-doc');
const docPreview = document.getElementById('sch-doc-preview');
if (docInput && docPreview) {
  docInput.addEventListener('change', () => {
    const f = docInput.files && docInput.files[0];
    if (docPreview.dataset.url) { URL.revokeObjectURL(docPreview.dataset.url); delete docPreview.dataset.url; }
    if (f && /^image\//.test(f.type)) {
      const url = URL.createObjectURL(f);
      docPreview.dataset.url = url;
      docPreview.src = url;
      docPreview.classList.add('show');
    } else {
      docPreview.removeAttribute('src');
      docPreview.classList.remove('show');
    }
  });
}

function clearSchoolForm() {
  ['sch-name', 'sch-school', 'sch-email', 'sch-password', 'sch-idnum', 'sch-doc'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  ['sch-category', 'sch-doctype'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
  if (regTerms) regTerms.checked = false;
  if (docPreview) { docPreview.removeAttribute('src'); docPreview.classList.remove('show'); }
}

if (schoolBtn) {
  schoolBtn.addEventListener('click', async () => {
    const name     = document.getElementById('sch-name').value.trim();
    const category = document.getElementById('sch-category').value;
    const school   = document.getElementById('sch-school').value.trim();
    const email    = document.getElementById('sch-email').value.trim().toLowerCase();   // must match the lowercase email in the auth token (Firestore rule)
    const password = document.getElementById('sch-password').value;
    const docType  = document.getElementById('sch-doctype').value;
    const idEl = document.getElementById('sch-idnum');   // field removed from the form
    const idNumber = idEl ? idEl.value.trim() : '';
    const file     = (document.getElementById('sch-doc').files || [])[0];

    const warn = (title, text) => Swal.fire({ icon: 'warning', title, text });

    if (!name || !category || !school || !email || !password) {
      warn('Missing Fields', 'Please fill in all fields.'); return;
    }
    if (name.length < 3) { warn('Name Too Short', 'Please enter your full name.'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { warn('Invalid Email', 'Please enter a valid email address.'); return; }
    if (password.length < 6) { warn('Weak Password', 'Password must be at least 6 characters.'); return; }
    if (!docType) { warn('Document Type', 'Please choose which document you are uploading.'); return; }
    if (!file)    { warn('Document Needed', 'Please upload a photo of your ID or letter so we can verify your position.'); return; }
    if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { warn('Photo Only', 'Please upload a JPG or PNG photo of your document.'); return; }
    if (file.size > DOC_MAX_UPLOAD_MB * 1024 * 1024) { warn('File Too Big', 'The photo must be ' + DOC_MAX_UPLOAD_MB + ' MB or smaller.'); return; }
    if (regTerms && !regTerms.checked) {
      warn('Terms and Conditions', 'Please read and agree to the Terms and Conditions to continue.'); return;
    }

    schoolBtn.textContent = 'Preparing document...';
    schoolBtn.disabled = true;

    // shrink the photo first, so a bad file fails BEFORE any account is created
    let imageData;
    try {
      imageData = await fileToCompressedDataUrl(file);
    } catch (_) {
      warn('Could not read the photo', 'Please choose a different, clearer JPG or PNG photo.');
      resetBtn();
      return;
    }

    try {
      schoolBtn.textContent = 'Submitting...';
      const user = await createOrReuseAccount(email, password);
      try {
        await updateProfile(user, { displayName: name });
        // School record + document are saved together (all or nothing).
        const batch = writeBatch(db);
        batch.set(doc(db, 'teachers', user.uid), {
          uid: user.uid,
          username: name,
          email,
          role: 'teacher',
          category,
          school,
          termsAccepted: true,
          approved: true,             // kept: new accounts must verify their email before logging in
          verification: 'pending',    // pending -> approved / rejected (only the website admin changes this)
          paid: false,                // becomes true after the registration fee is paid (after approval)
          createdAt: serverTimestamp()
        });
        batch.set(doc(db, 'verifications', user.uid), {
          uid: user.uid,
          schoolName: school,
          adminName: name,
          email,
          category,
          docType,
          schoolIdNumber: idNumber,
          fileName: String(file.name || '').slice(0, 80),
          imageData,
          submittedAt: serverTimestamp()
        });
        await batch.commit();
      } catch (inner) {
        await tryDelete(user);        // never leave a login with no school record
        throw inner;
      }

      try { await sendEmailVerification(user); } catch (_) {}
      await signOut(auth);
      clearSchoolForm();

      await Swal.fire({
        icon: 'success',
        title: 'Application Submitted!',
        width: 'min(92vw, 460px)',
        html:
          '<p>We received your details and your <b>' + esc(docType) + '</b> for <b>' + esc(school) + '</b>.</p>' +
          '<p style="margin-top:10px"><b>What happens next</b></p>' +
          '<ol style="text-align:left;margin:6px 0 0 18px;line-height:1.6">' +
            '<li>Open the verification link we sent to <b>' + esc(email) + '</b>.</li>' +
            '<li>We check your document.</li>' +
            '<li>Once approved, log in and pay the one-time fee to activate your account.</li>' +
          '</ol>',
        confirmButtonText: 'Go to Login'
      });

      if (document.getElementById('login')) openLogin();
      else window.location.href = 'index.html#login';
    } catch (err) {
      console.error('[SCHOOL REG ERROR]', err.code, err.message);
      const messages = {
        'auth/email-already-in-use': 'That email is already registered.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password is too weak.',
        'auth/network-request-failed': 'Network problem. Check your connection and try again.',
        'permission-denied': 'Database permission denied. Check Firestore rules (teachers and verifications).'
      };
      Swal.fire({ icon: 'error', title: 'Registration Failed', text: messages[err.code] || err.message });
    }
    resetBtn();
  });
}

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
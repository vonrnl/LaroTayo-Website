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
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

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

// ---- SCHOOL CHOICES (suggestions for the School Name box) ----
// Edit this list to add/remove schools. Admins can still type any school name.
const CAVITE_SCHOOLS = [
  'Dasmariñas East Central School',
  'Dasmariñas West Central School',
  'Dasmariñas North Central School',
  'Imus Pilot Elementary School',
  'Bacoor Central School',
  'Kawit Central School',
  'General Trias Central School',
  'Trece Martires City Central School',
  'Tagaytay City Central School',
  'Silang Central School',
  'Carmona Central School',
  'Naic Central School',
  'Cavite City Central School',
  'Noveleta Central School',
  'Rosario Central School',
  'Indang Central School',
  'Tanza Central School',
  'Gen. Mariano Alvarez Central School',
  'Amadeo Central School',
  'Mendez Central School'
];

const schoolList = document.getElementById('sch-school-list');
if (schoolList) {
  CAVITE_SCHOOLS.forEach(name => {
    const opt = document.createElement('option');
    opt.value = name;
    schoolList.appendChild(opt);
  });
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
    const resetBtn = () => { schoolBtn.textContent = 'Register'; schoolBtn.disabled = false; };

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      const user = cred.user;

      try {
        await updateProfile(user, { displayName: name });
        await setDoc(doc(db, 'teachers', user.uid), {
          uid: user.uid,
          username: name,
          email: email,
          role: 'teacher',
          category: category,
          school: school,
          paymentMethod: payment,
          termsAccepted: true,
          approved: true,   // no manual approval step; kept so new accounts can be told apart from older ones
          createdAt: serverTimestamp()
        });
      } catch (inner) {
        // don't leave a login with no school record behind
        try { await deleteUser(user); } catch (_) {}
        throw inner;
      }

      try { await sendEmailVerification(user); } catch (_) {}
      await signOut(auth);
      resetBtn();

      ['sch-name', 'sch-school', 'sch-email', 'sch-password', 'sch-confirm'].forEach(id => document.getElementById(id).value = '');
      document.getElementById('sch-category').value = '';
      if (regTerms) regTerms.checked = false;
      document.querySelectorAll('input[name="sch-pay"]').forEach(r => r.checked = false);

      await Swal.fire({
        icon: 'success',
        title: 'School Registered!',
        html: 'Your account for <b>' + esc(school) + '</b> was created.<br>' +
              'Verify your email, then you can log in.' +
              '<br><small>A verification email was sent to ' + esc(email) + '. Open the link in it before you log in.</small>'
      });

      if (document.getElementById('login')) openLogin();   // homepage: open the login modal
      else window.location.href = 'index.html#login';              // signup.html: go to the homepage login
    } catch (err) {
      console.error('[SCHOOL REG ERROR]', err.code, err.message);
      const messages = {
        'auth/email-already-in-use': 'That email is already registered.',
        'auth/invalid-email': 'Invalid email address.',
        'auth/weak-password': 'Password is too weak.',
        'permission-denied': 'Database permission denied. Check Firestore rules.'
      };
      Swal.fire({ icon: 'error', title: 'Registration Failed', text: messages[err.code] || err.message });
      resetBtn();
    }
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
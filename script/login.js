import { initializeApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  updateProfile,
  signOut,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtB1ouns3wY1ljekvHm8h-_V_ChAcNjJw",
  authDomain: "bestinthesis-ef4e4.firebaseapp.com",
  projectId: "bestinthesis-ef4e4",
  storageBucket: "bestinthesis-ef4e4.firebasestorage.app",
  messagingSenderId: "774078773253",
  appId: "1:774078773253:web:28a0345c51393e9d9e046c"
};

const app  = initializeApp(firebaseConfig);
const auth = getAuth(app);

const ADMIN_USER = 'admin';
const ADMIN_PASS = 'larotayo2026';

// ---- ADMIN LOGIN ----
const adminLoginBtn = document.getElementById('admin-login-btn');
if (adminLoginBtn) {
  adminLoginBtn.addEventListener('click', () => {
    const user = document.getElementById('admin-username').value.trim();
    const pass = document.getElementById('admin-password').value.trim();
    const err  = document.getElementById('admin-err');

    if (!user || !pass) { err.textContent = 'Please fill in both fields.'; return; }
    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
      err.textContent = 'Invalid admin credentials.';
      document.getElementById('admin-password').value = '';
      return;
    }

    err.textContent = '';
    sessionStorage.setItem('admin-logged-in', 'yes');
    adminLoginBtn.textContent = 'Redirecting...';
    adminLoginBtn.disabled = true;
    setTimeout(() => { window.location.href = 'admin.html'; }, 800);
  });
}

// ---- STUDENT LOGIN ----
const studentLoginBtn = document.getElementById('student-login-btn');
if (studentLoginBtn) {
  studentLoginBtn.addEventListener('click', async () => {
    const email = document.getElementById('student-email').value.trim();
    const pass  = document.getElementById('student-password').value.trim();
    const err   = document.getElementById('student-err');

    if (!email || !pass) { err.textContent = 'Please enter your email and password.'; return; }

    studentLoginBtn.textContent = 'Logging in...';
    studentLoginBtn.disabled = true;

    try {
      await signInWithEmailAndPassword(auth, email, pass);
      err.textContent = '';
      window.location.href = 'dashboard.html';
    } catch (e) {
      const msgs = {
        "auth/user-not-found":     "No account found with that email.",
        "auth/wrong-password":     "Incorrect password. Please try again.",
        "auth/invalid-email":      "Please enter a valid email.",
        "auth/invalid-credential": "Wrong email or password."
      };
      err.textContent = msgs[e.code] || e.message;
      studentLoginBtn.textContent = 'Login';
      studentLoginBtn.disabled = false;
    }
  });
}

// ---- REGISTRATION ----
const regBtn = document.getElementById('register-btn');
if (regBtn) {
  regBtn.addEventListener('click', async () => {
    const username    = document.getElementById('reg-username').value.trim();
    const email       = document.getElementById('reg-email').value.trim();
    const password    = document.getElementById('reg-password').value.trim();
    const confirmPass = document.getElementById('reg-confirm').value.trim();

    if (!username || !email || !password || !confirmPass) {
      alert('Please fill in all fields.'); return;
    }
    if (password.length < 6) {
      alert('Password must be at least 6 characters.'); return;
    }
    if (password !== confirmPass) {
      alert('Passwords do not match. Please try again.'); return;
    }

    regBtn.textContent = 'Creating account...';
    regBtn.disabled = true;

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: username });
      alert('Account created! Welcome to Laro Tayo! You can now login.');
      window.location.hash = '';
    } catch (err) {
      const msgs = {
        "auth/email-already-in-use": "That email is already registered.",
        "auth/invalid-email":        "Please enter a valid email address.",
        "auth/weak-password":        "Password is too weak."
      };
      alert(msgs[err.code] || err.message);
      regBtn.textContent = 'Sign up';
      regBtn.disabled = false;
    }
  });
}

// ---- EDIT PROFILE MODAL (dashboard) ----
function initEditProfile(user) {
  const overlay    = document.getElementById('ep-overlay');
  const closeBtn   = document.getElementById('ep-close');
  const editBtn    = document.getElementById('dash-edit-profile');
  const saveBtn    = document.getElementById('ep-save');
  const nicknameIn = document.getElementById('ep-nickname');
  const avatarGrid = document.getElementById('ep-avatar-grid');
  const preview    = document.getElementById('ep-avatar-preview');
  const msg        = document.getElementById('ep-msg');

  if (!overlay) return;

  let selectedEmoji = localStorage.getItem('dash-avatar') || '🎮';

  function openModal() {
    nicknameIn.value = user.displayName || '';
    selectedEmoji = localStorage.getItem('dash-avatar') || '🎮';
    preview.textContent = selectedEmoji;
    document.querySelectorAll('.ep-avatar-opt').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.emoji === selectedEmoji);
    });
    if (msg) { msg.textContent = ''; msg.className = 'ep-msg'; }
    overlay.classList.add('open');
  }

  function closeModal() { overlay.classList.remove('open'); }

  editBtn.onclick = openModal;
  closeBtn.onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

  avatarGrid.onclick = (e) => {
    const btn = e.target.closest('.ep-avatar-opt');
    if (!btn) return;
    selectedEmoji = btn.dataset.emoji;
    preview.textContent = selectedEmoji;
    document.querySelectorAll('.ep-avatar-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };

  saveBtn.onclick = async () => {
    const nickname = nicknameIn.value.trim();
    if (!nickname) {
      if (msg) { msg.textContent = 'Please enter a nickname!'; msg.className = 'ep-msg error'; }
      return;
    }
    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="material-symbols-rounded">hourglass_empty</span> Saving...';

    try {
      await updateProfile(user, { displayName: nickname });
      localStorage.setItem('dash-avatar', selectedEmoji);

      const el = (id) => document.getElementById(id);
      if (el('dash-name'))          el('dash-name').textContent          = nickname;
      if (el('dash-avatar'))        el('dash-avatar').textContent        = selectedEmoji;
      if (el('dash-header-name'))   el('dash-header-name').textContent   = nickname;
      if (el('dash-header-avatar')) el('dash-header-avatar').textContent = selectedEmoji;

      closeModal();
    } catch (err) {
      if (msg) { msg.textContent = 'Failed to save. Please try again.'; msg.className = 'ep-msg error'; }
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Save Changes';
    }
  };
}

// ---- AUTH STATE ----
onAuthStateChanged(auth, (user) => {
  const isDashboard = window.location.pathname.includes('dashboard');

  if (isDashboard) {
    if (!user) { window.location.href = 'index.html'; return; }

    const displayName = user.displayName || user.email.split('@')[0];
    const savedAvatar = localStorage.getItem('dash-avatar') || '🎮';
    const el = (id) => document.getElementById(id);

    if (el('dash-name'))          el('dash-name').textContent          = displayName;
    if (el('dash-email'))         el('dash-email').textContent         = user.email;
    if (el('dash-header-name'))   el('dash-header-name').textContent   = displayName;
    if (el('dash-avatar'))        el('dash-avatar').textContent        = savedAvatar;
    if (el('dash-header-avatar')) el('dash-header-avatar').textContent = savedAvatar;

    const dashLogout = el('dash-logout');
    if (dashLogout) {
      dashLogout.onclick = async () => {
        if (confirm('Are you sure you want to logout?')) {
          signOut(auth).then(() => { window.location.href = 'index.html'; });
        }
      };
    }

    initEditProfile(user);
    return;
  }

  // Index page: swap LOGIN <-> LOGOUT in nav
  const navLoginItem = document.querySelector('a[href="#login"].nav-item');
  if (!navLoginItem) return;

  if (user) {
    navLoginItem.innerHTML = `
      <span class="material-symbols-rounded">logout</span>
      <span>LOGOUT</span>
    `;
    navLoginItem.href = "#";
    navLoginItem.onclick = (e) => {
      e.preventDefault();
      if (confirm('Are you sure you want to logout?')) {
        signOut(auth).then(() => {
          navLoginItem.innerHTML = `
            <span class="material-symbols-rounded">lock</span>
            <span>LOGIN</span>
          `;
          navLoginItem.href = "#login";
          navLoginItem.onclick = null;
        });
      }
    };
  }
});
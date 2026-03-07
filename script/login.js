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

function showMsg(modalId, message, isError = false) {
  const modal = document.querySelector(modalId + " .modal");
  let msg = modal.querySelector(".auth-msg");
  if (!msg) {
    msg = document.createElement("p");
    msg.className = "auth-msg";
    msg.style.cssText = `
      margin: 8px 0 0;
      font-size: 0.85rem;
      font-weight: 600;
      padding: 8px 12px;
      border-radius: 8px;
      text-align: center;
    `;
    modal.querySelector("button").before(msg);
  }
  msg.textContent = message;
  msg.style.background = isError ? "#ffe0e0" : "#e0ffe8";
  msg.style.color       = isError ? "#c0392b" : "#1a7a3c";
}

const regBtn = document.querySelector("#registration .btn-orange");
if (regBtn) {
  regBtn.addEventListener("click", async (e) => {
    e.preventDefault();

    const inputs      = document.querySelectorAll("#registration input");
    const username    = inputs[0].value.trim();
    const email       = inputs[1].value.trim();
    const password    = inputs[2].value.trim();
    const confirmPass = inputs[3].value.trim();

    if (!username || !email || !password || !confirmPass) {
      showMsg("#registration", "⚠️ Please fill in all fields.", true);
      return;
    }
    if (password.length < 6) {
      showMsg("#registration", "⚠️ Password must be at least 6 characters.", true);
      return;
    }
    if (password !== confirmPass) {
      showMsg("#registration", "⚠️ Passwords do not match.", true);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      await updateProfile(userCredential.user, {
        displayName: username
      });

      showMsg("#registration", "🎉 Account created! Redirecting to login...");
      setTimeout(() => { window.location.hash = "#login"; }, 1500);

    } catch (err) {
      const msgs = {
        "auth/email-already-in-use": "⚠️ That email is already registered.",
        "auth/invalid-email":        "⚠️ Please enter a valid email address.",
        "auth/weak-password":        "⚠️ Password is too weak."
      };
      showMsg("#registration", msgs[err.code] || "❌ " + err.message, true);
    }
  });
}

const loginBtn = document.querySelector("#login .btn-orange");
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const inputs   = document.querySelectorAll("#login input");
    const email    = inputs[0].value.trim();
    const password = inputs[1].value.trim();

    if (!email || !password) {
      showMsg("#login", "⚠️ Please enter your email and password.", true);
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      showMsg("#login", "✅ Welcome back, " + (userCredential.user.displayName || userCredential.user.email) + "!");
      setTimeout(() => { window.location.href = "dashboard.html"; }, 1200);

    } catch (err) {
      const msgs = {
        "auth/user-not-found":   "⚠️ No account found with that email.",
        "auth/wrong-password":   "⚠️ Incorrect password.",
        "auth/invalid-email":    "⚠️ Please enter a valid email.",
        "auth/invalid-credential": "⚠️ Wrong email or password."
      };
      showMsg("#login", msgs[err.code] || "❌ " + err.message, true);
    }
  });
}

// ---- EDIT PROFILE MODAL ----
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

  // Load saved avatar from localStorage
  let selectedEmoji = localStorage.getItem('dash-avatar') || '🎮';

  function openModal() {
    nicknameIn.value = user.displayName || '';
    selectedEmoji = localStorage.getItem('dash-avatar') || '🎮';
    preview.textContent = selectedEmoji;
    // Mark selected avatar
    document.querySelectorAll('.ep-avatar-opt').forEach(btn => {
      btn.classList.toggle('selected', btn.dataset.emoji === selectedEmoji);
    });
    msg.textContent = '';
    msg.className = 'ep-msg';
    overlay.classList.add('open');
  }

  function closeModal() { overlay.classList.remove('open'); }

  editBtn.onclick = openModal;
  closeBtn.onclick = closeModal;
  overlay.onclick = (e) => { if (e.target === overlay) closeModal(); };

  // Avatar selection
  avatarGrid.onclick = (e) => {
    const btn = e.target.closest('.ep-avatar-opt');
    if (!btn) return;
    selectedEmoji = btn.dataset.emoji;
    preview.textContent = selectedEmoji;
    document.querySelectorAll('.ep-avatar-opt').forEach(b => b.classList.remove('selected'));
    btn.classList.add('selected');
  };

  // Save
  saveBtn.onclick = async () => {
    const nickname = nicknameIn.value.trim();
    if (!nickname) {
      msg.textContent = '⚠️ Please enter a nickname.';
      msg.className = 'ep-msg error';
      return;
    }
    saveBtn.disabled = true;
    saveBtn.textContent = 'Saving...';
    try {
      await updateProfile(user, { displayName: nickname });
      localStorage.setItem('dash-avatar', selectedEmoji);
      // Update navbar instantly
      const dashName       = document.getElementById('dash-name');
      const dashAvatar     = document.getElementById('dash-avatar');
      const dashHeaderName = document.getElementById('dash-header-name');
      const dashHeaderAvatar = document.getElementById('dash-header-avatar');
      if (dashName)         dashName.textContent         = nickname;
      if (dashAvatar)       dashAvatar.textContent       = selectedEmoji;
      if (dashHeaderName)   dashHeaderName.textContent   = nickname;
      if (dashHeaderAvatar) dashHeaderAvatar.textContent = selectedEmoji;
      msg.textContent = '✅ Profile updated!';
      msg.className = 'ep-msg success';
      setTimeout(closeModal, 1200);
    } catch (err) {
      msg.textContent = '❌ Failed to save. Try again.';
      msg.className = 'ep-msg error';
    } finally {
      saveBtn.disabled = false;
      saveBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Save Changes';
    }
  };
}

onAuthStateChanged(auth, (user) => {
  const isDashboard = window.location.pathname.includes('dashboard');

  // ---- DASHBOARD PAGE ----
  if (isDashboard) {
    if (!user) {
      window.location.href = 'index.html#login';
      return;
    }

    const displayName = user.displayName || user.email.split('@')[0];

    const dashName   = document.getElementById('dash-name');
    const dashEmail  = document.getElementById('dash-email');
    const dashLogout = document.getElementById('dash-logout');

    if (dashName)  dashName.textContent  = displayName;
    if (dashEmail) dashEmail.textContent = user.email;

    const dashHeaderName = document.getElementById('dash-header-name');
    if (dashHeaderName) dashHeaderName.textContent = displayName;

    // Load saved avatar
    const savedAvatar     = localStorage.getItem('dash-avatar') || '🎮';
    const dashAvatar      = document.getElementById('dash-avatar');
    const dashHeaderAvatar = document.getElementById('dash-header-avatar');
    if (dashAvatar)       dashAvatar.textContent       = savedAvatar;
    if (dashHeaderAvatar) dashHeaderAvatar.textContent = savedAvatar;

    if (dashLogout) {
      dashLogout.onclick = () => {
        signOut(auth).then(() => { window.location.href = 'index.html'; });
      };
    }

    // Init edit profile modal
    initEditProfile(user);
    return;
  }

  // ---- INDEX PAGE ----
  const loginNavItem = document.querySelector('a[href="#login"].nav-item');
  if (!loginNavItem) return;

  if (user) {
    loginNavItem.innerHTML = `
      <span class="material-symbols-rounded">logout</span>
      <span>LOGOUT</span>
    `;
    loginNavItem.href = "#";
    loginNavItem.onclick = (e) => {
      e.preventDefault();
      signOut(auth).then(() => {
        loginNavItem.innerHTML = `
          <span class="material-symbols-rounded">lock</span>
          <span>LOGIN</span>
        `;
        loginNavItem.href = "#login";
        loginNavItem.onclick = null;
      });
    };
  }
});
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

const Toast = Swal.mixin({
  toast: true,
  position: 'top-end',
  showConfirmButton: false,
  timer: 2500,
  timerProgressBar: true,
  didOpen: (toast) => {
    toast.addEventListener('mouseenter', Swal.stopTimer);
    toast.addEventListener('mouseleave', Swal.resumeTimer);
  }
});

function showSuccess(title, text = '') {
  return Swal.fire({
    icon: 'success',
    title,
    text,
    confirmButtonColor: '#F4A234',
    fontFamily: 'Nunito',
  });
}

function showError(title, text = '') {
  return Swal.fire({
    icon: 'error',
    title,
    text,
    confirmButtonColor: '#F4A234',
  });
}

function showToast(icon, title) {
  return Toast.fire({ icon, title });
}

// ---- REGISTRATION ----
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
      showError('Missing Fields', 'Please fill in all fields.');
      return;
    }
    if (password.length < 6) {
      showError('Weak Password', 'Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPass) {
      showError('Password Mismatch', 'Passwords do not match. Please try again.');
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(userCredential.user, { displayName: username });

      await Swal.fire({
        icon: 'success',
        title: '🎉 Account Created!',
        text: 'Welcome to Laro Tayo! Redirecting to login...',
        confirmButtonColor: '#F4A234',
        timer: 2000,
        timerProgressBar: true,
        showConfirmButton: false,
      });

      window.location.hash = "#login";

    } catch (err) {
      const msgs = {
        "auth/email-already-in-use": "That email is already registered.",
        "auth/invalid-email":        "Please enter a valid email address.",
        "auth/weak-password":        "Password is too weak."
      };
      showError('Registration Failed', msgs[err.code] || err.message);
    }
  });
}

// ---- LOGIN ----
const loginBtn = document.querySelector("#login .btn-orange");
if (loginBtn) {
  loginBtn.addEventListener("click", async () => {
    const inputs   = document.querySelectorAll("#login input");
    const email    = inputs[0].value.trim();
    const password = inputs[1].value.trim();

    if (!email || !password) {
      showError('Missing Fields', 'Please enter your email and password.');
      return;
    }

    try {
      const userCredential = await signInWithEmailAndPassword(auth, email, password);
      const name = userCredential.user.displayName || userCredential.user.email;

      await Swal.fire({
        icon: 'success',
        title: `Hello, ${name}! 👋`,
        text: 'Login successful! Taking you to your dashboard...',
        confirmButtonColor: '#F4A234',
        timer: 1500,
        timerProgressBar: true,
        showConfirmButton: false,
      });

      window.location.href = "dashboard.html";

    } catch (err) {
      const msgs = {
        "auth/user-not-found":     "No account found with that email.",
        "auth/wrong-password":     "Incorrect password. Please try again.",
        "auth/invalid-email":      "Please enter a valid email.",
        "auth/invalid-credential": "Wrong email or password."
      };
      showError('Login Failed', msgs[err.code] || err.message);
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
      showToast('warning', 'Please enter a nickname!');
      return;
    }

    saveBtn.disabled = true;
    saveBtn.innerHTML = '<span class="material-symbols-rounded">hourglass_empty</span> Saving...';

    try {
      await updateProfile(user, { displayName: nickname });
      localStorage.setItem('dash-avatar', selectedEmoji);

      const dashName         = document.getElementById('dash-name');
      const dashAvatar       = document.getElementById('dash-avatar');
      const dashHeaderName   = document.getElementById('dash-header-name');
      const dashHeaderAvatar = document.getElementById('dash-header-avatar');

      if (dashName)         dashName.textContent         = nickname;
      if (dashAvatar)       dashAvatar.textContent       = selectedEmoji;
      if (dashHeaderName)   dashHeaderName.textContent   = nickname;
      if (dashHeaderAvatar) dashHeaderAvatar.textContent = selectedEmoji;

      closeModal();
      showToast('success', 'Profile updated successfully!');

    } catch (err) {
      showToast('error', 'Failed to save. Please try again.');
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
    if (!user) {
      window.location.href = 'index.html#login';
      return;
    }

    const displayName = user.displayName || user.email.split('@')[0];

    const dashName         = document.getElementById('dash-name');
    const dashEmail        = document.getElementById('dash-email');
    const dashLogout       = document.getElementById('dash-logout');
    const dashHeaderName   = document.getElementById('dash-header-name');
    const dashAvatar       = document.getElementById('dash-avatar');
    const dashHeaderAvatar = document.getElementById('dash-header-avatar');

    if (dashName)         dashName.textContent         = displayName;
    if (dashEmail)        dashEmail.textContent        = user.email;
    if (dashHeaderName)   dashHeaderName.textContent   = displayName;

    const savedAvatar = localStorage.getItem('dash-avatar') || '🎮';
    if (dashAvatar)       dashAvatar.textContent       = savedAvatar;
    if (dashHeaderAvatar) dashHeaderAvatar.textContent = savedAvatar;

    if (dashLogout) {
      dashLogout.onclick = async () => {
        const confirm = await Swal.fire({
          title: 'Leaving? 👋',
          text: 'Are you sure you want to logout?',
          icon: 'question',
          showCancelButton: true,
          confirmButtonColor: '#e53935',
          cancelButtonColor: '#F4A234',
          confirmButtonText: 'Yes, logout',
          cancelButtonText: 'Stay'
        });
        if (confirm.isConfirmed) {
          signOut(auth).then(() => { window.location.href = 'index.html'; });
        }
      };
    }

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
    loginNavItem.onclick = async (e) => {
      e.preventDefault();
      const confirm = await Swal.fire({
        title: 'Leaving? 👋',
        text: 'Are you sure you want to logout?',
        icon: 'question',
        showCancelButton: true,
        confirmButtonColor: '#e53935',
        cancelButtonColor: '#F4A234',
        confirmButtonText: 'Yes, logout',
        cancelButtonText: 'Stay'
      });
      if (confirm.isConfirmed) {
        signOut(auth).then(() => {
          loginNavItem.innerHTML = `
            <span class="material-symbols-rounded">lock</span>
            <span>LOGIN</span>
          `;
          loginNavItem.href = "#login";
          loginNavItem.onclick = null;
        });
      }
    };
  }
});
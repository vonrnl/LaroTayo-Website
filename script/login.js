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

    const inputs   = document.querySelectorAll("#registration input");
    const firstName = inputs[0].value.trim();
    const lastName  = inputs[1].value.trim();
    const email     = inputs[2].value.trim();
    const password  = inputs[3].value.trim();

    if (!firstName || !lastName || !email || !password) {
      showMsg("#registration", "⚠️ Please fill in all fields.", true);
      return;
    }
    if (password.length < 6) {
      showMsg("#registration", "⚠️ Password must be at least 6 characters.", true);
      return;
    }

    try {
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);

      await updateProfile(userCredential.user, {
        displayName: firstName + " " + lastName
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
      setTimeout(() => { window.location.hash = "#home"; }, 1200);

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

onAuthStateChanged(auth, (user) => {
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
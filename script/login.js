import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  updateProfile
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  collection,
  getDocs,
  query,
  where,
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

// ---- ADMIN / TEACHER LOGIN ----
// No more hardcoded credentials. This is now a real Firebase Auth login,
// checked against a 'teachers' Firestore doc (uid -> {role: 'admin' | 'teacher'}).
// NOTE: the "admin-username" field must now collect an EMAIL address, since
// Firebase Auth signs in with email/password. Update the label/placeholder
// in your login form's HTML from "Username" to "Email".
const adminLoginBtn = document.getElementById('admin-login-btn');
if (adminLoginBtn) {
  adminLoginBtn.addEventListener('click', async () => {
    const email = document.getElementById('admin-username').value.trim();
    const pass  = document.getElementById('admin-password').value.trim();
    const err   = document.getElementById('admin-err');

    if (!email || !pass) { err.textContent = 'Please fill in both fields.'; return; }

    err.textContent = '';
    adminLoginBtn.textContent = 'Signing in...';
    adminLoginBtn.disabled = true;

    try {
      const cred = await signInWithEmailAndPassword(auth, email, pass);
      const teacherSnap = await getDoc(doc(db, 'teachers', cred.user.uid));

      if (!teacherSnap.exists() || !['admin', 'teacher'].includes(teacherSnap.data().role)) {
        // Valid Firebase account, but not a teacher/admin account — reject.
        await signOut(auth);
        err.textContent = 'This account is not authorized for the teacher panel.';
        adminLoginBtn.textContent = 'Login';
        adminLoginBtn.disabled = false;
        return;
      }

      adminLoginBtn.textContent = 'Redirecting...';
      window.location.href = 'admin.html';

    } catch (e) {
      const msgs = {
        "auth/user-not-found":     "No account found with that email.",
        "auth/wrong-password":     "Incorrect password. Please try again.",
        "auth/invalid-email":      "Please enter a valid email address.",
        "auth/invalid-credential": "Wrong email or password.",
        "auth/too-many-requests":  "Too many attempts. Please wait and try again."
      };
      err.textContent = msgs[e.code] || e.message;
      adminLoginBtn.textContent = 'Login';
      adminLoginBtn.disabled = false;
    }
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

// ---- POPULATE "SELECT YOUR TEACHER" DROPDOWN ----
// Runs once on page load. Requires a Firestore rule that lets anyone
// (even signed-out visitors) read the 'teachers' collection — see the
// updated firestore.rules.
const regTeacherSelect = document.getElementById('reg-teacher');
if (regTeacherSelect) {
  (async () => {
    try {
      const snap = await getDocs(query(collection(db, 'teachers'), where('role', '==', 'teacher')));
      snap.forEach(docSnap => {
        const t = docSnap.data();
        const opt = document.createElement('option');
        opt.value = t.uid;
        opt.textContent = t.username;
        regTeacherSelect.appendChild(opt);
      });
      if (snap.empty) {
        const opt = document.createElement('option');
        opt.value = '';
        opt.textContent = 'No teachers available yet';
        opt.disabled = true;
        regTeacherSelect.appendChild(opt);
      }
    } catch (e) {
      console.error('Could not load teacher list:', e);
    }
  })();
}

// ---- REGISTRATION (FIXED) ----
const regBtn = document.getElementById('register-btn');

if (regBtn) {
  regBtn.addEventListener('click', async () => {
    const username    = document.getElementById('reg-username').value.trim();
    const email       = document.getElementById('reg-email').value.trim();
    const password    = document.getElementById('reg-password').value.trim();
    const confirmPass = document.getElementById('reg-confirm').value.trim();
    const teacherId   = regTeacherSelect ? regTeacherSelect.value : '';

    if (!username || !email || !password || !confirmPass) {
      Swal.fire({ icon: 'warning', title: 'Missing Fields', text: 'Please fill in all fields.' });
      return;
    }

    if (regTeacherSelect && !teacherId) {
      Swal.fire({ icon: 'warning', title: 'Select a Teacher', text: 'Please choose your teacher before signing up.' });
      return;
    }

    if (password.length < 6) {
      Swal.fire({ icon: 'warning', title: 'Weak Password', text: 'Password must be at least 6 characters.' });
      return;
    }

    if (password !== confirmPass) {
      Swal.fire({ icon: 'error', title: 'Password Mismatch', text: 'Passwords do not match.' });
      return;
    }

    regBtn.textContent = 'Creating account...';
    regBtn.disabled = true;

    const resetBtn = () => {
      regBtn.textContent = 'Sign up';
      regBtn.disabled = false;
    };

    try {
      // 🔹 STEP 1: Create Auth Account
      console.log('[REG] Step 1...');
      const userCredential = await createUserWithEmailAndPassword(auth, email, password);
      const user = userCredential.user;
      console.log('[REG] Step 1 OK');

      // 🔹 STEP 2: Update Profile
      console.log('[REG] Step 2...');
      await updateProfile(user, { displayName: username });
      console.log('[REG] Step 2 OK');

      // 🔹 STEP 3: Save to Firestore (CRITICAL)
      console.log('[REG] Step 3...');
      await setDoc(doc(db, 'students', user.uid), {
        uid: user.uid,
        username: username,
        email: email,
        joined: new Date().toISOString().split('T')[0],
        status: 'active',
        teacherId: teacherId || null,
        createdAt: serverTimestamp(),
      });
      console.log('[REG] Step 3 OK');

      // 🔹 STEP 4: SUCCESS
      resetBtn();

      await Swal.fire({
        icon: 'success',
        title: 'Account Created! 🎉',
        text: 'Welcome to Laro Tayo! Please login to continue.'
      });

      // 👉 Close registration modal and go to student login modal
      window.location.hash = 'student-login';

    } catch (err) {
      console.error('[REG ERROR]', err.code, err.message);

      const messages = {
        "auth/email-already-in-use": "That email is already registered.",
        "auth/invalid-email": "Invalid email address.",
        "auth/weak-password": "Password is too weak.",
        "permission-denied": "Database permission denied. Check Firestore rules."
      };

      Swal.fire({
        icon: 'error',
        title: 'Registration Failed',
        text: messages[err.code] || err.message
      });

      resetBtn();
    }
  });
}

// ---- AUTH STATE ----
onAuthStateChanged(auth, async (user) => {
  const isDashboard = window.location.pathname.includes('dashboard');

  if (isDashboard) {
    if (!user) { window.location.href = 'index.html'; }
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
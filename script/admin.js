import { initializeApp, getApps, getApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updateProfile,
  updatePassword,
  reauthenticateWithCredential,
  EmailAuthProvider,
  onAuthStateChanged,
  signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
  where,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey:            "AIzaSyDtB1ouns3wY1ljekvHm8h-_V_ChAcNjJw",
  authDomain:        "bestinthesis-ef4e4.firebaseapp.com",
  projectId:         "bestinthesis-ef4e4",
  storageBucket:     "bestinthesis-ef4e4.firebasestorage.app",
  messagingSenderId: "774078773253",
  appId:             "1:774078773253:web:28a0345c51393e9d9e046c",
};

const app  = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ============================================================
   SECONDARY FIREBASE APP
   ------------------------------------------------------------
   createUserWithEmailAndPassword() signs the browser in as the
   NEW account on whatever `auth` instance you call it with.
   That means if the admin registers a student using the same
   `auth` as their own session, they get bumped out and replaced
   by the new student. To avoid that, every "create another
   person's account" action runs on a short-lived secondary
   Firebase app instance, which we tear down right after.
   ============================================================ */
async function createAccountWithoutSwitchingSession(email, password) {
  const secondaryApp = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const cred = await createUserWithEmailAndPassword(secondaryAuth, email, password);
    const uid = cred.user.uid;
    await signOut(secondaryAuth); // just in case; the secondary app is about to be discarded anyway
    return uid;
  } finally {
    await deleteApp(secondaryApp);
  }
}

/* ============================================================
   STATE
   ============================================================ */
let STUDENTS         = [];
let filteredStudents = [];
let CURRENT_UID        = null;
let CURRENT_USERNAME   = '';
let studentsUnsub       = null;

/* ============================================================
   INIT — gate everything behind a confirmed admin session
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) {
      window.location.href = 'index.html';
      return;
    }

    try {
      const teacherSnap = await getDoc(doc(db, 'teachers', user.uid));
      if (!teacherSnap.exists() || !['admin', 'teacher'].includes(teacherSnap.data().role)) {
        // Signed in with Firebase, but not an admin/teacher account
        window.location.href = 'dashboard.html';
        return;
      }

      CURRENT_UID      = user.uid;
      CURRENT_USERNAME = teacherSnap.data().username || user.email;
      const badge = document.querySelector('.admin-nav-badge span');
      if (badge) badge.textContent = `${teacherSnap.data().role.toUpperCase()} · ${CURRENT_USERNAME}`;

      initTabs();
      initHamburger();
      initUserSearch();
      initStudentModal();
      initProgressModal();
      initSettings();
      initLogout();
      listenToStudents();
    } catch (err) {
      console.error('Auth check failed:', err);
      window.location.href = 'index.html';
    }
  });
});

/* ============================================================
   FIRESTORE REAL-TIME LISTENER
   ------------------------------------------------------------
   The admin sees every student.

   NOTE: we deliberately do NOT use orderBy('joined') here.
   Firestore's orderBy() silently EXCLUDES any document that is
   missing that field entirely — it doesn't sort it last, it just
   never returns it. Some student docs (created via a path that
   skipped the normal registration flow) have no 'joined' field,
   so they'd vanish from this table with no error. We fetch
   everything and sort client-side instead, which can't drop rows.
   ============================================================ */
function listenToStudents() {
  const studentsRef = collection(db, 'students');
  const q = query(studentsRef);

  if (studentsUnsub) studentsUnsub();
  studentsUnsub = onSnapshot(q, (snapshot) => {
    STUDENTS = snapshot.docs.map(docSnap => ({
      id:        docSnap.id,
      username:  docSnap.data().username || '(no username)',
      email:     docSnap.data().email || '(no email)',
      joined:    docSnap.data().joined || null,
      createdAt: docSnap.data().createdAt || null,
      uid:       docSnap.data().uid || null,
    }));

    // Sort newest first: prefer 'joined' (a plain date string), fall back
    // to the 'createdAt' server timestamp, and push anything with neither
    // to the bottom instead of hiding it.
    STUDENTS.sort((a, b) => sortableTime(b) - sortableTime(a));

    filteredStudents = [...STUDENTS];
    populateUsersTable(STUDENTS);
    document.getElementById('user-count-badge').textContent = STUDENTS.length;

  }, (error) => {
    console.error('Firestore listener error:', error);
    Swal.fire({ title: 'Database Error', text: 'Could not load students. Check your Firestore rules.', confirmButtonColor: '#e53935' });
  });
}

function sortableTime(record) {
  if (record.joined) {
    const t = new Date(record.joined).getTime();
    if (!isNaN(t)) return t;
  }
  if (record.createdAt && typeof record.createdAt.toMillis === 'function') {
    return record.createdAt.toMillis();
  }
  return 0; // no usable date — sinks to the bottom, but still shows up
}

/* ============================================================
   TAB NAVIGATION
   ============================================================ */
function initTabs() {
  const allTabBtns = document.querySelectorAll('.admin-tab-btn');
  const panels     = document.querySelectorAll('.admin-tab-panel');

  allTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;
      allTabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === target));
      panels.forEach(p => p.classList.toggle('active', p.id === `tab-${target}`));
      const mobileMenu = document.getElementById('admin-mobile-menu');
      if (mobileMenu) mobileMenu.classList.remove('open');
    });
  });
}

/* ============================================================
   HAMBURGER (MOBILE)
   ============================================================ */
function initHamburger() {
  const hamburger  = document.getElementById('admin-hamburger');
  const mobileMenu = document.getElementById('admin-mobile-menu');
  if (!hamburger || !mobileMenu) return;

  hamburger.addEventListener('click', () => {
    mobileMenu.classList.toggle('open');
    hamburger.classList.toggle('open');
  });

  document.addEventListener('click', e => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
      hamburger.classList.remove('open');
    }
  });
}

/* ============================================================
   STUDENTS TABLE
   ============================================================ */
function populateUsersTable(students) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  const colCount = 5;

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:28px;color:#aaa">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((u, i) => {
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${formatDate(u.joined)}</td>
      <td>
        <div class="action-btns">
          <button class="tbl-btn view" onclick="openProgressModal('${u.id}')" title="View progress">
            Progress
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ============================================================
   SEARCH
   ============================================================ */
function initUserSearch() {
  const searchInput = document.getElementById('user-search');
  if (!searchInput) return;

  searchInput.addEventListener('input', () => {
    const q = searchInput.value.toLowerCase().trim();
    filteredStudents = STUDENTS.filter(u =>
      !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q)
    );
    populateUsersTable(filteredStudents);
  });
}

/* ============================================================
   REGISTER STUDENT
   ============================================================ */
function initStudentModal() {
  // Register tab form
  const registerBtn = document.getElementById('register-student-btn');
  if (registerBtn) registerBtn.addEventListener('click', registerFromTab);
}

async function registerFromTab() {
  const username = document.getElementById('reg-username').value.trim();
  const email    = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();
  const confirm  = document.getElementById('reg-confirm').value.trim();
  const btn      = document.getElementById('register-student-btn');

  if (!username || !email || !password || !confirm) {
    Swal.fire({ title: 'Incomplete', text: 'Please fill in all fields.', confirmButtonColor: '#F4A234' });
    return;
  }
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    Swal.fire({ title: 'Invalid Email', text: 'Please enter a valid email address.', confirmButtonColor: '#e53935' });
    return;
  }
  if (password.length < 6) {
    Swal.fire({ title: 'Too Short', text: 'Password must be at least 6 characters.', confirmButtonColor: '#e53935' });
    return;
  }
  if (password !== confirm) {
    Swal.fire({ title: 'Mismatch', text: 'Passwords do not match.', confirmButtonColor: '#e53935' });
    return;
  }

  btn.disabled = true;
  btn.innerHTML = 'Registering...';

  try {
    const uid = await createAccountWithoutSwitchingSession(email, password);
    await setDoc(doc(db, 'students', uid), {
      uid, username, email,
      joined:    new Date().toISOString().split('T')[0],
      status:    'active',
      createdAt: serverTimestamp(),
    });
    // Clear form
    ['reg-username','reg-email','reg-password','reg-confirm'].forEach(id => document.getElementById(id).value = '');
    Swal.fire({ title: 'Registered!', text: `${username} has been added as a student.`, timer: 2000, showConfirmButton: false });
    // Switch to students tab
    document.querySelector('[data-tab="users"]').click();
  } catch (err) {
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered.';
    if (err.code === 'auth/weak-password')        msg = 'Password must be at least 6 characters.';
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Register Student';
  }
}

/* ============================================================
   STUDENT PROGRESS (story + stats + badges)
   ------------------------------------------------------------
   Uses the same rules as the student dashboard so both show the
   same numbers. Story progress is read from
   students/{uid}/storySaves, where the Unity game saves it (one
   document per save slot, each with 'completedStage' 0-4). The
   furthest save is the one that counts.
   ============================================================ */
const STORY_CHAPTERS = [
  { id: 1, title: 'Hulihin ang Baboy' },
  { id: 2, title: 'Sipa' },
  { id: 3, title: 'Palosebo' },
  { id: 4, title: 'Luksong Baka' },
];

// Same badges as the student dashboard (dashboard.js).
// Sipa / Hulihin ang Baboy / Luksong Baka are saved by Unity in
// students/{uid}/achievements/{id}. 'Tapos ang Kwento' is worked
// out from the story saves (all chapters completed).
const ACHIEVEMENTS = [
  { id:'sipa',              title:'Sipa',              desc:'Unlocked by completing the Sipa stage.',
    detail:(d)    => `Best score: ${num(d && d.bestScore)}` },
  { id:'hulihin_ang_baboy', title:'Hulihin ang Baboy', desc:'Unlocked by completing the Hulihin ang Baboy stage.',
    detail:(d)    => `Best time: ${getBestTime(d)}` },
  { id:'luksong_baka',      title:'Luksong Baka',      desc:'Unlocked by completing the Luksong Baka stage.',
    detail:(d)    => `Best score: ${num(d && d.bestScore)} - Best level: ${num(d && d.bestLevel)}` },
  { id:'story_complete',    title:'Tapos ang Kwento',  desc:'Unlocked by completing all story chapters.',
    stage: STORY_CHAPTERS.length,
    detail:(d, s) => `${s.chaptersCompleted}/${s.totalChapters} chapters completed`,
    goal:(s)      => `${s.chaptersCompleted}/${s.totalChapters} chapters` },
];

function formatAchievementTime(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return '--:--.---';
  const t = Math.max(0, Math.round(ms));
  return String(Math.floor(t / 60000)).padStart(2, '0') + ':' +
         String(Math.floor((t % 60000) / 1000)).padStart(2, '0') + '.' +
         String(t % 1000).padStart(3, '0');
}

function getBestTime(d) {
  if (!d) return '--:--.---';
  if (typeof d.bestTimeDisplay === 'string' && d.bestTimeDisplay.trim() !== '') return d.bestTimeDisplay.trim();
  if (typeof d.bestTimeMs === 'number') return formatAchievementTime(d.bestTimeMs);
  return '--:--.---';
}

let progressRequestId = 0;

function num(v) { return typeof v === 'number' && isFinite(v) ? v : 0; }

function formatTimestamp(ts) {
  if (!ts || typeof ts.toDate !== 'function') return '—';
  return ts.toDate().toLocaleString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
}

function initProgressModal() {
  const overlay  = document.getElementById('progress-modal-overlay');
  const closeBtn = document.getElementById('progress-close-btn');
  if (closeBtn) closeBtn.addEventListener('click', closeProgressModal);
  if (overlay)  overlay.addEventListener('click', e => { if (e.target === overlay) closeProgressModal(); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeProgressModal(); });
}

function closeProgressModal() {
  progressRequestId++; // ignore any read that is still in flight
  const overlay = document.getElementById('progress-modal-overlay');
  if (overlay) overlay.classList.remove('open');
}

async function openProgressModal(firestoreId) {
  const student = STUDENTS.find(s => s.id === firestoreId);
  if (!student) return;

  const overlay = document.getElementById('progress-modal-overlay');
  const body    = document.getElementById('progress-modal-body');
  document.getElementById('progress-modal-title').textContent = `${student.username} — Progress`;
  body.innerHTML = '<p class="pg-loading">Loading progress...</p>';
  overlay.classList.add('open');

  const requestId = ++progressRequestId;

  // Every read is independent, so one blocked read doesn't hide the rest.
  const safe = async (label, fn) => {
    try { return { ok: true, label, value: await fn() }; }
    catch (err) { console.error(`Progress read failed (${label}):`, err); return { ok: false, label, error: err }; }
  };

  const [userRes, savesRes, friendsRes, achRes] = await Promise.all([
    safe('student stats',  () => getDoc(doc(db, 'students', firestoreId))),
    safe('story saves',    () => getDocs(collection(db, 'students', firestoreId, 'storySaves'))),
    safe('friends',        () => getDocs(collection(db, 'students', firestoreId, 'friends'))),
    safe('badges',         () => getDocs(collection(db, 'students', firestoreId, 'achievements'))),
  ]);

  if (requestId !== progressRequestId) return; // a newer popup was opened, or this one was closed

  const total = STORY_CHAPTERS.length;
  const u     = userRes.ok && userRes.value.exists() ? userRes.value.data() : {};
  const saves = savesRes.ok ? savesRes.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  const saved = achRes.ok ? new Map(achRes.value.docs.map(d => [d.id, d.data()])) : new Map();

  const chaptersCompleted = Math.min(total, saves.reduce((m, s) => Math.max(m, num(s.completedStage)), 0));
  const friendCount       = friendsRes.ok ? friendsRes.value.size : 0;

  const stats = {
    chaptersCompleted,
    totalChapters:     total,
    friendCount,
  };

  // ---- warning for anything that couldn't be read ----
  const failed = [userRes, savesRes, friendsRes, achRes].filter(r => !r.ok);
  const warnHtml = failed.length
    ? `<div class="pg-warning">Could not read: ${failed.map(r => r.label).join(', ')} (${
        escapeHtml([...new Set(failed.map(r => r.error.code || r.error.message))].join(', '))
      }). Check your Firestore rules.</div>`
    : '';

  // ---- story section ----
  const started = saves.length > 0;
  const pct     = Math.round((chaptersCompleted / total) * 100);

  let storyHtml;
  if (!savesRes.ok) {
    storyHtml = '<p class="pg-row-meta">Story progress could not be loaded.</p>';
  } else {
    const chapterRows = STORY_CHAPTERS.map(ch => {
      let state = 'locked', label = 'Locked';
      if (ch.id <= chaptersCompleted) {
        state = 'done'; label = 'Completed';
      } else if (ch.id === chaptersCompleted + 1) {
        if (started) { state = 'current'; label = 'In progress'; }
        else         { label = 'Not started'; }
      }
      return `<li class="pg-row">
        <span class="pg-row-title">Chapter ${ch.id}: ${ch.title}</span>
        <span class="pg-pill ${state}">${label}</span>
      </li>`;
    }).join('');

    const slotRows = [...saves]
      .sort((a, b) => num(b.completedStage) - num(a.completedStage))
      .map((s, i) => `<li class="pg-row">
        <div>
          <span class="pg-row-title">${escapeHtml(s.currentGame || '—')}</span>
          <div class="pg-row-meta">Save ${i + 1} - last saved ${formatTimestamp(s.updatedAt)}</div>
        </div>
        <span class="pg-row-meta">${Math.min(num(s.completedStage), total)} of ${total} chapters</span>
      </li>`).join('');

    storyHtml = `
      <div class="pg-story-head"><strong>${pct}%</strong><span>${chaptersCompleted} of ${total} chapters completed</span></div>
      <div class="pg-bar"><div class="pg-bar-fill" style="width:${pct}%"></div></div>
      <ul class="pg-list">${chapterRows}</ul>
      <p class="pg-subhead">Save slots (${saves.length})</p>
      ${saves.length ? `<ul class="pg-list">${slotRows}</ul>` : '<p class="pg-row-meta" style="margin-top:8px">No story saves yet. The student has not started a New Game in Unity.</p>'}`;
  }

  // ---- badges section ----
  let unlockedCount = 0;
  const badgeRows = ACHIEVEMENTS.map(a => {
    const data = saved.get(a.id);
    // Same rules as dashboard.js: Luksong Baka needs a real win
    // (completed === true); the other Unity badges need a document
    // that is not marked unlocked:false; the story badge uses chapters.
    const unlocked = a.stage
      ? chaptersCompleted >= a.stage
      : (!!data && (a.id === 'luksong_baka' ? data.completed === true : data.unlocked !== false));
    if (unlocked) unlockedCount++;
    const info = unlocked ? `<div class="pg-row-meta">${escapeHtml(a.detail(data, stats))}</div>` : '';
    return `<li class="pg-row">
      <div>
        <span class="pg-row-title">${a.title}</span>
        <div class="pg-row-meta">${a.desc}</div>
        ${info}
      </div>
      <span class="pg-pill ${unlocked ? 'done' : 'locked'}">${unlocked ? 'Unlocked' : (a.goal ? a.goal(stats) : 'Locked')}</span>
    </li>`;
  }).join('');

  body.innerHTML = `
    ${warnHtml}
    <div class="pg-stats">
      <div class="pg-stat"><strong>${friendsRes.ok ? friendCount : 'N/A'}</strong><span>Friends</span></div>
    </div>
    <div class="pg-section">
      <h4>Story progress</h4>
      ${storyHtml}
    </div>
    <div class="pg-section">
      <h4>Badges (${unlockedCount} of ${ACHIEVEMENTS.length} unlocked)</h4>
      <ul class="pg-list two-col">${badgeRows}</ul>
    </div>`;
}

/* ============================================================
   SETTINGS
   ============================================================ */
function initSettings() {
  const changePassBtn = document.getElementById('change-pass-btn');
  if (changePassBtn) changePassBtn.addEventListener('click', async () => {
    const cur  = document.getElementById('cur-pass').value;
    const nw   = document.getElementById('new-pass').value;
    const conf = document.getElementById('conf-pass').value;

    if (!cur || !nw || !conf) {
      Swal.fire({ title: 'Incomplete', text: 'Please fill in all password fields.', confirmButtonColor: '#F4A234' });
      return;
    }
    if (nw !== conf) {
      Swal.fire({ title: 'Mismatch', text: 'New passwords do not match.', confirmButtonColor: '#e53935' });
      return;
    }
    if (nw.length < 6) {
      Swal.fire({ title: 'Too Short', text: 'Password must be at least 6 characters.', confirmButtonColor: '#e53935' });
      return;
    }

    changePassBtn.disabled = true;
    changePassBtn.innerHTML = 'Updating...';

    try {
      const user = auth.currentUser;
      const credential = EmailAuthProvider.credential(user.email, cur);
      await reauthenticateWithCredential(user, credential); // proves they know the CURRENT password
      await updatePassword(user, nw);
      Swal.fire({ title: 'Password Updated', text: 'Your password has been changed.', timer: 2000, showConfirmButton: false });
      ['cur-pass', 'new-pass', 'conf-pass'].forEach(id => document.getElementById(id).value = '');
    } catch (err) {
      const msgs = {
        "auth/wrong-password":     "Your current password is incorrect.",
        "auth/invalid-credential": "Your current password is incorrect.",
        "auth/weak-password":      "New password must be at least 6 characters.",
        "auth/requires-recent-login": "Please log out and back in, then try again."
      };
      Swal.fire({ title: 'Error', text: msgs[err.code] || err.message, confirmButtonColor: '#e53935' });
    } finally {
      changePassBtn.disabled = false;
      changePassBtn.innerHTML = 'Update Password';
    }
  });

}

/* ============================================================
   LOGOUT
   ============================================================ */
function initLogout() {
  const logoutBtn = document.getElementById('admin-logout');
  if (!logoutBtn) return;
  logoutBtn.addEventListener('click', () => {
    Swal.fire({
      title: 'Logout?',
      text:  'Are you sure you want to sign out?',
      showCancelButton:   true,
      confirmButtonText:  'Yes, logout',
      cancelButtonText:   'Cancel',
      confirmButtonColor: '#1A3A5C',
      cancelButtonColor:  '#6A8AA0',
    }).then(async r => {
      if (r.isConfirmed) {
        await signOut(auth);
        window.location.href = 'index.html';
      }
    });
  });
}

/* ============================================================
   HELPERS
   ============================================================ */
function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str || ''));
  return div.innerHTML;
}

// Expose for inline onclick handlers in the table
window.openProgressModal = openProgressModal;
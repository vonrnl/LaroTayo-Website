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
   That means if a teacher registers a student using the same
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
let TEACHERS          = [];
let CURRENT_UID        = null;
let CURRENT_ROLE       = null; // 'admin' | 'teacher'
let CURRENT_USERNAME   = '';
let studentsUnsub       = null;
let teachersUnsub        = null;

/* ============================================================
   INIT — gate everything behind a confirmed teacher/admin session
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
        // Signed in with Firebase, but not an authorized teacher/admin account
        await signOut(auth);
        window.location.href = 'index.html';
        return;
      }

      CURRENT_UID      = user.uid;
      CURRENT_ROLE     = teacherSnap.data().role;
      CURRENT_USERNAME = teacherSnap.data().username || user.email;

      initTabs();
      initHamburger();
      initUserSearch();
      initStudentModal();
      initProgressModal();
      initSettings();
      initLogout();
      initTeacherRoleUI();
      listenToStudents();
      if (CURRENT_ROLE === 'admin') {
        initTeachersTab();
        listenToTeachers();
      }
    } catch (err) {
      console.error('Auth check failed:', err);
      window.location.href = 'index.html';
    }
  });
});

/* ============================================================
   ROLE-BASED UI
   ============================================================ */
function initTeacherRoleUI() {
  const badge = document.querySelector('.admin-nav-badge span:last-child');
  if (badge) badge.textContent = CURRENT_ROLE === 'admin' ? 'ADMIN' : 'TEACHER';

  // Anything marked data-admin-only is hidden from plain teachers
  document.querySelectorAll('[data-admin-only]').forEach(el => {
    el.style.display = CURRENT_ROLE === 'admin' ? '' : 'none';
  });

  initUsersTableHeaderForRole();
}

/* ============================================================
   FIRESTORE REAL-TIME LISTENER
   ------------------------------------------------------------
   Admins see every student. Teachers only see students whose
   teacherId matches their own uid.

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
  const q = CURRENT_ROLE === 'admin'
    ? query(studentsRef)
    : query(studentsRef, where('teacherId', '==', CURRENT_UID));

  if (studentsUnsub) studentsUnsub();
  studentsUnsub = onSnapshot(q, (snapshot) => {
    STUDENTS = snapshot.docs.map(docSnap => ({
      id:        docSnap.id,
      username:  docSnap.data().username || '(no username)',
      email:     docSnap.data().email || '(no email)',
      joined:    docSnap.data().joined || null,
      createdAt: docSnap.data().createdAt || null,
      uid:       docSnap.data().uid || null,
      teacherId: docSnap.data().teacherId || null,
      lastSeen:  docSnap.data().lastSeen || null,
      isOnline:  docSnap.data().isOnline || false,
    }));

    // Sort newest first: prefer 'joined' (a plain date string), fall back
    // to the 'createdAt' server timestamp, and push anything with neither
    // to the bottom instead of hiding it.
    STUDENTS.sort((a, b) => sortableTime(b) - sortableTime(a));

    filteredStudents = [...STUDENTS];
    populateUsersTable(STUDENTS);
    document.getElementById('user-count-badge').textContent = STUDENTS.length;
    updateOnlineCount();

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
   TEACHERS LISTENER (admin only) — used for the Teachers tab
   and for the "Assigned Teacher" dropdown in the edit modal.
   Same reasoning as above: no server-side orderBy, sort client-side.
   ============================================================ */
function listenToTeachers() {
  const q = query(collection(db, 'teachers'));
  if (teachersUnsub) teachersUnsub();
  teachersUnsub = onSnapshot(q, (snapshot) => {
    TEACHERS = snapshot.docs.map(docSnap => ({
      id:       docSnap.id,
      uid:      docSnap.data().uid,
      username: docSnap.data().username || '(no username)',
      email:    docSnap.data().email || '(no email)',
      role:     docSnap.data().role,
      joined:   docSnap.data().joined || null,
    }));
    TEACHERS.sort((a, b) => sortableTime(b) - sortableTime(a));
    populateTeachersTable(TEACHERS);
    const badge = document.getElementById('teacher-count-badge');
    if (badge) badge.textContent = TEACHERS.length;
  }, (error) => {
    console.error('Teachers listener error:', error);
  });
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

  const isAdmin  = CURRENT_ROLE === 'admin';
  const colCount = isAdmin ? 7 : 6;

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="${colCount}" style="text-align:center;padding:28px;color:#aaa">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((u, i) => {
    const online = isUserOnline(u);
    const statusHtml = online
      ? `<span class="status-pill online"><span class="online-dot"></span>Online</span>`
      : `<span class="status-pill offline">Offline</span>`;
    const teacherCell = isAdmin
      ? `<td>${escapeHtml(teacherNameForId(u.teacherId))}</td>`
      : '';
    return `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      ${teacherCell}
      <td>${formatDate(u.joined)}</td>
      <td>${statusHtml}</td>
      <td>
        <div class="action-btns">
          <button class="tbl-btn view" onclick="openProgressModal('${u.id}')" title="View progress">
            Progress
          </button>
          <button class="tbl-btn edit" onclick="openEditModal('${u.id}')" title="Edit">
            Edit
          </button>
          <button class="tbl-btn delete" onclick="deleteUser('${u.id}')" title="Delete">
            Delete
          </button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

function teacherNameForId(teacherId) {
  if (!teacherId) return '— Unassigned —';
  const t = TEACHERS.find(t => t.uid === teacherId);
  return t ? t.username : '— Unknown —';
}

/* Adds the "Teacher" header column when viewing as admin */
function initUsersTableHeaderForRole() {
  const headRow = document.querySelector('.admin-table thead tr');
  if (!headRow || CURRENT_ROLE !== 'admin') return;
  if (headRow.querySelector('[data-col="teacher"]')) return; // already added
  const th = document.createElement('th');
  th.textContent = 'Teacher';
  th.setAttribute('data-col', 'teacher');
  const joinedTh = [...headRow.children].find(th => th.textContent.trim() === 'Joined');
  headRow.insertBefore(th, joinedTh || null);
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
   STUDENT MODAL — REGISTER & EDIT
   ============================================================ */
function initStudentModal() {
  // Register tab form
  const registerBtn = document.getElementById('register-student-btn');
  if (registerBtn) registerBtn.addEventListener('click', registerFromTab);

  // Edit modal
  const overlay   = document.getElementById('student-modal-overlay');
  const closeBtn  = document.getElementById('modal-close-btn');
  const cancelBtn = document.getElementById('modal-cancel-btn');
  const saveBtn   = document.getElementById('modal-save-btn');
  [closeBtn, cancelBtn].forEach(btn => { if (btn) btn.addEventListener('click', closeModal); });
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  if (saveBtn) saveBtn.addEventListener('click', saveEditStudent);
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
      teacherId: CURRENT_UID, // owned by whichever teacher/admin registered them
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

function openEditModal(firestoreId) {
  const student = STUDENTS.find(s => s.id === firestoreId);
  if (!student) return;

  document.getElementById('modal-user-id').value  = student.id;
  document.getElementById('modal-username').value = student.username;
  document.getElementById('modal-email').value    = student.email;

  const teacherField = document.getElementById('modal-teacher-field');
  const teacherSelect = document.getElementById('modal-teacher');
  if (teacherField && teacherSelect) {
    if (CURRENT_ROLE === 'admin') {
      teacherField.style.display = '';
      teacherSelect.innerHTML = '<option value="">— Unassigned —</option>' +
        TEACHERS.map(t => `<option value="${t.uid}">${escapeHtml(t.username)}</option>`).join('');
      teacherSelect.value = student.teacherId || '';
    } else {
      teacherField.style.display = 'none';
    }
  }

  document.getElementById('student-modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('student-modal-overlay').classList.remove('open');
}

/* ============================================================
   SAVE EDIT STUDENT
   ============================================================ */
async function saveEditStudent() {
  const firestoreId = document.getElementById('modal-user-id').value;
  const username    = document.getElementById('modal-username').value.trim();
  const email       = document.getElementById('modal-email').value.trim();
  const saveBtn     = document.getElementById('modal-save-btn');

  if (!username || !email) {
    Swal.fire({ title: 'Incomplete', text: 'Please fill in the username and email.', confirmButtonColor: '#F4A234' });
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = 'Saving...';

  const updates = { username, email };
  if (CURRENT_ROLE === 'admin') {
    const teacherSelect = document.getElementById('modal-teacher');
    if (teacherSelect) updates.teacherId = teacherSelect.value || null;
  }

  try {
    await updateDoc(doc(db, 'students', firestoreId), updates);
    closeModal();
    Swal.fire({ title: 'Updated!', text: `${username}'s details have been saved.`, timer: 2000, showConfirmButton: false });
  } catch (err) {
    console.error('saveEditStudent error:', err);
    Swal.fire({ title: 'Error', text: err.message, confirmButtonColor: '#e53935' });
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = 'Save Changes';
  }
}

/* ============================================================
   DELETE STUDENT
   ============================================================ */
function deleteUser(firestoreId) {
  const student = STUDENTS.find(s => s.id === firestoreId);
  if (!student) return;

  Swal.fire({
    title: 'Remove Student?',
    html:  `Are you sure you want to remove <strong>${escapeHtml(student.username)}</strong>?`,
    showCancelButton:   true,
    confirmButtonText:  'Yes, remove',
    cancelButtonText:   'Cancel',
    confirmButtonColor: '#e53935',
    cancelButtonColor:  '#6A8AA0',
  }).then(async result => {
    if (result.isConfirmed) {
      try {
        await deleteDoc(doc(db, 'students', firestoreId));
        Swal.fire({ title: 'Removed!', text: `${student.username} has been removed.`, timer: 2000, showConfirmButton: false });
      } catch (err) {
        console.error('deleteUser error:', err);
        Swal.fire({ title: 'Error', text: err.message, confirmButtonColor: '#e53935' });
      }
    }
  });
}

/* ============================================================
   TEACHERS TAB (admin only)
   ============================================================ */
function initTeachersTab() {
  const registerBtn = document.getElementById('register-teacher-btn');
  if (registerBtn) registerBtn.addEventListener('click', registerTeacher);
}

function populateTeachersTable(teachers) {
  const tbody = document.getElementById('teachers-table-body');
  if (!tbody) return;

  if (teachers.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:28px;color:#aaa">No teacher accounts yet.</td></tr>`;
    return;
  }

  tbody.innerHTML = teachers.map((t, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(t.username)}</strong></td>
      <td>${escapeHtml(t.email)}</td>
      <td>${t.role === 'admin' ? '<span class="status-pill online">Admin</span>' : '<span class="status-pill offline">Teacher</span>'}</td>
      <td>${formatDate(t.joined)}</td>
      <td>
        <div class="action-btns">
          <button class="tbl-btn delete" onclick="deleteTeacher('${t.id}')" title="Remove" ${t.uid === CURRENT_UID ? 'disabled style="opacity:.3;cursor:not-allowed"' : ''}>
            Delete
          </button>
        </div>
      </td>
    </tr>`).join('');
}

async function registerTeacher() {
  const username = document.getElementById('reg-teacher-username').value.trim();
  const email    = document.getElementById('reg-teacher-email').value.trim();
  const password = document.getElementById('reg-teacher-password').value.trim();
  const confirm  = document.getElementById('reg-teacher-confirm').value.trim();
  const btn      = document.getElementById('register-teacher-btn');

  if (!username || !email || !password || !confirm) {
    Swal.fire({ title: 'Incomplete', text: 'Please fill in all fields.', confirmButtonColor: '#F4A234' });
    return;
  }
  if (!/^\S+@\S+\.\S+$/.test(email)) {
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
  btn.innerHTML = 'Creating...';

  try {
    const uid = await createAccountWithoutSwitchingSession(email, password);
    await setDoc(doc(db, 'teachers', uid), {
      uid, username, email,
      role:      'teacher',
      joined:    new Date().toISOString().split('T')[0],
      createdAt: serverTimestamp(),
    });
    ['reg-teacher-username', 'reg-teacher-email', 'reg-teacher-password', 'reg-teacher-confirm']
      .forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    Swal.fire({ title: 'Teacher Added!', text: `${username} can now log in to their own teacher panel.`, timer: 2500, showConfirmButton: false });
  } catch (err) {
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered.';
    if (err.code === 'auth/weak-password')        msg = 'Password must be at least 6 characters.';
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  } finally {
    btn.disabled = false;
    btn.innerHTML = 'Register Teacher';
  }
}

function deleteTeacher(firestoreId) {
  const teacher = TEACHERS.find(t => t.id === firestoreId);
  if (!teacher) return;
  if (teacher.uid === CURRENT_UID) return; // can't remove yourself

  Swal.fire({
    title: 'Remove Teacher?',
    html:  `Are you sure you want to remove <strong>${escapeHtml(teacher.username)}</strong>? Their students will remain but become unassigned.`,
    showCancelButton:   true,
    confirmButtonText:  'Yes, remove',
    cancelButtonText:   'Cancel',
    confirmButtonColor: '#e53935',
    cancelButtonColor:  '#6A8AA0',
  }).then(async result => {
    if (!result.isConfirmed) return;
    try {
      // Removes their Firestore profile (revokes teacher-panel access).
      // Their Firebase Auth account still exists; deleting that requires
      // the Admin SDK on a backend, which this frontend-only app doesn't have.
      await deleteDoc(doc(db, 'teachers', firestoreId));
      Swal.fire({ title: 'Removed!', text: `${teacher.username} no longer has teacher-panel access.`, timer: 2500, showConfirmButton: false });
    } catch (err) {
      console.error('deleteTeacher error:', err);
      Swal.fire({ title: 'Error', text: err.message, confirmButtonColor: '#e53935' });
    }
  });
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

const ACHIEVEMENTS = [
  { id:'firstGame',   title:'Unang Laro',       desc:'Play your very first game.',       check:s => s.gamesPlayed >= 1,        goal:s => `${Math.min(s.gamesPlayed,1)}/1 games` },
  { id:'firstWin',    title:'Panalo!',          desc:'Win your first match.',            check:s => s.wins >= 1,               goal:s => `${Math.min(s.wins,1)}/1 wins` },
  { id:'fiveWins',    title:'Sunod-sunod',      desc:'Reach 5 total wins.',              check:s => s.wins >= 5,               goal:s => `${Math.min(s.wins,5)}/5 wins` },
  { id:'tenGames',    title:'Palaruan Regular', desc:'Play 10 games.',                   check:s => s.gamesPlayed >= 10,       goal:s => `${Math.min(s.gamesPlayed,10)}/10 games` },
  { id:'score1000',   title:'Libong Puntos',    desc:'Earn 1,000 total points.',         check:s => s.totalScore >= 1000,      goal:s => `${Math.min(s.totalScore,1000)}/1000 pts` },
  { id:'score5000',   title:'Iskor Hari',       desc:'Earn 5,000 total points.',         check:s => s.totalScore >= 5000,      goal:s => `${Math.min(s.totalScore,5000)}/5000 pts` },
  { id:'story1',      title:'Mambabasa',        desc:'Finish your first story chapter.', check:s => s.chaptersCompleted >= 1,  goal:s => `${Math.min(s.chaptersCompleted,1)}/1 chapter` },
  { id:'storyHalf',   title:'Kalahating Daan',  desc:'Finish half of the story.',        check:s => s.chaptersCompleted >= Math.ceil(s.totalChapters/2), goal:s => `${s.chaptersCompleted}/${Math.ceil(s.totalChapters/2)} chapters` },
  { id:'storyAll',    title:'Kampeon ng Bayan', desc:'Complete every story chapter.',    check:s => s.chaptersCompleted >= s.totalChapters, goal:s => `${s.chaptersCompleted}/${s.totalChapters} chapters` },
  { id:'firstFriend', title:'Bagong Kaibigan',  desc:'Add your first friend.',           check:s => s.friendCount >= 1,        goal:s => `${Math.min(s.friendCount,1)}/1 friend` },
  { id:'fiveFriends', title:'Barkada',          desc:'Reach 5 friends.',                 check:s => s.friendCount >= 5,        goal:s => `${Math.min(s.friendCount,5)}/5 friends` },
];

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
    safe('saved badges',   () => getDoc(doc(db, 'achievements', firestoreId))),
  ]);

  if (requestId !== progressRequestId) return; // a newer popup was opened, or this one was closed

  const total = STORY_CHAPTERS.length;
  const u     = userRes.ok && userRes.value.exists() ? userRes.value.data() : {};
  const saves = savesRes.ok ? savesRes.value.docs.map(d => ({ id: d.id, ...d.data() })) : [];
  const saved = achRes.ok && achRes.value.exists() ? achRes.value.data() : {};

  const chaptersCompleted = Math.min(total, saves.reduce((m, s) => Math.max(m, num(s.completedStage)), 0));
  const friendCount       = friendsRes.ok ? friendsRes.value.size : 0;

  const stats = {
    totalScore:        num(u.totalScore),
    gamesPlayed:       num(u.gamesPlayed),
    wins:              num(u.wins),
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
    const unlocked = saved[a.id] === true || a.check(stats);
    if (unlocked) unlockedCount++;
    return `<li class="pg-row">
      <div>
        <span class="pg-row-title">${a.title}</span>
        <div class="pg-row-meta">${a.desc}</div>
      </div>
      <span class="pg-pill ${unlocked ? 'done' : 'locked'}">${unlocked ? 'Unlocked' : a.goal(stats)}</span>
    </li>`;
  }).join('');

  body.innerHTML = `
    ${warnHtml}
    <div class="pg-stats">
      <div class="pg-stat"><strong>${stats.totalScore.toLocaleString('en-PH')}</strong><span>Total score</span></div>
      <div class="pg-stat"><strong>${stats.gamesPlayed}</strong><span>Games played</span></div>
      <div class="pg-stat"><strong>${stats.wins}</strong><span>Wins</span></div>
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

  const toggleReg = document.getElementById('toggle-reg');
  if (toggleReg) toggleReg.addEventListener('change', () => {
    const msg = toggleReg.checked ? 'New registrations are now allowed.' : 'New registrations are now disabled.';
    Swal.fire({ title: 'Setting Updated', text: msg, timer: 2200, showConfirmButton: false });
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
   PRESENCE HELPERS
   ============================================================ */
function isUserOnline(user) {
  if (!user.lastSeen) return false;
  const lastSeen = user.lastSeen.toDate ? user.lastSeen.toDate() : new Date(user.lastSeen);
  const diffMs = Date.now() - lastSeen.getTime();
  return diffMs < 2 * 60 * 1000; // online if seen within last 2 minutes
}

function updateOnlineCount() {
  const count = STUDENTS.filter(isUserOnline).length;
  const el = document.getElementById('online-count');
  if (el) el.textContent = count;
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
window.openEditModal = openEditModal;
window.deleteUser    = deleteUser;
window.deleteTeacher = deleteTeacher;
window.openProgressModal = openProgressModal;
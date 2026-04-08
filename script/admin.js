/* ============================================================
   FIREBASE CONFIG
   Replace the config below with YOUR Firebase project config.
   Go to: Firebase Console → Project Settings → Your Apps → SDK setup
   ============================================================ */
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
  updatePassword,
  deleteUser as deleteAuthUser,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  addDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDocs,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtB1ouns3wY1ljekvHm8h-_V_ChAcNjJw",
  authDomain: "bestinthesis-ef4e4.firebaseapp.com",
  projectId: "bestinthesis-ef4e4",
  storageBucket: "bestinthesis-ef4e4.firebasestorage.app",
  messagingSenderId: "774078773253",
  appId: "1:774078773253:web:28a0345c51393e9d9e046c"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db   = getFirestore(app);

/* ============================================================
   STATE
   ============================================================ */
let STUDENTS         = [];   // filled from Firestore in real-time
let filteredStudents = [];
let activityChart, popularityChart;

const MOCK_LEADERBOARD = [
  { rank: 1,  player: 'langit_master',  pat: 980,  baka: 870,  langit: 1200, total: 3050 },
  { rank: 2,  player: 'laro_pro99',     pat: 860,  baka: 920,  langit: 1100, total: 2880 },
  { rank: 3,  player: 'juan_dela',      pat: 750,  baka: 800,  langit: 1050, total: 2600 },
  { rank: 4,  player: 'maria_santos',   pat: 700,  baka: 750,  langit: 980,  total: 2430 },
  { rank: 5,  player: 'patintero_ace',  pat: 950,  baka: 600,  langit: 870,  total: 2420 },
  { rank: 6,  player: 'baka_champ',     pat: 580,  baka: 990,  langit: 820,  total: 2390 },
  { rank: 7,  player: 'carlos_lim',     pat: 650,  baka: 720,  langit: 900,  total: 2270 },
  { rank: 8,  player: 'ana_garcia',     pat: 620,  baka: 680,  langit: 850,  total: 2150 },
  { rank: 9,  player: 'ben_torres',     pat: 540,  baka: 610,  langit: 800,  total: 1950 },
  { rank: 10, player: 'ling_tan',       pat: 490,  baka: 580,  langit: 760,  total: 1830 },
];

const MOCK_ACTIVITY = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  data:   [120, 95, 180, 210, 165, 290, 310],
};

const MOCK_POPULARITY = {
  labels: ['Patintero', 'Luksong Baka', 'Langit Lupa'],
  data:   [880, 982, 1530],
};

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  setDateDisplay();
  initTabs();
  initHamburger();
  initCharts();
  populateLeaderboard();
  initUserSearch();
  initExportCSV();
  initStudentModal();
  initSettings();
  initLogout();
  animateGSBars();

  // 🔥 Real-time listener: auto-refresh table whenever Firestore changes
  listenToStudents();
});

/* ============================================================
   🔥 FIRESTORE REAL-TIME LISTENER
   Listens to the "students" collection and keeps STUDENTS in sync.
   ============================================================ */
function listenToStudents() {
  const studentsRef = collection(db, 'students');
  const q = query(studentsRef, orderBy('joined', 'desc'));

  onSnapshot(q, (snapshot) => {
    STUDENTS = snapshot.docs.map(docSnap => ({
      id:       docSnap.id,          // Firestore document ID (string)
      username: docSnap.data().username,
      email:    docSnap.data().email,
      joined:   docSnap.data().joined,
      status:   docSnap.data().status,
      uid:      docSnap.data().uid || null,  // Firebase Auth UID (for deleting auth user)
    }));

    filteredStudents = [...STUDENTS];
    populateUsersTable(STUDENTS);
    populateKPIs();
    populateRecentReg();
  }, (error) => {
    console.error('Firestore listener error:', error);
    Swal.fire({ icon: 'error', title: 'Database Error', text: 'Could not load students. Check your Firebase config.', confirmButtonColor: '#e53935' });
  });
}

/* ---- DATE DISPLAY ---- */
function setDateDisplay() {
  const el = document.getElementById('admin-date-display');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
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

      if (target === 'overview') {
        setTimeout(() => {
          activityChart && activityChart.update();
          popularityChart && popularityChart.update();
        }, 50);
      }

      if (target === 'games') setTimeout(animateGSBars, 100);
    });
  });

  const viewAllBtn = document.getElementById('view-all-users-btn');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      allTabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'users'));
      panels.forEach(p => p.classList.toggle('active', p.id === 'tab-users'));
    });
  }
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
   KPI CARDS
   ============================================================ */
function populateKPIs() {
  const activeCount = STUDENTS.filter(s => s.status === 'active').length;
  document.getElementById('kpi-users').textContent    = STUDENTS.length;
  document.getElementById('kpi-sessions').textContent = MOCK_ACTIVITY.data.reduce((a, b) => a + b, 0).toLocaleString();
  document.getElementById('kpi-active').textContent   = activeCount;
  document.getElementById('kpi-games').textContent    = MOCK_ACTIVITY.data[MOCK_ACTIVITY.data.length - 1];
  document.getElementById('user-count-badge').textContent = STUDENTS.length;
}

/* ============================================================
   RECENT REGISTRATIONS
   ============================================================ */
function populateRecentReg() {
  const tbody = document.getElementById('recent-reg-body');
  if (!tbody) return;
  // STUDENTS is already ordered by joined desc from Firestore, take first 5
  const recent = STUDENTS.slice(0, 5);
  tbody.innerHTML = recent.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${formatDate(u.joined)}</td>
      <td><span class="status-badge ${u.status}">${u.status}</span></td>
    </tr>
  `).join('');
}

/* ============================================================
   CHARTS (Chart.js)
   ============================================================ */
function initCharts() {
  const ctxA = document.getElementById('activityChart');
  const ctxP = document.getElementById('popularityChart');
  if (!ctxA || !ctxP) return;

  Chart.defaults.font.family = "'Nunito', sans-serif";
  Chart.defaults.font.weight = '700';

  activityChart = new Chart(ctxA, {
    type: 'bar',
    data: {
      labels:   MOCK_ACTIVITY.labels,
      datasets: [{
        label:           'Sessions',
        data:            MOCK_ACTIVITY.data,
        backgroundColor: 'rgba(43,127,212,0.75)',
        borderColor:     '#2B7FD4',
        borderWidth:     2,
        borderRadius:    8,
        borderSkipped:   false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#4A6A8A' } },
        x: { grid: { display: false }, ticks: { color: '#4A6A8A' } }
      }
    }
  });

  popularityChart = new Chart(ctxP, {
    type: 'doughnut',
    data: {
      labels:   MOCK_POPULARITY.labels,
      datasets: [{
        data:            MOCK_POPULARITY.data,
        backgroundColor: ['#2B7FD4', '#F4A234', '#4CAF50'],
        borderColor:     ['#1a6abf', '#D4851A', '#2E7D32'],
        borderWidth:     3,
        hoverOffset:     6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#1A3A5C', padding: 16, font: { size: 13, weight: '700' } }
        }
      }
    }
  });
}

/* ============================================================
   STUDENTS TABLE
   ============================================================ */
function populateUsersTable(students) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:#aaa">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${formatDate(u.joined)}</td>
      <td><span class="status-badge ${u.status}">${u.status}</span></td>
      <td>
        <div class="action-btns">
          <button class="tbl-btn edit" onclick="openEditModal('${u.id}')" title="Edit">
            <span class="material-symbols-rounded">edit</span>
          </button>
          <button class="tbl-btn delete" onclick="deleteUser('${u.id}')" title="Delete">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function initUserSearch() {
  const searchInput  = document.getElementById('user-search');
  const filterSelect = document.getElementById('user-filter');
  if (!searchInput || !filterSelect) return;

  function applyFilters() {
    const q      = searchInput.value.toLowerCase().trim();
    const status = filterSelect.value;
    filteredStudents = STUDENTS.filter(u => {
      const matchQ = !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchS = status === 'all' || u.status === status;
      return matchQ && matchS;
    });
    populateUsersTable(filteredStudents);
  }

  searchInput.addEventListener('input', applyFilters);
  filterSelect.addEventListener('change', applyFilters);
}

/* ============================================================
   STUDENT MODAL – REGISTER & EDIT
   ============================================================ */
function initStudentModal() {
  const overlay     = document.getElementById('student-modal-overlay');
  const registerBtn = document.getElementById('register-student-btn');
  const closeBtn    = document.getElementById('modal-close-btn');
  const cancelBtn   = document.getElementById('modal-cancel-btn');
  const saveBtn     = document.getElementById('modal-save-btn');

  if (registerBtn) registerBtn.addEventListener('click', () => openRegisterModal());
  [closeBtn, cancelBtn].forEach(btn => { if (btn) btn.addEventListener('click', closeModal); });
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  if (saveBtn) saveBtn.addEventListener('click', saveStudent);
}

function openRegisterModal() {
  document.getElementById('modal-title').textContent    = '➕ Register Student';
  document.getElementById('modal-user-id').value        = '';
  document.getElementById('modal-username').value       = '';
  document.getElementById('modal-email').value          = '';
  document.getElementById('modal-password').value       = '';
  document.getElementById('modal-status').value         = 'active';
  document.getElementById('modal-password').placeholder = 'Enter password';
  document.getElementById('modal-password').closest('.modal-field').style.display = 'flex';

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Register';

  document.getElementById('student-modal-overlay').classList.add('open');
}

function openEditModal(firestoreId) {
  const student = STUDENTS.find(s => s.id === firestoreId);
  if (!student) return;

  document.getElementById('modal-title').textContent    = '✏️ Edit Student';
  document.getElementById('modal-user-id').value        = student.id;
  document.getElementById('modal-username').value       = student.username;
  document.getElementById('modal-email').value          = student.email;
  document.getElementById('modal-password').value       = '';
  document.getElementById('modal-password').placeholder = 'Leave blank to keep current';
  document.getElementById('modal-status').value         = student.status;
  document.getElementById('modal-password').closest('.modal-field').style.display = 'flex';

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.innerHTML = '<span class="material-symbols-rounded">save</span> Save Changes';

  document.getElementById('student-modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('student-modal-overlay').classList.remove('open');
}

/* ============================================================
   🔥 SAVE STUDENT — Creates Firebase Auth user + Firestore doc
   ============================================================ */
async function saveStudent() {
  const firestoreId = document.getElementById('modal-user-id').value;
  const username    = document.getElementById('modal-username').value.trim();
  const email       = document.getElementById('modal-email').value.trim();
  const password    = document.getElementById('modal-password').value.trim();
  const status      = document.getElementById('modal-status').value;

  if (!username || !email) {
    Swal.fire({ icon: 'warning', title: 'Incomplete', text: 'Please fill in the username and email.', confirmButtonColor: '#F4A234' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Please enter a valid email address.', confirmButtonColor: '#e53935' });
    return;
  }

  const saveBtn = document.getElementById('modal-save-btn');
  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Saving...';

  try {
    if (firestoreId === '') {
      /* ---- REGISTER NEW STUDENT ---- */
      if (!password) {
        Swal.fire({ icon: 'warning', title: 'Password Required', text: 'Please set a password for the new student.', confirmButtonColor: '#F4A234' });
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Register';
        return;
      }
      if (password.length < 6) {
        Swal.fire({ icon: 'error', title: 'Too Short', text: 'Password must be at least 6 characters.', confirmButtonColor: '#e53935' });
        saveBtn.disabled = false;
        saveBtn.innerHTML = '<span class="material-symbols-rounded">person_add</span> Register';
        return;
      }

      // 1. Create Firebase Auth account for the student
      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      // 2. Save student profile to Firestore "students" collection
      await setDoc(doc(db, 'students', uid), {
        uid,
        username,
        email,
        joined:    new Date().toISOString().split('T')[0],
        status,
        createdAt: serverTimestamp(),
      });

      closeModal();
      Swal.fire({ icon: 'success', title: 'Registered! 🎉', text: `${username} has been added as a student.`, timer: 2000, showConfirmButton: false });

    } else {
      /* ---- EDIT EXISTING STUDENT ---- */
      const studentRef = doc(db, 'students', firestoreId);
      await updateDoc(studentRef, { username, email, status });

      closeModal();
      Swal.fire({ icon: 'success', title: 'Updated!', text: `${username}'s details have been saved.`, timer: 2000, showConfirmButton: false });
    }

  } catch (err) {
    console.error('saveStudent error:', err);
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered.';
    if (err.code === 'auth/weak-password')        msg = 'Password must be at least 6 characters.';
    Swal.fire({ icon: 'error', title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  } finally {
    saveBtn.disabled = false;
    saveBtn.innerHTML = firestoreId
      ? '<span class="material-symbols-rounded">save</span> Save Changes'
      : '<span class="material-symbols-rounded">person_add</span> Register';
  }
}

/* ============================================================
   🔥 DELETE STUDENT — removes Firestore doc (+ optional Auth delete)
   ============================================================ */
function deleteUser(firestoreId) {
  const student = STUDENTS.find(s => s.id === firestoreId);
  if (!student) return;

  Swal.fire({
    title: 'Remove Student?',
    html: `Are you sure you want to remove <strong>${escapeHtml(student.username)}</strong>?`,
    icon: 'warning',
    showCancelButton:   true,
    confirmButtonText:  'Yes, remove',
    cancelButtonText:   'Cancel',
    confirmButtonColor: '#e53935',
    cancelButtonColor:  '#6A8AA0',
  }).then(async result => {
    if (result.isConfirmed) {
      try {
        // Delete Firestore document
        await deleteDoc(doc(db, 'students', firestoreId));

        Swal.fire({ icon: 'success', title: 'Removed!', text: `${student.username} has been removed.`, timer: 2000, showConfirmButton: false });
      } catch (err) {
        console.error('deleteUser error:', err);
        Swal.fire({ icon: 'error', title: 'Error', text: err.message, confirmButtonColor: '#e53935' });
      }
    }
  });
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function initExportCSV() {
  const btn = document.getElementById('export-users-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const rows = [['ID', 'Username', 'Email', 'Joined', 'Status']];
    (filteredStudents.length ? filteredStudents : STUDENTS).forEach(u =>
      rows.push([u.id, u.username, u.email, u.joined, u.status])
    );
    const csv  = rows.map(r => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'laro-tayo-students.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

/* ============================================================
   LEADERBOARD
   ============================================================ */
function populateLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');
  if (!tbody) return;
  const medals = ['🥇', '🥈', '🥉'];
  tbody.innerHTML = MOCK_LEADERBOARD.map(r => `
    <tr>
      <td><strong>${medals[r.rank - 1] || r.rank}</strong></td>
      <td><strong>${r.player}</strong></td>
      <td>${r.pat.toLocaleString()}</td>
      <td>${r.baka.toLocaleString()}</td>
      <td>${r.langit.toLocaleString()}</td>
      <td><strong style="color:#F4A234">${r.total.toLocaleString()}</strong></td>
    </tr>
  `).join('');
}

/* ============================================================
   GAME STAT BAR ANIMATION
   ============================================================ */
function animateGSBars() {
  document.querySelectorAll('.gscard-bar').forEach(bar => {
    const target = bar.dataset.width || '0%';
    bar.style.width = '0%';
    requestAnimationFrame(() => {
      setTimeout(() => { bar.style.width = target; }, 80);
    });
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
function initSettings() {
  const changePassBtn = document.getElementById('change-pass-btn');
  if (changePassBtn) changePassBtn.addEventListener('click', () => {
    const cur  = document.getElementById('cur-pass').value;
    const nw   = document.getElementById('new-pass').value;
    const conf = document.getElementById('conf-pass').value;

    if (!cur || !nw || !conf) {
      Swal.fire({ icon: 'warning', title: 'Incomplete', text: 'Please fill in all password fields.', confirmButtonColor: '#F4A234' });
      return;
    }
    if (nw !== conf) {
      Swal.fire({ icon: 'error', title: 'Mismatch', text: 'New passwords do not match.', confirmButtonColor: '#e53935' });
      return;
    }
    if (nw.length < 6) {
      Swal.fire({ icon: 'error', title: 'Too Short', text: 'Password must be at least 6 characters.', confirmButtonColor: '#e53935' });
      return;
    }
    Swal.fire({ icon: 'success', title: 'Password Updated', text: 'Your password has been changed.', timer: 2000, showConfirmButton: false });
    ['cur-pass', 'new-pass', 'conf-pass'].forEach(id => document.getElementById(id).value = '');
  });

  const toggleMaint = document.getElementById('toggle-maintenance');
  if (toggleMaint) toggleMaint.addEventListener('change', () => {
    const msg = toggleMaint.checked ? 'Maintenance mode ON. Students cannot access the app.' : 'Maintenance mode OFF. App is live.';
    Swal.fire({ icon: 'info', title: 'Setting Updated', text: msg, timer: 2200, showConfirmButton: false });
  });

  const toggleReg = document.getElementById('toggle-reg');
  if (toggleReg) toggleReg.addEventListener('change', () => {
    const msg = toggleReg.checked ? 'New registrations are now allowed.' : 'New registrations are now disabled.';
    Swal.fire({ icon: 'info', title: 'Setting Updated', text: msg, timer: 2200, showConfirmButton: false });
  });

  const togglePiko = document.getElementById('toggle-piko');
  if (togglePiko) togglePiko.addEventListener('change', () => {
    const msg = togglePiko.checked ? 'Piko is now enabled for students!' : 'Piko has been disabled.';
    Swal.fire({ icon: 'info', title: 'Setting Updated', text: msg, timer: 2200, showConfirmButton: false });
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
      text: 'Are you sure you want to sign out?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel',
      confirmButtonColor: '#1A3A5C',
      cancelButtonColor:  '#6A8AA0',
    }).then(r => {
      if (r.isConfirmed) window.location.href = 'index.html';
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

// Expose for inline onclick handlers
window.openEditModal = openEditModal;
window.deleteUser    = deleteUser;
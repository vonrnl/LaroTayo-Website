import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth,
  createUserWithEmailAndPassword,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  query,
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
   STATE
   ============================================================ */
let STUDENTS         = [];
let filteredStudents = [];

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  initTabs();
  initHamburger();
  initUserSearch();
  initStudentModal();
  initSettings();
  initLogout();
  listenToStudents();
});

/* ============================================================
   FIRESTORE REAL-TIME LISTENER
   ============================================================ */
function listenToStudents() {
  const q = query(collection(db, 'students'), orderBy('joined', 'desc'));

  onSnapshot(q, (snapshot) => {
    STUDENTS = snapshot.docs.map(docSnap => ({
      id:       docSnap.id,
      username: docSnap.data().username,
      email:    docSnap.data().email,
      joined:   docSnap.data().joined,
      uid:      docSnap.data().uid || null,
    }));

    filteredStudents = [...STUDENTS];
    populateUsersTable(STUDENTS);
    document.getElementById('user-count-badge').textContent = STUDENTS.length;

  }, (error) => {
    console.error('Firestore listener error:', error);
    Swal.fire({ icon: 'error', title: 'Database Error', text: 'Could not load students. Check your Firestore rules.', confirmButtonColor: '#e53935' });
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

  if (students.length === 0) {
    tbody.innerHTML = `<tr><td colspan="5" style="text-align:center;padding:28px;color:#aaa">No students found.</td></tr>`;
    return;
  }

  tbody.innerHTML = students.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${escapeHtml(u.username)}</strong></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${formatDate(u.joined)}</td>
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
  const overlay     = document.getElementById('student-modal-overlay');
  const registerBtn = document.getElementById('register-student-btn');
  const closeBtn    = document.getElementById('modal-close-btn');
  const cancelBtn   = document.getElementById('modal-cancel-btn');
  const saveBtn     = document.getElementById('modal-save-btn');

  if (registerBtn) registerBtn.addEventListener('click', openRegisterModal);
  [closeBtn, cancelBtn].forEach(btn => { if (btn) btn.addEventListener('click', closeModal); });
  if (overlay) overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(); });
  if (saveBtn) saveBtn.addEventListener('click', saveStudent);
}

function openRegisterModal() {
  document.getElementById('modal-title').textContent    = 'Register Student';
  document.getElementById('modal-user-id').value        = '';
  document.getElementById('modal-username').value       = '';
  document.getElementById('modal-email').value          = '';
  document.getElementById('modal-password').value       = '';
  document.getElementById('modal-password').placeholder = 'Enter password';
  document.getElementById('modal-password').closest('.modal-field').style.display = 'flex';
  document.getElementById('modal-save-btn').innerHTML   = '<span class="material-symbols-rounded">person_add</span> Register';
  document.getElementById('student-modal-overlay').classList.add('open');
}

function openEditModal(firestoreId) {
  const student = STUDENTS.find(s => s.id === firestoreId);
  if (!student) return;

  document.getElementById('modal-title').textContent    = 'Edit Student';
  document.getElementById('modal-user-id').value        = student.id;
  document.getElementById('modal-username').value       = student.username;
  document.getElementById('modal-email').value          = student.email;
  document.getElementById('modal-password').value       = '';
  document.getElementById('modal-password').placeholder = 'Leave blank to keep current';
  document.getElementById('modal-password').closest('.modal-field').style.display = 'flex';
  document.getElementById('modal-save-btn').innerHTML   = '<span class="material-symbols-rounded">save</span> Save Changes';
  document.getElementById('student-modal-overlay').classList.add('open');
}

function closeModal() {
  document.getElementById('student-modal-overlay').classList.remove('open');
}

/* ============================================================
   SAVE STUDENT (Register or Edit)
   ============================================================ */
async function saveStudent() {
  const firestoreId = document.getElementById('modal-user-id').value;
  const username    = document.getElementById('modal-username').value.trim();
  const email       = document.getElementById('modal-email').value.trim();
  const password    = document.getElementById('modal-password').value.trim();
  const saveBtn     = document.getElementById('modal-save-btn');

  if (!username || !email) {
    Swal.fire({ icon: 'warning', title: 'Incomplete', text: 'Please fill in the username and email.', confirmButtonColor: '#F4A234' });
    return;
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    Swal.fire({ icon: 'error', title: 'Invalid Email', text: 'Please enter a valid email address.', confirmButtonColor: '#e53935' });
    return;
  }

  saveBtn.disabled = true;
  saveBtn.innerHTML = '<span class="material-symbols-rounded">hourglass_top</span> Saving...';

  try {
    if (firestoreId === '') {
      // ---- REGISTER NEW STUDENT ----
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

      const userCred = await createUserWithEmailAndPassword(auth, email, password);
      const uid = userCred.user.uid;

      await setDoc(doc(db, 'students', uid), {
        uid,
        username,
        email,
        joined:    new Date().toISOString().split('T')[0],
        createdAt: serverTimestamp(),
      });

      closeModal();
      Swal.fire({ icon: 'success', title: 'Registered!', text: `${username} has been added as a student.`, timer: 2000, showConfirmButton: false });

    } else {
      // ---- EDIT EXISTING STUDENT ----
      await updateDoc(doc(db, 'students', firestoreId), { username, email });
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
   DELETE STUDENT
   ============================================================ */
function deleteUser(firestoreId) {
  const student = STUDENTS.find(s => s.id === firestoreId);
  if (!student) return;

  Swal.fire({
    title: 'Remove Student?',
    html:  `Are you sure you want to remove <strong>${escapeHtml(student.username)}</strong>?`,
    icon:  'warning',
    showCancelButton:   true,
    confirmButtonText:  'Yes, remove',
    cancelButtonText:   'Cancel',
    confirmButtonColor: '#e53935',
    cancelButtonColor:  '#6A8AA0',
  }).then(async result => {
    if (result.isConfirmed) {
      try {
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
      text:  'Are you sure you want to sign out?',
      icon:  'question',
      showCancelButton:   true,
      confirmButtonText:  'Yes, logout',
      cancelButtonText:   'Cancel',
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

// Expose for inline onclick handlers in the table
window.openEditModal = openEditModal;
window.deleteUser    = deleteUser;
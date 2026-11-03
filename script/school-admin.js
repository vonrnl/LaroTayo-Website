import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  auth, db, escapeHtml, formatDate, sortableTime,
  createStudentAccount, initPasswordForm, initLogout, initProgressModal, openProgressModal,
} from "./shared.js";

/* ============================================================
   SCHOOL ADMIN PANEL
   ------------------------------------------------------------
   For school admins only (teachers/{uid}.role === 'teacher').
   The website owner uses admin.html. A school admin only sees the
   students and sections they created (teacherId === their uid).
   ============================================================ */

/* ============================================================
   STATE
   ============================================================ */
let STUDENTS     = [];
let SECTIONS     = [];
let CURRENT_UID  = null;
let CURRENT_NAME = '';
let CURRENT_SCHOOL = '';
let studentsUnsub = null;
let sectionsUnsub = null;

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  sections:  'Sections',
  students:  'Students',
  settings:  'Settings',
};

/* ============================================================
   INIT: only approved school admins get in
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }

    try {
      const snap = await getDoc(doc(db, 'teachers', user.uid));
      if (!snap.exists() || !['admin', 'teacher'].includes(snap.data().role)) {
        window.location.href = 'dashboard.html';   // a student, not staff
        return;
      }
      const data = snap.data();

      if (data.role === 'admin') {                 // website owner has their own panel
        window.location.href = 'admin.html';
        return;
      }
      if ('approved' in data && !user.emailVerified) {   // new accounts must verify their email
        await Swal.fire({ icon: 'info', title: 'Verify Your Email', text: 'Please open the verification link we emailed you, then log in again.' });
        await signOut(auth);
        window.location.href = 'index.html';
        return;
      }
      CURRENT_UID    = user.uid;
      CURRENT_NAME   = data.username || user.email;
      CURRENT_SCHOOL = data.school || '';
      fillProfile(data, user.email);

      initNav();
      initSections();
      initStudents();
      initProgressModal();
      initPasswordForm();
      initLogout('sa-logout');
      listenToStudents();
      listenToSections();
    } catch (err) {
      console.error('Auth check failed:', err);
      window.location.href = 'index.html';
    }
  });
});

function fillProfile(data, email) {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('sa-school-name', CURRENT_SCHOOL || 'Your school');
  set('sa-user-name', CURRENT_NAME);
  set('sa-user-role', data.category || 'School Admin');
  set('sa-user-initial', (CURRENT_NAME || '?').trim().charAt(0).toUpperCase());
  set('dash-welcome', `Welcome, ${CURRENT_NAME}. Here is a quick look at ${CURRENT_SCHOOL || 'your school'}.`);
  set('pf-name', CURRENT_NAME);
  set('pf-category', data.category || '—');
  set('pf-school', CURRENT_SCHOOL || '—');
  set('pf-email', data.email || email || '—');
  set('pf-payment', data.paymentMethod || '—');
}

/* ============================================================
   NAVIGATION
   ============================================================ */
function initNav() {
  const buttons = document.querySelectorAll('.sa-menu-btn');
  const panels  = document.querySelectorAll('.sa-panel');
  const sidebar = document.getElementById('sa-sidebar');
  const scrim   = document.getElementById('sa-scrim');
  const burger  = document.getElementById('sa-burger');

  const closeMenu = () => { sidebar.classList.remove('open'); scrim.classList.remove('open'); };

  window.goToTab = (target) => {
    buttons.forEach(b => b.classList.toggle('active', b.dataset.tab === target));
    panels.forEach(p => p.classList.toggle('active', p.id === `tab-${target}`));
    document.getElementById('sa-page-title').textContent = PAGE_TITLES[target] || '';
    closeMenu();
    window.scrollTo(0, 0);
  };

  buttons.forEach(b => b.addEventListener('click', () => window.goToTab(b.dataset.tab)));
  burger.addEventListener('click', () => { sidebar.classList.toggle('open'); scrim.classList.toggle('open'); });
  scrim.addEventListener('click', closeMenu);
}

/* ============================================================
   FIRESTORE LISTENERS (only this school admin's data)
   ============================================================ */
function listenToStudents() {
  if (studentsUnsub) studentsUnsub();
  const q = query(collection(db, 'students'), where('teacherId', '==', CURRENT_UID));
  studentsUnsub = onSnapshot(q, (snap) => {
    STUDENTS = snap.docs.map(d => ({
      id:        d.id,
      username:  d.data().username || '(no username)',
      email:     d.data().email || '(no email)',
      joined:    d.data().joined || null,
      createdAt: d.data().createdAt || null,
      status:    d.data().status || 'active',
      sectionId: d.data().sectionId || null,
    }));
    STUDENTS.sort((a, b) => sortableTime(b) - sortableTime(a));
    renderAll();
  }, (err) => {
    console.error('Students listener error:', err);
    Swal.fire({ title: 'Database Error', text: 'Could not load students. Check your Firestore rules.', confirmButtonColor: '#e53935' });
  });
}

function listenToSections() {
  if (sectionsUnsub) sectionsUnsub();
  const q = query(collection(db, 'sections'), where('teacherId', '==', CURRENT_UID));
  sectionsUnsub = onSnapshot(q, (snap) => {
    SECTIONS = snap.docs.map(d => ({
      id: d.id,
      name: d.data().name || '(no name)',
      gradeLevel: d.data().gradeLevel || '',
    }));
    SECTIONS.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    refreshSectionSelects();
    renderAll();
  }, (err) => {
    console.error('Sections listener error:', err);
    Swal.fire({ title: 'Sections unavailable', text: 'Could not load sections. Check that your Firestore rules allow the "sections" collection.', confirmButtonColor: '#e53935' });
  });
}

function sectionNameOf(id)  { const s = SECTIONS.find(x => x.id === id); return s ? s.name : '—'; }
function sectionGradeOf(id) { const s = SECTIONS.find(x => x.id === id); return s && s.gradeLevel ? s.gradeLevel : '—'; }

/* ============================================================
   RENDERING
   ============================================================ */
function renderAll() {
  renderDashboard();
  renderStudentsTable();
  renderSectionStudents();
}

function studentRowsHtml(list, colCount) {
  if (!list.length) {
    return `<tr><td colspan="${colCount}" class="sa-empty">No students found.</td></tr>`;
  }
  return list.map((u, i) => {
    return `
    <tr>
      <td>${i + 1}</td>
      <td><span class="sa-person"><span class="sa-avatar">${escapeHtml((u.username || '?').charAt(0).toUpperCase())}</span><strong>${escapeHtml(u.username)}</strong></span></td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(sectionNameOf(u.sectionId))}</td>
      <td>${escapeHtml(sectionGradeOf(u.sectionId))}</td>
      <td>${formatDate(u.joined)}</td>
      <td>
        <div class="sa-actions">
          <button class="sa-mini blue" onclick="openProgressModal('${u.id}')">Progress</button>
          <button class="sa-mini green" onclick="assignSection('${u.id}')">Assign</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ---- dashboard ---- */
function renderDashboard() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('st-total',      STUDENTS.length);
  set('st-active',     STUDENTS.filter(s => (s.status || 'active') === 'active').length);
  set('st-sections',   SECTIONS.length);
  set('st-unassigned', STUDENTS.filter(s => !s.sectionId).length);
  set('nav-student-count', STUDENTS.length);

  const secList = document.getElementById('dash-sections');
  if (secList) {
    secList.innerHTML = SECTIONS.length
      ? SECTIONS.map(s => {
          const n = STUDENTS.filter(st => st.sectionId === s.id).length;
          return `<li><div><strong>${escapeHtml(s.name)}</strong><span>${escapeHtml(s.gradeLevel || 'No grade level')}</span></div><b>${n} student${n === 1 ? '' : 's'}</b></li>`;
        }).join('')
      : '<li class="sa-empty-li">No sections yet. Create one in Sections.</li>';
  }

  const recent = document.getElementById('dash-recent');
  if (recent) {
    const list = STUDENTS.slice(0, 5);
    recent.innerHTML = list.length
      ? list.map(u => `<tr>
          <td><span class="sa-person"><span class="sa-avatar">${escapeHtml((u.username || '?').charAt(0).toUpperCase())}</span><strong>${escapeHtml(u.username)}</strong></span></td>
          <td>${escapeHtml(sectionNameOf(u.sectionId))}</td>
          <td>${formatDate(u.joined)}</td>
        </tr>`).join('')
      : '<tr><td colspan="3" class="sa-empty">No students yet. Add your first one in Students.</td></tr>';
  }
}

/* ---- students tab ---- */
function renderStudentsTable() {
  const tbody = document.getElementById('students-body');
  if (!tbody) return;
  const q = document.getElementById('student-search').value.toLowerCase().trim();
  const list = STUDENTS.filter(u => !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  tbody.innerHTML = studentRowsHtml(list, 7);
  document.getElementById('students-count').textContent =
    `Showing ${list.length} of ${STUDENTS.length} student${STUDENTS.length === 1 ? '' : 's'}`;
}

function initStudents() {
  document.getElementById('student-search').addEventListener('input', renderStudentsTable);
  document.getElementById('register-student-btn').addEventListener('click', registerStudent);
}

async function registerStudent() {
  const val = id => document.getElementById(id).value;
  const username = val('reg-username').trim();
  const email    = val('reg-email').trim();
  const password = val('reg-password');
  const sectionId = val('reg-section') || null;
  const btn = document.getElementById('register-student-btn');

  const warn = (title, text) => Swal.fire({ title, text, confirmButtonColor: '#F4A234' });

  if (!username || !email || !password) { warn('Incomplete', 'Please fill in all fields.'); return; }
  if (username.length < 3) { warn('Name Too Short', 'Username must be at least 3 characters.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { warn('Invalid Email', 'Please enter a valid email address.'); return; }
  const BLOCKED_DOMAINS = ['gmail.com', 'googlemail.com'];
  if (BLOCKED_DOMAINS.includes(email.split('@')[1].toLowerCase())) {
    warn('Gmail Not Allowed', 'Please use a school or other non-Gmail email address.');
    return;
  }
  if (password.length < 6) { warn('Too Short', 'Password must be at least 6 characters.'); return; }

  btn.disabled = true;
  btn.textContent = 'Registering...';
  try {
    await createStudentAccount({
      username, email, password,
      extra: { teacherId: CURRENT_UID, school: CURRENT_SCHOOL || null, sectionId },
    });
    ['reg-username', 'reg-email', 'reg-password'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('reg-section').value = '';
    Swal.fire({ title: 'Registered!', text: `${username} has been added as a student.`, timer: 2000, showConfirmButton: false });
  } catch (err) {
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered.';
    if (err.code === 'auth/weak-password')        msg = 'Password must be at least 6 characters.';
    if (err.code === 'permission-denied')         msg = 'Database permission denied. Check Firestore rules.';
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register Student';
  }
}

/* ============================================================
   SECTIONS
   Firestore: sections/{id} = { name, gradeLevel, teacherId, school, createdAt }
   A student joins a section through students/{uid}.sectionId.
   ============================================================ */
function refreshSectionSelects() {
  const optionsHtml = SECTIONS.map(s => `<option value="${s.id}">${escapeHtml(s.name)}</option>`).join('');

  const filter = document.getElementById('section-filter');
  if (filter) {
    const prev = filter.value;
    filter.innerHTML = '<option value="">All students</option>' + optionsHtml + '<option value="none">No section</option>';
    filter.value = [...filter.options].some(o => o.value === prev) ? prev : '';
  }
  const reg = document.getElementById('reg-section');
  if (reg) {
    const prev = reg.value;
    reg.innerHTML = '<option value="">No section (assign later)</option>' + optionsHtml;
    reg.value = [...reg.options].some(o => o.value === prev) ? prev : '';
  }
}

function renderSectionStudents() {
  const tbody = document.getElementById('section-students-body');
  if (!tbody) return;
  const filter = document.getElementById('section-filter').value;
  const q = document.getElementById('section-search').value.toLowerCase().trim();

  const list = STUDENTS.filter(u => {
    if (filter === 'none' && u.sectionId) return false;
    if (filter && filter !== 'none' && u.sectionId !== filter) return false;
    return !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
  });

  document.getElementById('delete-section-btn').hidden = !(filter && filter !== 'none');
  document.getElementById('section-students-count').textContent =
    `Showing ${list.length} of ${STUDENTS.length} student${STUDENTS.length === 1 ? '' : 's'}`;
  tbody.innerHTML = studentRowsHtml(list, 7);
}

function initSections() {
  document.getElementById('create-section-btn').addEventListener('click', createSection);
  document.getElementById('section-filter').addEventListener('change', renderSectionStudents);
  document.getElementById('section-search').addEventListener('input', renderSectionStudents);
  document.getElementById('delete-section-btn').addEventListener('click', deleteSelectedSection);
}

async function createSection() {
  const nameEl  = document.getElementById('sec-name');
  const gradeEl = document.getElementById('sec-grade');
  const btn     = document.getElementById('create-section-btn');
  const name    = nameEl.value.trim();

  if (!name) {
    Swal.fire({ title: 'Section name needed', text: 'Please type a section name, e.g. Grade 4 - Section A.', confirmButtonColor: '#F4A234' });
    return;
  }
  if (SECTIONS.some(s => s.name.toLowerCase() === name.toLowerCase())) {
    Swal.fire({ title: 'Already exists', text: 'You already have a section with that name.', confirmButtonColor: '#e53935' });
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating...';
  try {
    await setDoc(doc(collection(db, 'sections')), {
      name,
      gradeLevel: gradeEl.value || '',
      teacherId:  CURRENT_UID,
      school:     CURRENT_SCHOOL || null,
      createdAt:  serverTimestamp(),
    });
    nameEl.value = '';
    gradeEl.value = '';
    Swal.fire({ title: 'Section created!', text: `${name} is ready. Use Assign to add students.`, timer: 2000, showConfirmButton: false });
  } catch (err) {
    const msg = err.code === 'permission-denied'
      ? 'Database permission denied. Your Firestore rules need to allow the "sections" collection.'
      : err.message;
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Create Section';
  }
}

async function assignSection(studentId) {
  const student = STUDENTS.find(s => s.id === studentId);
  if (!student) return;
  if (!SECTIONS.length) {
    Swal.fire({ title: 'No sections yet', text: 'Create a section first, then assign students to it.', confirmButtonColor: '#F4A234' });
    return;
  }

  const options = { none: 'No section' };
  SECTIONS.forEach(s => { options[s.id] = s.gradeLevel ? `${s.name} (${s.gradeLevel})` : s.name; });

  const { isConfirmed, value } = await Swal.fire({
    title: 'Assign to section',
    text: student.username,
    input: 'select',
    inputOptions: options,
    inputValue: student.sectionId || 'none',
    showCancelButton: true,
    confirmButtonText: 'Save',
    confirmButtonColor: '#F4A234',
  });
  if (!isConfirmed) return;

  try {
    await updateDoc(doc(db, 'students', studentId), { sectionId: value === 'none' ? null : value });
  } catch (err) {
    Swal.fire({ title: 'Error', text: err.message, confirmButtonColor: '#e53935' });
  }
}

async function deleteSelectedSection() {
  const id = document.getElementById('section-filter').value;
  if (!id || id === 'none') return;
  const members = STUDENTS.filter(s => s.sectionId === id);

  const res = await Swal.fire({
    title: 'Delete this section?',
    text: members.length
      ? `${members.length} student${members.length === 1 ? '' : 's'} will be moved to "No section". Their accounts are not deleted.`
      : 'This section has no students.',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#e53935',
  });
  if (!res.isConfirmed) return;

  try {
    await Promise.all(members.map(s => updateDoc(doc(db, 'students', s.id), { sectionId: null })));
    await deleteDoc(doc(db, 'sections', id));
    document.getElementById('section-filter').value = '';
    renderSectionStudents();
  } catch (err) {
    Swal.fire({ title: 'Error', text: err.message, confirmButtonColor: '#e53935' });
  }
}

// Expose for inline onclick handlers in the tables
window.openProgressModal = (id) => openProgressModal(STUDENTS.find(s => s.id === id));
window.assignSection = assignSection;
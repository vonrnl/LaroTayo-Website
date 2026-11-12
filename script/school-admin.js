import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, serverTimestamp,
  writeBatch, Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import {
  auth, db, escapeHtml, formatDate, sortableTime,
  createStudentFromEmail, createTeacherFromEmail, nicknameFromFullName, sendPasswordSetupEmail, initPasswordForm, initLogout, initProgressModal, openProgressModal,
  fileToCompressedDataUrl, VERIFICATION_DOC_TYPES, DOC_MAX_UPLOAD_MB,
} from "./shared.js";
import {
  collectTestPayment, sendReceiptEmail, createPayMongoCheckout, getPayMongoStatus,
  REGISTRATION_FEE, PAYMENT_MODE, peso,
} from "./payment.js";

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

// Roles: the school admin ('teacher' role in Firestore) owns the school account.
// A teacher added by the school admin has role 'staff', an ownerId and ONE sectionId.
let OWNER_ID      = null;    // uid of the school account owner (own uid for the school admin)
let IS_STAFF      = false;   // true for a teacher added by the school admin
let STAFF_SECTION = null;    // the only section a staff teacher can see
let TEACHERS      = [];
let teachersUnsub = null;

const PAGE_TITLES = {
  dashboard: 'Dashboard',
  sections:  'Sections',
  teachers:  'Teachers',
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
      if (!snap.exists() || !['admin', 'teacher', 'staff'].includes(snap.data().role)) {
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

      IS_STAFF = data.role === 'staff' || !!data.ownerId;   // anything added by a school admin is a teacher
      if (IS_STAFF) {
        if (data.active === false || !data.ownerId) {
          await Swal.fire({ icon: 'info', title: 'Account not available', text: 'Your teacher account is turned off. Please ask your school admin.' });
          await signOut(auth);
          window.location.href = 'index.html';
          return;
        }
        OWNER_ID      = data.ownerId;
        STAFF_SECTION = data.sectionId || null;
      } else {
        OWNER_ID = user.uid;
      }

      // New schools must be verified by the website admin, then pay, before the panel opens.
      const gate = IS_STAFF ? 'ok' : accessState(data);
      if (gate !== 'ok') { await showGate(gate, data, user); return; }

      fillProfile(data, user.email);

      applyRoleUI();
      initNav();
      if (!IS_STAFF) { initSections(); initTeachers(); }
      initStudents();
      initProgressModal();
      initPasswordForm();
      initLogout('sa-logout');
      listenToStudents();
      listenToSections();
      if (!IS_STAFF) listenToTeachers();
    } catch (err) {
      console.error('Auth check failed:', err);
      window.location.href = 'index.html';
    }
  });
});

// A staff teacher gets a smaller panel: no Sections and no Teachers tab.
function applyRoleUI() {
  const sub = document.querySelector('.sa-brand-sub');
  if (sub) sub.textContent = IS_STAFF ? 'Teacher' : 'School Admin';
  if (!IS_STAFF) return;
  document.querySelectorAll('[data-owner-only]').forEach(el => el.remove());
}

function fillProfile(data, email) {
  const set = (id, text) => { const el = document.getElementById(id); if (el) el.textContent = text; };
  set('sa-school-name', CURRENT_SCHOOL || 'Your school');
  set('sa-user-name', CURRENT_NAME);
  set('sa-user-role', IS_STAFF ? 'Teacher' : (data.category || 'School Admin'));
  set('sa-user-initial', (CURRENT_NAME || '?').trim().charAt(0).toUpperCase());
  set('dash-welcome', IS_STAFF
    ? `Welcome, ${CURRENT_NAME}. You can see and register the students of your section at ${CURRENT_SCHOOL || 'your school'}.`
    : `Welcome, ${CURRENT_NAME}. Here is a quick look at ${CURRENT_SCHOOL || 'your school'}.`);
  set('pf-name', CURRENT_NAME);
  set('pf-category', IS_STAFF ? 'Teacher' : (data.category || '—'));
  set('pf-school', CURRENT_SCHOOL || '—');
  set('pf-email', data.email || email || '—');
  set('pf-payment', IS_STAFF ? 'Covered by the school account' : (data.paymentMethod || '—'));
}

/* ============================================================
   VERIFICATION + ACTIVATION (before the panel opens)
   ------------------------------------------------------------
   teachers/{uid}.verification:  'pending' -> 'approved' | 'rejected'
   Older school accounts have no 'verification' field and are let in.
   After 'approved', the school pays the one-time fee (paid: true).
   ============================================================ */
const PENDING_KEY = 'laro_pending_activation';   // remembers the payment while the user is on the checkout page

function accessState(data) {
  if (!('verification' in data)) return 'ok';              // older account
  if (data.verification === 'approved') return data.paid ? 'ok' : 'unpaid';
  if (data.verification === 'rejected') return 'rejected';
  return 'pending';                                          // 'pending' or anything unexpected
}

function gateButton(label, cls, id, onClick) {
  const b = document.createElement('button');
  b.className = 'sa-btn ' + cls;
  b.id = id;
  b.textContent = label;
  if (onClick) b.addEventListener('click', onClick);
  return b;
}

async function showGate(state, data, user) {
  const gate = document.getElementById('sa-gate');
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  const icon = document.getElementById('gate-icon');
  const note = document.getElementById('gate-note');
  const actions = document.getElementById('gate-actions');
  actions.innerHTML = '';
  note.hidden = true;
  icon.className = 'material-symbols-rounded sa-gate-icon';

  // coming back from the payment page?
  if (state === 'unpaid' && await handleActivationReturn(user, data)) return;

  if (state === 'pending') {
    icon.textContent = 'hourglass_top';
    set('gate-title', 'Your application is under review');
    set('gate-text', `We are checking the document you sent for ${data.school || 'your school'}. Log in again later to see the result.`);
    actions.append(gateButton('Check again', 'orange', 'gate-refresh', () => location.reload()));
  } else if (state === 'rejected') {
    icon.textContent = 'error';
    icon.classList.add('bad');
    set('gate-title', 'Your document was not accepted');
    set('gate-text', 'Please upload a clearer or different document that shows your name and school.');
    set('gate-note', 'Reason: ' + (data.verificationNote || 'The document could not be verified.'));
    note.hidden = false;
    actions.append(gateButton('Upload a new document', 'orange', 'gate-resubmit', () => resubmitDocument(user, data)));
  } else {
    icon.textContent = 'verified';
    icon.classList.add('good');
    set('gate-title', 'You are verified!');
    set('gate-text', `Pay the one-time registration fee of ${peso(REGISTRATION_FEE)} to activate the school account for ${data.school || 'your school'}.`);
    actions.append(gateButton(`Pay ${peso(REGISTRATION_FEE)}`, 'orange', 'gate-pay', () => startActivation(user, data)));
  }

  const out = gateButton('Logout', '', 'gate-logout');
  out.style.cssText = 'background:#fff;color:#4A6A8A;border-color:#cfe3f2;box-shadow:none';
  actions.append(out);
  initLogout('gate-logout');
  gate.hidden = false;
}

// ---- rejected: send a new document ----
async function resubmitDocument(user, data) {
  const options = VERIFICATION_DOC_TYPES.map(d => `<option value="${escapeHtml(d)}">${escapeHtml(d)}</option>`).join('');
  const res = await Swal.fire({
    title: 'Upload a new document',
    html:
      `<select id="rs-type" class="swal2-select" style="display:flex;width:80%;margin:8px auto"><option value="">Select document</option>${options}</select>` +
      `<input id="rs-file" type="file" class="swal2-file" accept="image/jpeg,image/png,image/webp" style="display:flex;margin:8px auto">`,
    showCancelButton: true,
    confirmButtonText: 'Submit',
    confirmButtonColor: '#F4A234',
    focusConfirm: false,
    preConfirm: async () => {
      const docType = document.getElementById('rs-type').value;
      const file = document.getElementById('rs-file').files[0];
      if (!docType) { Swal.showValidationMessage('Choose the document type.'); return false; }
      if (!file) { Swal.showValidationMessage('Choose a photo of the document.'); return false; }
      if (!/^image\/(jpeg|png|webp)$/.test(file.type)) { Swal.showValidationMessage('Use a JPG or PNG photo.'); return false; }
      if (file.size > DOC_MAX_UPLOAD_MB * 1024 * 1024) { Swal.showValidationMessage(`The photo must be ${DOC_MAX_UPLOAD_MB} MB or smaller.`); return false; }
      try {
        return { docType, fileName: String(file.name || '').slice(0, 80), imageData: await fileToCompressedDataUrl(file) };
      } catch (_) {
        Swal.showValidationMessage('Could not read that photo. Try a different one.');
        return false;
      }
    },
  });
  if (!res.isConfirmed) return;

  try {
    const batch = writeBatch(db);
    batch.set(doc(db, 'verifications', user.uid), {
      uid: user.uid,
      schoolName: data.school || '',
      adminName: data.username || '',
      email: data.email || user.email,
      category: data.category || '',
      docType: res.value.docType,
      schoolIdNumber: '',
      fileName: res.value.fileName,
      imageData: res.value.imageData,
      submittedAt: serverTimestamp(),
    });
    batch.update(doc(db, 'teachers', user.uid), { verification: 'pending', verificationNote: '' });
    await batch.commit();
    await Swal.fire({ icon: 'success', title: 'Sent!', text: 'We will review your new document.', confirmButtonColor: '#F4A234' });
    location.reload();
  } catch (err) {
    const msg = err.code === 'permission-denied' ? 'Database permission denied. Check the Firestore rules for teachers and verifications.' : err.message;
    Swal.fire({ icon: 'error', title: 'Could not send', text: msg, confirmButtonColor: '#e53935' });
  }
}

// ---- approved: pay the one-time fee ----
async function startActivation(user, data) {
  const pick = await Swal.fire({
    title: 'Choose payment method',
    input: 'radio',
    inputOptions: { 'GCash': 'GCash', 'Credit/Debit Card': 'Credit / Debit Card' },
    inputValidator: v => (v ? undefined : 'Please choose a payment method.'),
    showCancelButton: true,
    confirmButtonText: 'Continue',
    confirmButtonColor: '#F4A234',
  });
  if (!pick.isConfirmed) return;
  const method = pick.value;

  // Real checkout page (through your Worker): leave this page, come back with ?paid=1
  if (PAYMENT_MODE === 'paymongo') {
    let co;
    try {
      co = await createPayMongoCheckout({ uid: user.uid, name: data.username, email: data.email || user.email, method, school: data.school });
    } catch (e) {
      Swal.fire({ icon: 'error', title: 'Could not start the payment', text: e.message, confirmButtonColor: '#e53935' });
      return;
    }
    localStorage.setItem(PENDING_KEY, JSON.stringify({ uid: user.uid, sessionId: co.id, method }));
    window.location.href = co.checkoutUrl;
    return;
  }

  // Built-in test checkout (no real money)
  let pay;
  try {
    pay = await collectTestPayment({ method, amount: REGISTRATION_FEE });
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Payment failed', text: e.message, confirmButtonColor: '#e53935' });
    return;
  }
  if (!pay.ok) return;
  await finishActivation(user, data, pay, method);
}

// Saves "paid" on the school + the payment record together, then opens the panel.
async function finishActivation(user, data, pay, method) {
  try {
    const paidAt = Timestamp.fromDate(pay.paidAt instanceof Date ? pay.paidAt : new Date());
    const batch = writeBatch(db);
    batch.update(doc(db, 'teachers', user.uid), { paid: true, paidAt, paymentMethod: method });
    batch.set(doc(db, 'payments', String(pay.reference)), {   // same reference = never saved twice
      schoolId: user.uid,
      schoolName: data.school || '',
      adminName: data.username || '',
      email: data.email || user.email,
      amount: Number(pay.amount) || REGISTRATION_FEE,
      method: pay.detail || method,
      reference: String(pay.reference),
      paidAt,
      recordedBy: user.uid,
      source: 'registration',
    });
    await batch.commit();
  } catch (err) {
    console.error('[ACTIVATION SAVE ERROR]', err);
    Swal.close();
    await Swal.fire({
      icon: 'error',
      title: 'Payment OK, account not activated',
      html: 'Your payment went through, but we could not activate your account.<br>Reference: <b>' + escapeHtml(pay.reference) + '</b><br>Please contact the project team with this reference.',
    });
    return;
  }

  const receiptSent = PAYMENT_MODE === 'paymongo'
    ? false
    : await sendReceiptEmail({ toEmail: data.email || user.email, toName: data.username, school: data.school, pay });

  await Swal.fire({
    icon: 'success',
    title: 'Payment Successful!',
    width: 'min(92vw, 460px)',
    html:
      '<div class="pay-receipt">' +
        '<div class="pay-receipt-row"><span>School</span><b>' + escapeHtml(data.school || '') + '</b></div>' +
        '<div class="pay-receipt-row"><span>Amount</span><b>' + peso(pay.amount) + (PAYMENT_MODE === 'sim' ? ' (test)' : '') + '</b></div>' +
        '<div class="pay-receipt-row"><span>Method</span><b>' + escapeHtml(pay.detail || method) + '</b></div>' +
        '<div class="pay-receipt-row"><span>Reference</span><b>' + escapeHtml(pay.reference) + '</b></div>' +
        '<div class="pay-receipt-row"><span>Date</span><b>' + pay.paidAt.toLocaleString('en-PH') + '</b></div>' +
      '</div>' +
      '<p style="margin-top:12px">Your school account is now active.' +
        (receiptSent ? '<br>A receipt was sent to <b>' + escapeHtml(data.email || user.email) + '</b>.' : '') + '</p>',
    confirmButtonText: 'Open my dashboard',
    confirmButtonColor: '#F4A234',
  });
  location.reload();
}

// Coming back from the checkout page (?paid=1 or ?cancelled=1). Returns true if it handled a payment.
async function handleActivationReturn(user, data) {
  const params = new URLSearchParams(location.search);
  const paid = params.get('paid') === '1';
  const cancelled = params.get('cancelled') === '1';
  if (!paid && !cancelled) return false;
  history.replaceState(null, '', location.pathname);

  let pending = null;
  try { pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null'); } catch (_) {}

  if (cancelled) {
    localStorage.removeItem(PENDING_KEY);
    await Swal.fire({ icon: 'info', title: 'Payment cancelled', text: 'No payment was made. You can pay again anytime.', confirmButtonColor: '#F4A234' });
    return false;
  }
  if (!pending || pending.uid !== user.uid) {
    await Swal.fire({ icon: 'info', title: 'Nothing to finish', text: 'We could not find a payment in progress on this device.', confirmButtonColor: '#F4A234' });
    return false;
  }

  // paid=1 in the address is NOT proof: ask the checkout provider (through the Worker)
  const check = async () => {
    Swal.fire({ title: 'Confirming your payment...', allowOutsideClick: false, showConfirmButton: false, didOpen: () => Swal.showLoading() });
    let st = { paid: false };
    for (let i = 0; i < 5 && !st.paid; i++) {
      st = await getPayMongoStatus(pending.sessionId);
      if (!st.paid) await new Promise(r => setTimeout(r, 2000));
    }
    return st;
  };

  let st = await check();
  while (!(st.paid && st.reference === user.uid)) {
    const r = await Swal.fire({
      icon: 'warning',
      title: 'Payment not confirmed yet',
      text: 'The checkout has not confirmed the payment. If you just paid, wait a few seconds and check again.',
      showCancelButton: true,
      confirmButtonText: 'Check again',
      cancelButtonText: 'Not now',
      confirmButtonColor: '#F4A234',
    });
    if (!r.isConfirmed) { localStorage.removeItem(PENDING_KEY); return false; }
    st = await check();
  }

  localStorage.removeItem(PENDING_KEY);
  const detail = (st.method === 'maya' ? 'Maya' : (pending.method || 'Online payment')) + (st.last4 ? ' ending ' + st.last4 : '');
  await finishActivation(user, data, {
    amount: st.amount != null ? st.amount : REGISTRATION_FEE,
    detail,
    reference: st.paymentId || pending.sessionId,
    paidAt: new Date(),
  }, pending.method || 'Online payment');
  return true;
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
  if (IS_STAFF && !STAFF_SECTION) { STUDENTS = []; renderAll(); return; }   // no section assigned yet
  // The school admin sees every student of the school. A teacher sees only their own section.
  const q = IS_STAFF
    ? query(collection(db, 'students'), where('teacherId', '==', OWNER_ID), where('sectionId', '==', STAFF_SECTION))
    : query(collection(db, 'students'), where('teacherId', '==', CURRENT_UID));
  studentsUnsub = onSnapshot(q, (snap) => {
    STUDENTS = snap.docs.map(d => ({
      id:        d.id,
      username:  d.data().username || '(no username)',
      fullName:  d.data().fullName || '',
      email:     d.data().email || '(no email)',
      joined:    d.data().joined || null,
      createdAt: d.data().createdAt || null,
      status:    d.data().status || 'active',
      sectionId: d.data().sectionId || null,
    }));
    STUDENTS = STUDENTS.filter(s => s.status !== 'deleted');   // deleted accounts are hidden everywhere
    STUDENTS.sort((a, b) => sortableTime(b) - sortableTime(a));
    renderAll();
  }, (err) => {
    console.error('Students listener error:', err);
    Swal.fire({ title: 'Database Error', text: 'Could not load students. Check your Firestore rules.', confirmButtonColor: '#e53935' });
  });
}

// Staff teacher: only the one section they were assigned.
function listenToMySection() {
  if (!STAFF_SECTION) { SECTIONS = []; renderAll(); return; }
  sectionsUnsub = onSnapshot(doc(db, 'sections', STAFF_SECTION), (snap) => {
    const d = snap.exists() ? snap.data() : null;
    SECTIONS = d ? [{ id: snap.id, name: d.name || '(no name)', gradeLevel: d.gradeLevel || '', maxStudents: Number(d.maxStudents) || 0 }] : [];
    renderAll();
  }, (err) => {
    console.error('Section listener error:', err);
    Swal.fire({ title: 'Section unavailable', text: 'Could not load your section. Ask your school admin to check the Firestore rules.', confirmButtonColor: '#e53935' });
  });
}

function listenToSections() {
  if (sectionsUnsub) sectionsUnsub();
  if (IS_STAFF) { listenToMySection(); return; }
  const q = query(collection(db, 'sections'), where('teacherId', '==', CURRENT_UID));
  sectionsUnsub = onSnapshot(q, (snap) => {
    SECTIONS = snap.docs.map(d => ({
      id: d.id,
      name: d.data().name || '(no name)',
      gradeLevel: d.data().gradeLevel || '',
      maxStudents: Number(d.data().maxStudents) || 0,   // 0 = older section with no limit set
    }));
    SECTIONS.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    refreshSectionSelects();
    renderAll();
  }, (err) => {
    console.error('Sections listener error:', err);
    Swal.fire({ title: 'Sections unavailable', text: 'Could not load sections. Check that your Firestore rules allow the "sections" collection.', confirmButtonColor: '#e53935' });
  });
}

const MAX_LIMIT = 100;                                   // highest limit a section can have

function countIn(id)  { return STUDENTS.filter(s => s.sectionId === id).length; }
function limitOf(id)  { const s = SECTIONS.find(x => x.id === id); return s ? s.maxStudents : 0; }
function isFull(id)   { const lim = limitOf(id); return !!id && lim > 0 && countIn(id) >= lim; }
function seatsText(s) { return s.maxStudents > 0 ? `${countIn(s.id)}/${s.maxStudents}` : `${countIn(s.id)}`; }

function teachersOfSection(id) { return TEACHERS.filter(t => t.sectionId === id); }
function sectionNameOf(id)  { const s = SECTIONS.find(x => x.id === id); return s ? s.name : '—'; }
function sectionGradeOf(id) { const s = SECTIONS.find(x => x.id === id); return s && s.gradeLevel ? s.gradeLevel : '—'; }

/* ============================================================
   RENDERING
   ============================================================ */
function renderAll() {
  refreshSectionSelects();
  renderDashboard();
  renderStudentsTable();
  renderSectionStudents();
  renderTeachers();
}

// Full name on top; the nickname (the game username) underneath.
function personCell(u) {
  const main = u.fullName || u.username || '?';
  return `<span class="sa-person"><span class="sa-avatar">${escapeHtml(main.charAt(0).toUpperCase())}</span><span><strong>${escapeHtml(main)}</strong></span></span>`;
}

function statusPill(u) {
  return u.status === 'disabled' ? ' <span class="sa-pill off">Disabled</span>' : '';
}
function disableBtn(u) {
  const off = u.status === 'disabled';
  return `<button class="sa-mini ${off ? 'green' : 'red'}" onclick="toggleStudent('${u.id}')">${off ? 'Enable' : 'Disable'}</button>`;
}

function studentRowsHtml(list, colCount) {
  if (!list.length) {
    return `<tr><td colspan="${colCount}" class="sa-empty">No students found.</td></tr>`;
  }
  return list.map((u, i) => {
    return `
    <tr>
      <td>${i + 1}</td>
      <td>${personCell(u)}${statusPill(u)}</td>
      <td>${escapeHtml(u.email)}</td>
      <td>${escapeHtml(sectionNameOf(u.sectionId))}</td>
      <td>${escapeHtml(sectionGradeOf(u.sectionId))}</td>
      <td>${formatDate(u.joined)}</td>
      <td>
        <div class="sa-actions">
          ${IS_STAFF ? `<button class="sa-mini blue" onclick="openProgressModal('${u.id}')">Progress</button>` : ''}
          <button class="sa-mini blue" onclick="resendSetupEmail('${u.id}')">Resend</button>
          ${disableBtn(u)}
          <button class="sa-mini red" onclick="deleteStudent('${u.id}')">Delete</button>
        </div>
      </td>
    </tr>`;
  }).join('');
}

/* ---- dashboard ---- */
function renderDashboard() {
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('st-total',      STUDENTS.length);
  set('st-sections',   SECTIONS.length);
  set('st-teachers',   TEACHERS.length);
  set('nav-student-count', STUDENTS.length);

  const secList = document.getElementById('dash-sections');
  if (secList) {
    secList.innerHTML = SECTIONS.length
      ? SECTIONS.map(s => {
          const n = countIn(s.id);
          const full = s.maxStudents > 0 && n >= s.maxStudents;
          const label = s.maxStudents > 0 ? `${n}/${s.maxStudents} students${full ? ' (Full)' : ''}` : `${n} student${n === 1 ? '' : 's'}`;
          return `<li><div><strong>${escapeHtml(s.name)}</strong><span>${escapeHtml(s.gradeLevel || 'No grade level')}</span></div><b>${label}</b></li>`;
        }).join('')
      : `<li class="sa-empty-li">${IS_STAFF ? 'No section assigned yet. Ask your school admin to assign one.' : 'No sections yet. Create one in Sections.'}</li>`;
  }

  const recent = document.getElementById('dash-recent');
  if (recent) {
    const list = STUDENTS.slice(0, 5);
    recent.innerHTML = list.length
      ? list.map(u => `<tr>
          <td>${personCell(u)}</td>
          <td>${escapeHtml(sectionNameOf(u.sectionId))}</td>
        </tr>`).join('')
      : '<tr><td colspan="2" class="sa-empty">No students yet. Add your first one in Students.</td></tr>';
  }
}

/* ---- students tab ---- */
function renderStudentsTable() {
  const tbody = document.getElementById('students-body');
  if (!tbody) return;
  const q = document.getElementById('student-search').value.toLowerCase().trim();
  const list = STUDENTS.filter(u => !q || u.username.toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q));
  tbody.innerHTML = studentRowsHtml(list, 7);
  document.getElementById('students-count').textContent =
    `Showing ${list.length} of ${STUDENTS.length} student${STUDENTS.length === 1 ? '' : 's'}`;
}

function initStudents() {
  document.getElementById('student-search').addEventListener('input', renderStudentsTable);
  document.getElementById('register-student-btn').addEventListener('click', registerStudent);
}

async function registerStudent() {
  const fullName = document.getElementById('reg-fullname').value.trim().replace(/\s+/g, ' ');
  const email = document.getElementById('reg-email').value.trim().toLowerCase();
  const sectionId = document.getElementById('reg-section').value || null;
  const btn = document.getElementById('register-student-btn');

  const warn = (title, text) => Swal.fire({ title, text, confirmButtonColor: '#F4A234' });

  if (fullName.length < 2) { warn('Incomplete', 'Please type the student\'s full name.'); return; }
  if (!nicknameFromFullName(fullName)) { warn('Invalid name', 'The name must start with a letter or number.'); return; }
  if (!email) { warn('Incomplete', 'Please type the student\'s Gmail.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { warn('Invalid Email', 'Please enter a valid email address.'); return; }
  if (!SECTIONS.length) { warn('No section yet', IS_STAFF ? 'Ask your school admin to assign a section to you first.' : 'Create a section first (Sections tab), then register the student.'); return; }
  if (!sectionId) { warn('Pick a section', 'Please choose which section the student belongs to.'); return; }
  if (isFull(sectionId)) {
    warn('Section is full', `${sectionNameOf(sectionId)} already has ${limitOf(sectionId)} students. Please pick another section.`);
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Registering...';
  try {
    const res = await createStudentFromEmail({
      fullName,
      email,
      extra: { teacherId: OWNER_ID, school: CURRENT_SCHOOL || null, sectionId },
    });
    document.getElementById('reg-fullname').value = '';
    document.getElementById('reg-email').value = '';
    document.getElementById('reg-section').value = '';
    if (res.emailSent) {
      Swal.fire({
        icon: 'success', title: 'Registered!',
        html: `<b>${escapeHtml(fullName)}</b> was registered. The game name is <b>${escapeHtml(res.username)}</b>.<br>We sent a password-setup email to <b>${escapeHtml(email)}</b>. Ask the student to check the inbox (and Spam).`,
        confirmButtonColor: '#F4A234',
      });
    } else {
      Swal.fire({
        icon: 'warning', title: 'Account created, email not sent',
        text: 'The account was made but the setup email could not be sent. Press "Resend" next to the student in the table.',
        confirmButtonColor: '#F4A234',
      });
    }
  } catch (err) {
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered.';
    if (err.code === 'auth/invalid-email')        msg = 'Please enter a valid email address.';
    if (err.code === 'permission-denied')         msg = 'Database permission denied. Check Firestore rules.';
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Register Student';
  }
}

async function toggleStudent(id) {
  const u = STUDENTS.find(x => x.id === id);
  if (!u) return;
  const disabling = u.status !== 'disabled';
  const who = u.fullName || u.username;
  const res = await Swal.fire({
    title: disabling ? 'Disable this account?' : 'Enable this account?',
    text: disabling
      ? `${who} will not be able to log in until you enable the account again. Their progress is kept.`
      : `${who} will be able to log in again.`,
    showCancelButton: true,
    confirmButtonText: disabling ? 'Disable' : 'Enable',
    confirmButtonColor: disabling ? '#e53935' : '#4CAF50',
  });
  if (!res.isConfirmed) return;
  try {
    await updateDoc(doc(db, 'students', id), { status: disabling ? 'disabled' : 'active' });
  } catch (err) {
    const msg = err.code === 'permission-denied' ? 'Database permission denied. Publish the updated Firestore rules (students status).' : err.message;
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  }
}

async function deleteStudent(id) {
  const u = STUDENTS.find(x => x.id === id);
  if (!u) return;
  const who = u.fullName || u.username;
  const res = await Swal.fire({
    icon: 'warning',
    title: 'Delete this account?',
    html: `<b>${escapeHtml(who)}</b> will be removed from your school and can no longer log in. Their seat in the section is freed.`,
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#e53935',
  });
  if (!res.isConfirmed) return;
  try {
    await updateDoc(doc(db, 'students', id), { status: 'deleted' });
    Swal.fire({ icon: 'success', title: 'Deleted', text: `${who} was removed.`, timer: 1800, showConfirmButton: false });
  } catch (err) {
    const msg = err.code === 'permission-denied' ? 'Database permission denied. Publish the updated Firestore rules (students status).' : err.message;
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  }
}

async function resendSetupEmail(id) {
  const stu = STUDENTS.find(s => s.id === id);
  if (!stu || !stu.email) return;
  const ok = await Swal.fire({
    title: 'Resend setup email?',
    html: `We will email <b>${escapeHtml(stu.email)}</b> a link to set a new password.`,
    showCancelButton: true, confirmButtonText: 'Send', confirmButtonColor: '#F4A234',
  });
  if (!ok.isConfirmed) return;
  try {
    await sendPasswordSetupEmail(stu.email);
    Swal.fire({ icon: 'success', title: 'Sent!', text: 'Ask the student to check the inbox (and Spam).', confirmButtonColor: '#F4A234' });
  } catch (err) {
    const msg = err.code === 'auth/too-many-requests' ? 'Too many requests. Please wait a few minutes.' : err.message;
    Swal.fire({ icon: 'error', title: 'Could not send', text: msg, confirmButtonColor: '#e53935' });
  }
}

/* ============================================================
   SECTIONS
   Firestore: sections/{id} = { name, gradeLevel, maxStudents, teacherId, school, createdAt }
   A student joins a section through students/{uid}.sectionId.
   ============================================================ */
function refreshSectionSelects() {
  const optionsHtml = SECTIONS.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${seatsText(s)})</option>`).join('');
  const regOptionsHtml = SECTIONS.map(s => {
    const full = s.maxStudents > 0 && countIn(s.id) >= s.maxStudents;
    return `<option value="${s.id}"${full ? ' disabled' : ''}>${escapeHtml(s.name)} (${seatsText(s)})${full ? ' - Full' : ''}</option>`;
  }).join('');

  const filter = document.getElementById('section-filter');
  if (filter) {
    const prev = filter.value;
    filter.innerHTML = '<option value="">All students</option>' + optionsHtml + '<option value="none">No section</option>';
    filter.value = [...filter.options].some(o => o.value === prev) ? prev : '';
  }
  const reg = document.getElementById('reg-section');
  if (reg) {
    const prev = reg.value;
    reg.innerHTML = '<option value="">Select a section</option>' + regOptionsHtml;
    reg.value = [...reg.options].some(o => o.value === prev) ? prev : '';
    if (IS_STAFF && STAFF_SECTION && [...reg.options].some(o => o.value === STAFF_SECTION)) reg.value = STAFF_SECTION;
  }
}

function renderSectionStudents() {
  const box = document.getElementById('section-list');
  if (!box) return;
  const q = document.getElementById('section-search').value.toLowerCase().trim();
  const matches = u => u.username.toLowerCase().includes(q) || (u.fullName || '').toLowerCase().includes(q) || u.email.toLowerCase().includes(q);

  const blocks = [];
  SECTIONS.forEach(sec => {
    const members = STUDENTS.filter(u => u.sectionId === sec.id);
    const shown = !q || sec.name.toLowerCase().includes(q) ? members : members.filter(matches);
    if (q && !shown.length && !sec.name.toLowerCase().includes(q)) return;
    blocks.push({ sec, members: shown, total: members.length });
  });
  const loose = STUDENTS.filter(u => !u.sectionId || !SECTIONS.some(s => s.id === u.sectionId))
    .filter(u => !q || matches(u));
  if (loose.length) blocks.push({ sec: null, members: loose, total: loose.length });

  const studentTable = list => `
    <div class="sa-table-wrap"><table class="sa-table">
      <thead><tr><th>#</th><th>Name</th><th>Email</th><th>Date Joined</th><th>Manage</th></tr></thead>
      <tbody>${list.map((u, i) => `<tr>
        <td>${i + 1}</td>
        <td>${personCell(u)}${statusPill(u)}</td>
        <td>${escapeHtml(u.email)}</td>
        <td>${formatDate(u.joined)}</td>
        <td><div class="sa-actions">
          ${IS_STAFF ? `<button class="sa-mini blue" onclick="openProgressModal('${u.id}')">Progress</button>` : ''}
          <button class="sa-mini blue" onclick="resendSetupEmail('${u.id}')">Resend</button>
          ${disableBtn(u)}
          <button class="sa-mini red" onclick="deleteStudent('${u.id}')">Delete</button>
        </div></td>
      </tr>`).join('')}</tbody>
    </table></div>`;

  box.innerHTML = blocks.length ? blocks.map(({ sec, members, total }) => {
    if (!sec) {
      return `<div class="sa-sec">
        <div class="sa-sec-head"><div><h4>No section</h4><span>Students not in any section yet</span></div>
        <span class="sa-pill off">${total} student${total === 1 ? '' : 's'}</span></div>
        ${studentTable(members)}
      </div>`;
    }
    const grade = sec.gradeLevel ? escapeHtml(sec.gradeLevel) : 'No grade level';
    const tch = teachersOfSection(sec.id);
    const tchHtml = tch.length
      ? `<span class="sa-sec-teacher">Teacher: <b>${tch.map(t => escapeHtml(t.username)).join(', ')}</b></span>`
      : '<span class="sa-sec-teacher none">No teacher assigned</span>';
    return `<div class="sa-sec">
      <div class="sa-sec-head">
        <div><h4>${escapeHtml(sec.name)}</h4><span>${grade} &middot; ${seatsText(sec)} students${sec.maxStudents > 0 ? '' : ' (no limit)'}</span>${tchHtml}</div>
        <div class="sa-actions">
          <button class="sa-mini blue" onclick="changeSectionLimit('${sec.id}')">Change Limit</button>
          <button class="sa-mini red" onclick="deleteSelectedSection('${sec.id}')">Delete</button>
        </div>
      </div>
      ${members.length ? studentTable(members) : '<p class="sa-sec-empty">No students in this section yet.</p>'}
    </div>`;
  }).join('') : '<p class="sa-sec-empty">No sections yet. Create one above.</p>';

  document.getElementById('section-students-count').textContent =
    `${SECTIONS.length} section${SECTIONS.length === 1 ? '' : 's'} · ${STUDENTS.length} student${STUDENTS.length === 1 ? '' : 's'}`;
}

function initSections() {
  document.getElementById('create-section-btn').addEventListener('click', createSection);
  document.getElementById('section-search').addEventListener('input', renderSectionStudents);
}

async function createSection() {
  const nameEl  = document.getElementById('sec-name');
  const gradeEl = document.getElementById('sec-grade');
  const btn     = document.getElementById('create-section-btn');
  const name    = nameEl.value.trim();
  const limitEl = document.getElementById('sec-limit');
  const limit   = Number(limitEl.value);

  if (!name) {
    Swal.fire({ title: 'Section name needed', text: 'Please type a section name, e.g. Grade 4 - Section A.', confirmButtonColor: '#F4A234' });
    return;
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    Swal.fire({ title: 'Student limit needed', text: `Enter how many students this section can hold (1 to ${MAX_LIMIT}).`, confirmButtonColor: '#F4A234' });
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
      maxStudents: limit,
      teacherId:  CURRENT_UID,
      school:     CURRENT_SCHOOL || null,
      createdAt:  serverTimestamp(),
    });
    nameEl.value = '';
    gradeEl.value = '';
    limitEl.value = '40';
    Swal.fire({ title: 'Section created!', text: `${name} is ready for up to ${limit} students. Pick it when you register a student.`, timer: 2000, showConfirmButton: false });
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

async function changeSectionLimit(id) {
  const sec = SECTIONS.find(x => x.id === id);
  if (!sec) return;
  const used = countIn(id);

  const res = await Swal.fire({
    title: 'Student limit',
    text: `${sec.name} has ${used} student${used === 1 ? '' : 's'} now.`,
    input: 'number',
    inputValue: sec.maxStudents || 40,
    inputAttributes: { min: Math.max(1, used), max: MAX_LIMIT, step: 1 },
    showCancelButton: true,
    confirmButtonText: 'Save',
    confirmButtonColor: '#F4A234',
    inputValidator: v => {
      const n = Number(v);
      if (!Number.isInteger(n) || n < 1 || n > MAX_LIMIT) return `Enter a whole number from 1 to ${MAX_LIMIT}.`;
      if (n < used) return `This section already has ${used} students. Move some out first, or pick ${used} or more.`;
    },
  });
  if (!res.isConfirmed) return;

  try {
    await updateDoc(doc(db, 'sections', id), { maxStudents: Number(res.value) });
  } catch (err) {
    const msg = err.code === 'permission-denied' ? 'Database permission denied. Your Firestore rules need to allow the "maxStudents" field on sections.' : err.message;
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  }
}

async function deleteSelectedSection(id) {
  if (!id) return;
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
    await Promise.all(TEACHERS.filter(t => t.sectionId === id).map(t => updateDoc(doc(db, 'teachers', t.id), { sectionId: null })));
    await deleteDoc(doc(db, 'sections', id));
    renderSectionStudents();
  } catch (err) {
    Swal.fire({ title: 'Error', text: err.message, confirmButtonColor: '#e53935' });
  }
}

/* ============================================================
   TEACHERS (school admin only)
   Firestore: teachers/{uid} = { role:'staff', ownerId, sectionId, username, email, school, active, joined, createdAt }
   A teacher sees only the students whose sectionId matches theirs.
   ============================================================ */
function listenToTeachers() {
  if (teachersUnsub) teachersUnsub();
  const q = query(collection(db, 'teachers'), where('ownerId', '==', CURRENT_UID));
  teachersUnsub = onSnapshot(q, (snap) => {
    TEACHERS = snap.docs.map(d => ({
      id:        d.id,
      username:  d.data().username || '(no name)',
      email:     d.data().email || '(no email)',
      sectionId: d.data().sectionId || null,
      active:    d.data().active !== false,
      joined:    d.data().joined || null,
      createdAt: d.data().createdAt || null,
    }));
    TEACHERS.sort((a, b) => sortableTime(b) - sortableTime(a));
    renderTeachers();
    renderSectionStudents();
  }, (err) => {
    console.error('Teachers listener error:', err);
    Swal.fire({ title: 'Teachers unavailable', text: 'Could not load teachers. Check that your Firestore rules allow reading teachers you added.', confirmButtonColor: '#e53935' });
  });
}

function renderTeachers() {
  const tbody = document.getElementById('teachers-body');
  if (!tbody) return;
  const navCount = document.getElementById('nav-teacher-count');
  if (navCount) navCount.textContent = TEACHERS.length;
  const stTeachers = document.getElementById('st-teachers');
  if (stTeachers) stTeachers.textContent = TEACHERS.length;

  const dash = document.getElementById('dash-teachers');
  if (dash) {
    dash.innerHTML = TEACHERS.length
      ? TEACHERS.slice(0, 5).map(t => `<tr>
          <td><span class="sa-person"><span class="sa-avatar">${escapeHtml(t.username.charAt(0).toUpperCase())}</span><strong>${escapeHtml(t.username)}</strong></span></td>
          <td>${escapeHtml(t.email)}</td>
        </tr>`).join('')
      : '<tr><td colspan="2" class="sa-empty">No teachers yet. Add one in Teachers.</td></tr>';
  }

  tbody.innerHTML = TEACHERS.length
    ? TEACHERS.map((t, i) => `<tr>
        <td>${i + 1}</td>
        <td><span class="sa-person"><span class="sa-avatar">${escapeHtml(t.username.charAt(0).toUpperCase())}</span><strong>${escapeHtml(t.username)}</strong></span></td>
        <td>${escapeHtml(t.email)}</td>
        <td>${t.sectionId ? escapeHtml(sectionNameOf(t.sectionId)) : 'Not assigned yet'}</td>
        <td>
          <div class="sa-actions">
            <button class="sa-mini blue" onclick="changeTeacherSection('${t.id}')">Section</button>
            <button class="sa-mini blue" onclick="resendTeacherEmail('${t.id}')">Resend</button>
          </div>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="5" class="sa-empty">No teachers yet. Add your first teacher above.</td></tr>';

  const countEl = document.getElementById('teachers-count');
  if (countEl) countEl.textContent = `${TEACHERS.length} teacher${TEACHERS.length === 1 ? '' : 's'}`;
}

function initTeachers() {
  document.getElementById('add-teacher-btn').addEventListener('click', addTeacher);
}

async function addTeacher() {
  const name      = document.getElementById('tch-name').value.trim();
  const email     = document.getElementById('tch-email').value.trim().toLowerCase();
  const btn       = document.getElementById('add-teacher-btn');
  const warn = (title, text) => Swal.fire({ title, text, confirmButtonColor: '#F4A234' });

  if (name.length < 2) { warn('Incomplete', 'Please type the teacher\'s name.'); return; }
  if (!email) { warn('Incomplete', 'Please type the teacher\'s Gmail.'); return; }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { warn('Invalid Email', 'Please enter a valid email address.'); return; }

  btn.disabled = true;
  btn.textContent = 'Adding...';
  try {
    const res = await createTeacherFromEmail({
      name, email,
      extra: { ownerId: CURRENT_UID, school: CURRENT_SCHOOL || null },
    });
    document.getElementById('tch-name').value = '';
    document.getElementById('tch-email').value = '';
    if (res.emailSent) {
      Swal.fire({
        icon: 'success', title: 'Teacher added!',
        html: `We sent a password-setup email to <b>${escapeHtml(email)}</b>.<br>${escapeHtml(name)} can then log in. Press Section next to the teacher to choose which section they handle.`,
        confirmButtonColor: '#F4A234',
      });
    } else {
      Swal.fire({
        icon: 'warning', title: 'Teacher added, email not sent',
        text: 'The account was made but the setup email could not be sent. Press "Resend" next to the teacher in the table.',
        confirmButtonColor: '#F4A234',
      });
    }
  } catch (err) {
    let msg = err.message;
    if (err.code === 'auth/email-already-in-use') msg = 'That email is already registered.';
    if (err.code === 'auth/invalid-email')        msg = 'Please enter a valid email address.';
    if (err.code === 'permission-denied')         msg = 'Database permission denied. Check Firestore rules for teachers.';
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  } finally {
    btn.disabled = false;
    btn.textContent = 'Add Teacher';
  }
}

async function changeTeacherSection(id) {
  const t = TEACHERS.find(x => x.id === id);
  if (!t) return;
  if (!SECTIONS.length) { Swal.fire({ title: 'No sections yet', text: 'Create a section first (Sections tab).', confirmButtonColor: '#F4A234' }); return; }

  // One teacher per section: only show sections nobody else handles (plus this teacher's own).
  const takenBy = secId => TEACHERS.find(x => x.id !== id && x.sectionId === secId);
  const free = SECTIONS.filter(s => !takenBy(s.id));
  if (!free.length) {
    Swal.fire({ title: 'No free section', text: 'Every section already has a teacher. Create a new section or change the teacher of another section first.', confirmButtonColor: '#F4A234' });
    return;
  }
  const options = {};
  free.forEach(s => { options[s.id] = s.name; });

  const res = await Swal.fire({
    title: 'Assign section',
    text: `Choose the section ${t.username} will handle. Only sections without a teacher are listed.`,
    input: 'select',
    inputOptions: options,
    inputValue: t.sectionId && options[t.sectionId] ? t.sectionId : '',
    inputPlaceholder: 'Select a section',
    showCancelButton: true,
    confirmButtonText: 'Save',
    confirmButtonColor: '#F4A234',
    inputValidator: v => {
      if (!v) return 'Please pick a section.';
      const other = takenBy(v);
      if (other) return `${other.username} already handles this section.`;
    },
  });
  if (!res.isConfirmed) return;
  try {
    await updateDoc(doc(db, 'teachers', id), { sectionId: res.value });
    Swal.fire({ icon: 'success', title: 'Saved', text: 'The teacher will see the change the next time they open or refresh the page.', confirmButtonColor: '#F4A234' });
  } catch (err) {
    const msg = err.code === 'permission-denied' ? 'Database permission denied. Check Firestore rules for teachers.' : err.message;
    Swal.fire({ title: 'Error', text: msg, confirmButtonColor: '#e53935' });
  }
}

async function resendTeacherEmail(id) {
  const t = TEACHERS.find(x => x.id === id);
  if (!t || !t.email) return;
  const ok = await Swal.fire({
    title: 'Resend setup email?',
    html: `We will email <b>${escapeHtml(t.email)}</b> a link to set a new password.`,
    showCancelButton: true, confirmButtonText: 'Send', confirmButtonColor: '#F4A234',
  });
  if (!ok.isConfirmed) return;
  try {
    await sendPasswordSetupEmail(t.email);
    Swal.fire({ icon: 'success', title: 'Sent!', text: 'Ask the teacher to check the inbox (and Spam).', confirmButtonColor: '#F4A234' });
  } catch (err) {
    const msg = err.code === 'auth/too-many-requests' ? 'Too many requests. Please wait a few minutes.' : err.message;
    Swal.fire({ icon: 'error', title: 'Could not send', text: msg, confirmButtonColor: '#e53935' });
  }
}

// Expose for inline onclick handlers in the tables
window.openProgressModal = (id) => openProgressModal(STUDENTS.find(s => s.id === id));
window.resendSetupEmail = resendSetupEmail;
window.toggleStudent = toggleStudent;
window.deleteStudent = deleteStudent;
window.changeSectionLimit = changeSectionLimit;
window.deleteSelectedSection = deleteSelectedSection;
window.changeTeacherSection = changeTeacherSection;
window.resendTeacherEmail = resendTeacherEmail;
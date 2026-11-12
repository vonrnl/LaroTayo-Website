import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  collection, doc, getDoc, updateDoc, onSnapshot, query, orderBy, writeBatch, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db, escapeHtml as esc, initPasswordForm, initLogout } from "./shared.js";

/* WEBSITE ADMIN PANEL: schools, payments, reports. Owner only (teachers/{uid}.role === 'admin'). */

const $ = id => document.getElementById(id);
const TITLES = { dashboard: 'Dashboard', verify: 'Verification', schools: 'Schools', bugs: 'Bug Reports', payments: 'Payments', reports: 'Reports', settings: 'Settings' };
let SCHOOLS = [], STUDENTS = [], PAYMENTS = [], paymentsFailed = false;
let REPORTS = [], reportsFailed = false;

const ms   = t => !t ? 0 : t.toMillis ? t.toMillis() : (new Date(t).getTime() || 0);
const day  = t => ms(t) ? new Date(ms(t)).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const none = (cols, msg) => `<tr><td colspan="${cols}" class="sa-empty">${msg}</td></tr>`;
const joined = x => ms(x.createdAt) || ms(x.joined);

function access(s) {
  // new schools: pending -> approved (then pays) or rejected. Older schools have no 'verification' field.
  if (s.verification === 'pending')  return { k: 'off', label: 'Pending review' };
  if (s.verification === 'rejected') return { k: 'bad', label: 'Rejected' };
  if (s.verification === 'approved' && !s.paid) return { k: 'off', label: 'Approved, unpaid' };
  return s.paid ? { k: 'on', label: 'Paid' } : { k: 'off', label: 'Unpaid' };   // one-time fee, no expiry
}
const pill = a => `<span class="sa-pill ${a.k}">${esc(a.label)}</span>`;

/* ---------------- INIT ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    try {
      const snap = await getDoc(doc(db, 'teachers', user.uid));
      if (!snap.exists() || !['admin', 'teacher', 'staff'].includes(snap.data().role)) { window.location.href = 'dashboard.html'; return; }
      if (snap.data().role !== 'admin') { window.location.href = 'school-admin.html'; return; }

      const name = snap.data().username || user.email;
      $('sa-user-name').textContent = name;
      $('sa-user-initial').textContent = name.charAt(0).toUpperCase();
      $('pf-name').textContent = name;
      $('pf-email').textContent = user.email;

      initNav(); initPasswordForm(); initLogout('admin-logout'); initActions(); listen();
    } catch (e) {
      console.error(e);
      Swal.fire({ icon: 'error', title: 'Error', text: 'Could not load your account.' });
    }
  });
});

function initNav() {
  const sidebar = $('sa-sidebar'), scrim = $('sa-scrim');
  const close = () => { sidebar.classList.remove('open'); scrim.classList.remove('open'); };
  document.querySelectorAll('.sa-menu-btn').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('.sa-menu-btn').forEach(x => x.classList.toggle('active', x === b));
    document.querySelectorAll('.sa-panel').forEach(p => p.classList.toggle('active', p.id === 'tab-' + b.dataset.tab));
    $('sa-page-title').textContent = TITLES[b.dataset.tab] || '';
    close(); window.scrollTo(0, 0);
  }));
  $('sa-burger').addEventListener('click', () => { sidebar.classList.toggle('open'); scrim.classList.toggle('open'); });
  scrim.addEventListener('click', close);
}

/* ---------------- LIVE DATA ---------------- */
function listen() {
  const fail = e => { console.error(e); Swal.fire({ icon: 'error', title: 'Could not load data', text: 'Check your Firestore rules.' }); };
  onSnapshot(collection(db, 'teachers'), s => {
    SCHOOLS = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.role === 'teacher' && !x.ownerId);   // real schools only, not teachers added by a school
    renderAll();
  }, fail);
  onSnapshot(collection(db, 'students'), s => { STUDENTS = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.status !== 'deleted'); renderAll(); }, fail);
  onSnapshot(query(collection(db, 'payments'), orderBy('paidAt', 'desc')),
    s => { PAYMENTS = s.docs.map(d => ({ id: d.id, ...d.data() })); paymentsFailed = false; renderAll(); },
    e => { console.error(e); PAYMENTS = []; paymentsFailed = true; renderAll(); });
  onSnapshot(query(collection(db, 'reports'), orderBy('createdAt', 'desc')),
    s => { REPORTS = s.docs.map(d => ({ id: d.id, ...d.data() })); reportsFailed = false; renderReports(); },
    e => { console.error(e); REPORTS = []; reportsFailed = true; renderReports(); });
}

/* ---------------- BUG REPORTS ---------------- */
const TYPE_LABEL = { bug: 'Bug', feedback: 'Feedback', suggestion: 'Suggestion' };

function renderReports() {
  $('nav-bug-count').textContent = REPORTS.length;
  const ty = $('bug-type').value;
  const rows = REPORTS.filter(r => !ty || r.type === ty);

  $('bugs-body').innerHTML = rows.map(r => `<tr>
      <td>${day(r.createdAt)}</td>
      <td>${esc(r.name || '—')}<br><small>${esc(r.email || '')}</small></td>
      <td>${esc(TYPE_LABEL[r.type] || r.type || '—')}</td>
      <td>${esc(r.area || '—')}</td>
      <td style="min-width:260px;white-space:pre-wrap;overflow-wrap:anywhere">${esc(r.message || '')}</td>
    </tr>`).join('')
    || none(5, reportsFailed ? 'Could not load reports. Publish the updated Firestore rules (reports collection).' : 'No reports yet. Reports sent from the player dashboard will appear here.');
  $('bugs-count').textContent = `Showing ${rows.length} of ${REPORTS.length} reports`;
}

/* ---------------- RENDER ---------------- */
function renderAll() {
  const counts = {};
  STUDENTS.forEach(s => { if (s.teacherId) counts[s.teacherId] = (counts[s.teacherId] || 0) + 1; });
  const sorted = [...SCHOOLS].sort((a, b) => joined(b) - joined(a));
  const paid = SCHOOLS.filter(s => access(s).k === 'on').length;
  const revenue = PAYMENTS.reduce((t, p) => t + (Number(p.amount) || 0), 0);

  $('nav-school-count').textContent = SCHOOLS.length;
  $('st-schools').textContent = SCHOOLS.length;
  $('st-paid').textContent = paid;
  $('st-students').textContent = STUDENTS.length;
  $('st-pending').textContent = SCHOOLS.filter(s => s.verification === 'pending').length;

  $('dash-schools').innerHTML = sorted.slice(0, 5).map(s =>
    `<tr><td>${esc(s.school || '—')}</td><td>${esc(s.username || '—')}</td><td>${day(s.createdAt)}</td></tr>`).join('') || none(3, 'No schools yet.');
  $('dash-payments').innerHTML = PAYMENTS.slice(0, 5).map(p =>
    `<tr><td>${esc(p.schoolName || '—')}</td><td>${peso(p.amount)}</td><td>${day(p.paidAt)}</td></tr>`).join('') || none(3, 'No payments yet.');

  renderSchools(sorted, counts);
  renderVerify(sorted);

  $('payments-body').innerHTML = PAYMENTS.map(p =>
    `<tr><td>${day(p.paidAt)}</td><td>${esc(p.schoolName || '—')}<br><small>${esc(p.adminName || '')}</small></td><td>${peso(p.amount)}</td><td>${esc(p.method || '—')}</td><td>${esc(p.reference || '—')}</td></tr>`).join('')
    || none(5, paymentsFailed ? 'Could not load payments. Publish the updated Firestore rules (payments collection).' : 'No payments recorded yet.');
  $('payments-total').textContent = `${PAYMENTS.length} payment${PAYMENTS.length === 1 ? '' : 's'} · Total ${peso(revenue)}`;

  $('rp-revenue').textContent = peso(revenue);
  $('rp-paid').textContent = paid;
  $('rp-students').textContent = STUDENTS.length;
  $('rp-avg').textContent = SCHOOLS.length ? (STUDENTS.filter(s => s.teacherId).length / SCHOOLS.length).toFixed(1) : '0';

  const months = [];
  for (let i = 5; i >= 0; i--) { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() - i); months.push(d.toISOString().slice(0, 7)); }
  const key = t => ms(t) ? new Date(ms(t)).toISOString().slice(0, 7) : '';
  $('rp-months').innerHTML = months.reverse().map(m => {
    const rev = PAYMENTS.filter(p => key(p.paidAt) === m).reduce((t, p) => t + (Number(p.amount) || 0), 0);
    return `<tr><td>${m}</td><td>${SCHOOLS.filter(s => key(s.createdAt) === m).length}</td><td>${STUDENTS.filter(s => key(joined(s)) === m).length}</td><td>${peso(rev)}</td></tr>`;
  }).join('');
  $('rp-schools').innerHTML = sorted.map(s =>
    `<tr><td>${esc(s.school || '—')}</td><td>${esc(s.username || '—')}</td><td>${counts[s.id] || 0}</td><td>${pill(access(s))}</td></tr>`).join('') || none(4, 'No schools yet.');
}

function renderVerify(sorted) {
  const pending  = sorted.filter(s => s.verification === 'pending');
  const rejected = sorted.filter(s => s.verification === 'rejected');
  const rows = [...pending, ...rejected];
  $('nav-verify-count').textContent = pending.length;
  $('verify-body').innerHTML = rows.map(s => `<tr>
    <td>${esc(s.school || '—')}<br><small>${esc(s.category || '')}</small></td>
    <td>${esc(s.username || '—')}</td><td>${esc(s.email || '—')}</td><td>${day(s.createdAt)}</td>
    <td>${pill(access(s))}${s.verification === 'rejected' && s.verificationNote ? '<br><small>' + esc(s.verificationNote) + '</small>' : ''}</td>
    <td><div class="sa-actions"><button class="sa-mini blue" onclick="reviewSchool('${esc(s.id)}')">Review</button></div></td></tr>`).join('')
    || none(6, 'No applications waiting. New school sign-ups will appear here.');
  $('verify-count').textContent = `${pending.length} waiting for review · ${rejected.length} rejected`;
}

// Open the document, then approve / reject from the same popup.
async function reviewSchool(id) {
  const s = SCHOOLS.find(x => x.id === id);
  if (!s) return;

  let v = null;
  try {
    const snap = await getDoc(doc(db, 'verifications', id));
    v = snap.exists() ? snap.data() : null;
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: 'error', title: 'Could not load the document', text: 'Check that your Firestore rules allow the admin to read the "verifications" collection.' });
    return;
  }

  const img = v && typeof v.imageData === 'string' && v.imageData.startsWith('data:image/')
    ? `<a href="${esc(v.imageData)}" target="_blank" rel="noopener"><img src="${esc(v.imageData)}" alt="Submitted document" style="max-width:100%;max-height:340px;border-radius:12px;border:2px solid #cfe3f2;background:#fff"></a><p style="font-size:.78rem;color:#6A8AA0;margin-top:4px">Click the picture to open it full size.</p>`
    : '<p style="color:#c62828;font-weight:700">No document on file for this school.</p>';
  const row = (k, val) => `<div style="display:flex;justify-content:space-between;gap:12px;padding:6px 0;border-bottom:1px dashed #cfe3f2;font-size:.9rem"><span style="color:#6A8AA0;font-weight:600">${k}</span><b style="text-align:right;overflow-wrap:anywhere">${esc(val || '—')}</b></div>`;

  const res = await Swal.fire({
    title: 'Review application',
    width: 'min(94vw, 640px)',
    html: `<div style="text-align:left;margin-bottom:12px">
        ${row('School', s.school)}${row('Name', s.username)}${row('Category', s.category)}${row('Email', s.email)}
        ${row('Document', v && v.docType)}${row('School ID number', v && v.schoolIdNumber)}
      </div>${img}`,
    showConfirmButton: s.verification !== 'approved',
    showDenyButton: true,
    showCancelButton: true,
    confirmButtonText: 'Approve',
    denyButtonText: 'Reject',
    cancelButtonText: 'Close',
    confirmButtonColor: '#4CAF50',
    denyButtonColor: '#e53935',
    cancelButtonColor: '#6A8AA0',
  });

  const adminUid = auth.currentUser ? auth.currentUser.uid : null;
  try {
    if (res.isConfirmed) {
      // approve + delete the document together
      const batch = writeBatch(db);
      batch.update(doc(db, 'teachers', id), {
        verification: 'approved', verificationNote: '',
        verifiedDocType: (v && v.docType) || '', verifiedAt: serverTimestamp(), verifiedBy: adminUid,
      });
      batch.delete(doc(db, 'verifications', id));
      await batch.commit();
      Swal.fire({ icon: 'success', title: 'Approved', text: `${s.school || 'The school'} can now log in and pay to activate.`, timer: 2200, showConfirmButton: false });
    } else if (res.isDenied) {
      const why = await Swal.fire({
        title: 'Reason for rejecting',
        input: 'textarea',
        inputPlaceholder: 'e.g. The photo is blurry, or the name does not match.',
        inputAttributes: { maxlength: 200 },
        inputValidator: val => (val && val.trim().length >= 5 ? undefined : 'Please write a short reason (at least 5 letters).'),
        showCancelButton: true,
        confirmButtonText: 'Reject',
        confirmButtonColor: '#e53935',
      });
      if (!why.isConfirmed) return;
      await updateDoc(doc(db, 'teachers', id), {
        verification: 'rejected', verificationNote: why.value.trim().slice(0, 200),
        verifiedAt: serverTimestamp(), verifiedBy: adminUid,
      });
      Swal.fire({ icon: 'info', title: 'Rejected', text: 'They will see your reason the next time they log in.', timer: 2200, showConfirmButton: false });
    }
  } catch (e) {
    console.error(e);
    Swal.fire({ icon: 'error', title: 'Could not save', text: e.code === 'permission-denied' ? 'Database permission denied. Check your Firestore rules.' : e.message });
  }
}
window.reviewSchool = reviewSchool;

function renderSchools(sorted, counts) {
  const q = $('school-search').value.toLowerCase().trim();
  const rows = sorted.filter(s => !q || [s.school, s.username, s.email].some(v => String(v || '').toLowerCase().includes(q)));
  $('schools-body').innerHTML = rows.map((s, i) => `<tr>
    <td>${i + 1}</td><td>${esc(s.school || '—')}<br><small>${esc(s.category || '')}</small></td><td>${esc(s.username || '—')}</td><td>${esc(s.email || '—')}</td>
    <td>${counts[s.id] || 0}</td><td>${pill(access(s))}</td><td>${day(s.createdAt)}</td></tr>`).join('')
    || none(7, 'No schools found.');
  $('schools-count').textContent = `Showing ${rows.length} of ${SCHOOLS.length} schools`;
}

/* ---------------- ACTIONS ---------------- */
function initActions() {
  $('school-search').addEventListener('input', renderAll);
  $('bug-type').addEventListener('change', renderReports);
}
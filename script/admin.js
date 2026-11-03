import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  collection, doc, getDoc, onSnapshot, query, orderBy, updateDoc, writeBatch, Timestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db, escapeHtml as esc, initPasswordForm, initLogout } from "./shared.js";

/* WEBSITE ADMIN PANEL: schools, payments, reports. Owner only (teachers/{uid}.role === 'admin'). */

const $ = id => document.getElementById(id);
const DAY = 864e5;
const TITLES = { dashboard: 'Dashboard', schools: 'Schools', payments: 'Payments', reports: 'Reports', settings: 'Settings' };
let SCHOOLS = [], STUDENTS = [], PAYMENTS = [], paymentsFailed = false;

const ms   = t => !t ? 0 : t.toMillis ? t.toMillis() : (new Date(t).getTime() || 0);
const day  = t => ms(t) ? new Date(ms(t)).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const none = (cols, msg) => `<tr><td colspan="${cols}" class="sa-empty">${msg}</td></tr>`;
const joined = x => ms(x.createdAt) || ms(x.joined);

function access(s) {
  const until = ms(s.paidUntil);
  if (!s.paid) return { k: 'off', label: 'Unpaid' };
  if (until && until < Date.now()) return { k: 'bad', label: 'Expired' };
  return { k: 'on', label: 'Paid' + (until ? ' · until ' + day(s.paidUntil) : '') };
}
const pill = a => `<span class="sa-pill ${a.k}">${esc(a.label)}</span>`;

/* ---------------- INIT ---------------- */
document.addEventListener('DOMContentLoaded', () => {
  onAuthStateChanged(auth, async (user) => {
    if (!user) { window.location.href = 'index.html'; return; }
    try {
      const snap = await getDoc(doc(db, 'teachers', user.uid));
      if (!snap.exists() || !['admin', 'teacher'].includes(snap.data().role)) { window.location.href = 'dashboard.html'; return; }
      if (snap.data().role === 'teacher') { window.location.href = 'school-admin.html'; return; }

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
    SCHOOLS = s.docs.map(d => ({ id: d.id, ...d.data() })).filter(x => x.role === 'teacher');
    renderAll();
  }, fail);
  onSnapshot(collection(db, 'students'), s => { STUDENTS = s.docs.map(d => ({ id: d.id, ...d.data() })); renderAll(); }, fail);
  onSnapshot(query(collection(db, 'payments'), orderBy('paidAt', 'desc')),
    s => { PAYMENTS = s.docs.map(d => ({ id: d.id, ...d.data() })); paymentsFailed = false; renderAll(); },
    e => { console.error(e); PAYMENTS = []; paymentsFailed = true; renderAll(); });
}

/* ---------------- RENDER ---------------- */
function renderAll() {
  const counts = {}, active = {};
  STUDENTS.forEach(s => { if (s.teacherId) { counts[s.teacherId] = (counts[s.teacherId] || 0) + 1; if (s.status !== 'inactive') active[s.teacherId] = (active[s.teacherId] || 0) + 1; } });
  const sorted = [...SCHOOLS].sort((a, b) => joined(b) - joined(a));
  const paid = SCHOOLS.filter(s => access(s).k === 'on').length;
  const revenue = PAYMENTS.reduce((t, p) => t + (Number(p.amount) || 0), 0);

  $('nav-school-count').textContent = SCHOOLS.length;
  $('st-schools').textContent = SCHOOLS.length;
  $('st-paid').textContent = paid;
  $('st-unpaid').textContent = SCHOOLS.length - paid;
  $('st-students').textContent = STUDENTS.length;

  $('dash-schools').innerHTML = sorted.slice(0, 5).map(s =>
    `<tr><td>${esc(s.school || '—')}</td><td>${esc(s.username || '—')}</td><td>${day(s.createdAt)}</td></tr>`).join('') || none(3, 'No schools yet.');
  $('dash-payments').innerHTML = PAYMENTS.slice(0, 5).map(p =>
    `<tr><td>${esc(p.schoolName || '—')}</td><td>${peso(p.amount)}</td><td>${day(p.paidAt)}</td></tr>`).join('') || none(3, 'No payments yet.');

  renderSchools(sorted, counts);

  $('payments-body').innerHTML = PAYMENTS.map(p =>
    `<tr><td>${day(p.paidAt)}</td><td>${esc(p.schoolName || '—')}<br><small>${esc(p.adminName || '')}</small></td><td>${peso(p.amount)}</td><td>${esc(p.method || '—')}</td><td>${esc(p.reference || '—')}</td><td>${day(p.paidUntil)}</td></tr>`).join('')
    || none(6, paymentsFailed ? 'Could not load payments. Publish the updated Firestore rules (payments collection).' : 'No payments recorded yet.');
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
    `<tr><td>${esc(s.school || '—')}</td><td>${esc(s.username || '—')}</td><td>${counts[s.id] || 0}</td><td>${active[s.id] || 0}</td><td>${pill(access(s))}</td></tr>`).join('') || none(5, 'No schools yet.');
}

function renderSchools(sorted, counts) {
  const q = $('school-search').value.toLowerCase().trim();
  const rows = sorted.filter(s => !q || [s.school, s.username, s.email].some(v => String(v || '').toLowerCase().includes(q)));
  $('schools-body').innerHTML = rows.map((s, i) => `<tr>
    <td>${i + 1}</td><td>${esc(s.school || '—')}<br><small>${esc(s.category || '')}</small></td><td>${esc(s.username || '—')}</td><td>${esc(s.email || '—')}</td>
    <td>${counts[s.id] || 0}</td><td>${pill(access(s))}</td><td>${day(s.createdAt)}</td>
    <td class="sa-actions"><button class="sa-mini green" data-pay="${esc(s.id)}">Record payment</button>${s.paid ? `<button class="sa-mini red" data-revoke="${esc(s.id)}">Revoke</button>` : ''}</td></tr>`).join('')
    || none(8, 'No schools found.');
  $('schools-count').textContent = `Showing ${rows.length} of ${SCHOOLS.length} schools`;
}

/* ---------------- ACTIONS ---------------- */
function initActions() {
  $('school-search').addEventListener('input', renderAll);
  $('record-payment-btn').addEventListener('click', () => recordPayment());
  $('schools-body').addEventListener('click', e => {
    const pay = e.target.closest('[data-pay]'), rev = e.target.closest('[data-revoke]');
    if (pay) recordPayment(pay.dataset.pay);
    if (rev) revokeAccess(rev.dataset.revoke);
  });
  document.querySelectorAll('[data-csv]').forEach(b => b.addEventListener('click', () => exportCsv(b.dataset.csv)));
}

async function recordPayment(schoolId) {
  if (!SCHOOLS.length) { Swal.fire({ icon: 'info', title: 'No schools yet' }); return; }
  const opts = SCHOOLS.map(s => `<option value="${esc(s.id)}"${s.id === schoolId ? ' selected' : ''}>${esc(s.school || s.username)} (${esc(s.email)})</option>`).join('');
  const methods = ['GCash', 'Bank transfer', 'Cash', 'Credit/Debit Card', 'PayPal', 'Other'].map(m => `<option>${m}</option>`).join('');
  const r = await Swal.fire({
    title: 'Record Payment', showCancelButton: true, confirmButtonText: 'Save', confirmButtonColor: '#F4A234',
    html: `<select id="rp-school" class="swal2-select">${opts}</select>
      <input id="rp-amount" class="swal2-input" type="number" min="0" step="0.01" placeholder="Amount (PHP)">
      <select id="rp-method" class="swal2-select">${methods}</select>
      <input id="rp-ref" class="swal2-input" maxlength="60" placeholder="Reference no. (optional)">
      <input id="rp-days" class="swal2-input" type="number" min="1" value="365" placeholder="Days of access">`,
    preConfirm: () => {
      const amount = parseFloat($('rp-amount').value), days = parseInt($('rp-days').value, 10);
      if (!(amount > 0) || !(days > 0)) { Swal.showValidationMessage('Enter an amount and the days of access.'); return false; }
      return { id: $('rp-school').value, amount, days, method: $('rp-method').value, reference: $('rp-ref').value.trim() };
    }
  });
  if (!r.isConfirmed) return;
  const p = r.value, s = SCHOOLS.find(x => x.id === p.id), now = Date.now();
  const until = Timestamp.fromMillis(Math.max(ms(s.paidUntil), now) + p.days * DAY);   // paying early extends from the current end date
  try {
    const b = writeBatch(db);
    b.set(doc(collection(db, 'payments')), {
      schoolId: s.id, schoolName: s.school || '', adminName: s.username || '', email: s.email || '',
      amount: p.amount, method: p.method, reference: p.reference, days: p.days,
      paidAt: Timestamp.now(), paidUntil: until, recordedBy: auth.currentUser.uid
    });
    b.update(doc(db, 'teachers', s.id), { paid: true, paidAt: Timestamp.now(), paidUntil: until });
    await b.commit();
    Swal.fire({ icon: 'success', title: 'Payment saved', timer: 1600, showConfirmButton: false });
  } catch (e) {
    Swal.fire({ icon: 'error', title: 'Could not save', text: e.code === 'permission-denied' ? 'Permission denied. Publish the updated Firestore rules (payments collection).' : e.message });
  }
}

async function revokeAccess(id) {
  const s = SCHOOLS.find(x => x.id === id); if (!s) return;
  const r = await Swal.fire({ title: 'Revoke access?', text: `${s.school || s.username} will be marked unpaid.`, showCancelButton: true, confirmButtonText: 'Revoke', confirmButtonColor: '#e53935' });
  if (!r.isConfirmed) return;
  try { await updateDoc(doc(db, 'teachers', id), { paid: false }); }
  catch (e) { Swal.fire({ icon: 'error', title: 'Could not update', text: e.message }); }
}

/* ---------------- CSV ---------------- */
function exportCsv(kind) {
  const school = id => (SCHOOLS.find(s => s.id === id) || {}).school || '';
  const sets = {
    schools:  [['School', 'Admin', 'Category', 'Email', 'Students', 'Access', 'Joined'],
      ...SCHOOLS.map(s => [s.school, s.username, s.category, s.email, STUDENTS.filter(x => x.teacherId === s.id).length, access(s).label, day(s.createdAt)])],
    students: [['Username', 'Email', 'School', 'Status', 'Total Score', 'Joined'],
      ...STUDENTS.map(s => [s.username, s.email, school(s.teacherId), s.status || 'active', s.totalScore ?? '', day(joined(s))])],
    payments: [['Date', 'School', 'Amount (PHP)', 'Method', 'Reference', 'Access Until'],
      ...PAYMENTS.map(p => [day(p.paidAt), p.schoolName, p.amount, p.method, p.reference, day(p.paidUntil)])]
  };
  const safe = v => { v = String(v ?? ''); return /^[=+\-@\t\r]/.test(v) ? "'" + v : v; };   // stops spreadsheet formula injection
  const text = sets[kind].map(r => r.map(v => '"' + safe(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + text], { type: 'text/csv' }));
  a.download = `laro-tayo-${kind}-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click(); URL.revokeObjectURL(a.href);
}
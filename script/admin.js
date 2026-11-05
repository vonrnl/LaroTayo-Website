import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  collection, doc, getDoc, onSnapshot, query, orderBy,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";
import { auth, db, escapeHtml as esc, initPasswordForm, initLogout } from "./shared.js";

/* WEBSITE ADMIN PANEL: schools, payments, reports. Owner only (teachers/{uid}.role === 'admin'). */

const $ = id => document.getElementById(id);
const TITLES = { dashboard: 'Dashboard', schools: 'Schools', payments: 'Payments', reports: 'Reports', settings: 'Settings' };
let SCHOOLS = [], STUDENTS = [], PAYMENTS = [], paymentsFailed = false;

const ms   = t => !t ? 0 : t.toMillis ? t.toMillis() : (new Date(t).getTime() || 0);
const day  = t => ms(t) ? new Date(ms(t)).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '—';
const peso = n => '₱' + Number(n || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const none = (cols, msg) => `<tr><td colspan="${cols}" class="sa-empty">${msg}</td></tr>`;
const joined = x => ms(x.createdAt) || ms(x.joined);

function access(s) {
  return s.paid ? { k: 'on', label: 'Paid' } : { k: 'off', label: 'Unpaid' };   // one-time fee, no expiry
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
  const counts = {};
  STUDENTS.forEach(s => { if (s.teacherId) counts[s.teacherId] = (counts[s.teacherId] || 0) + 1; });
  const sorted = [...SCHOOLS].sort((a, b) => joined(b) - joined(a));
  const paid = SCHOOLS.filter(s => access(s).k === 'on').length;
  const revenue = PAYMENTS.reduce((t, p) => t + (Number(p.amount) || 0), 0);

  $('nav-school-count').textContent = SCHOOLS.length;
  $('st-schools').textContent = SCHOOLS.length;
  $('st-paid').textContent = paid;
  $('st-students').textContent = STUDENTS.length;

  $('dash-schools').innerHTML = sorted.slice(0, 5).map(s =>
    `<tr><td>${esc(s.school || '—')}</td><td>${esc(s.username || '—')}</td><td>${day(s.createdAt)}</td></tr>`).join('') || none(3, 'No schools yet.');
  $('dash-payments').innerHTML = PAYMENTS.slice(0, 5).map(p =>
    `<tr><td>${esc(p.schoolName || '—')}</td><td>${peso(p.amount)}</td><td>${day(p.paidAt)}</td></tr>`).join('') || none(3, 'No payments yet.');

  renderSchools(sorted, counts);

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
}
import { initializeApp, getApps, getApp, deleteApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, deleteUser, updatePassword,
  reauthenticateWithCredential, EmailAuthProvider, signOut,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, serverTimestamp,
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

/* Shared by admin.js (website owner) and school-admin.js (school admins). */

export const firebaseConfig = {
  apiKey:            "AIzaSyDtB1ouns3wY1ljekvHm8h-_V_ChAcNjJw",
  authDomain:        "bestinthesis-ef4e4.firebaseapp.com",
  projectId:         "bestinthesis-ef4e4",
  storageBucket:     "bestinthesis-ef4e4.firebasestorage.app",
  messagingSenderId: "774078773253",
  appId:             "1:774078773253:web:28a0345c51393e9d9e046c",
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db   = getFirestore(app);

/* ---- helpers ---- */
export function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

export function formatDate(dateStr) {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

// Sort key: 'joined' date string first, then 'createdAt' timestamp, else 0 (still listed, at the bottom)
export function sortableTime(r) {
  if (r.joined) { const t = new Date(r.joined).getTime(); if (!isNaN(t)) return t; }
  if (r.createdAt && typeof r.createdAt.toMillis === 'function') return r.createdAt.toMillis();
  return 0;
}

/* ============================================================
   CREATE A STUDENT (login + profile) WITHOUT SIGNING THE ADMIN OUT
   ------------------------------------------------------------
   createUserWithEmailAndPassword() signs the browser in as the new
   account, so it runs on a short-lived second Firebase app. If the
   Firestore profile can't be saved, the new login is deleted again so
   the email isn't left "already registered" with no student record.
   ============================================================ */
export async function createStudentAccount({ username, email, password, extra = {} }) {
  const secondaryApp  = initializeApp(firebaseConfig, `secondary-${Date.now()}`);
  const secondaryAuth = getAuth(secondaryApp);
  try {
    const newUser = (await createUserWithEmailAndPassword(secondaryAuth, email, password)).user;
    try {
      await setDoc(doc(db, 'students', newUser.uid), {
        uid: newUser.uid, username, email,
        usernameLower: username.toLowerCase(),
        joined:    new Date().toISOString().split('T')[0],
        status:    'active',
        createdAt: serverTimestamp(),
        ...extra,
      });
    } catch (err) {
      try { await deleteUser(newUser); } catch (_) { /* nothing more we can do */ }
      throw err;
    }
    return newUser.uid;
  } finally {
    try { await signOut(secondaryAuth); } catch (_) {}
    await deleteApp(secondaryApp);
  }
}

/* ============================================================
   PASSWORD FORM + LOGOUT (same element ids on both panels)
   ============================================================ */
export function initPasswordForm() {
  const btn = document.getElementById('change-pass-btn');
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const cur  = document.getElementById('cur-pass').value;
    const nw   = document.getElementById('new-pass').value;
    const conf = document.getElementById('conf-pass').value;
    const warn = (title, text, color = '#e53935') => Swal.fire({ title, text, confirmButtonColor: color });

    if (!cur || !nw || !conf) { warn('Incomplete', 'Please fill in all password fields.', '#F4A234'); return; }
    if (nw !== conf)          { warn('Mismatch', 'New passwords do not match.'); return; }
    if (nw.length < 6)        { warn('Too Short', 'Password must be at least 6 characters.'); return; }

    btn.disabled = true;
    btn.textContent = 'Updating...';
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, cur));
      await updatePassword(user, nw);
      Swal.fire({ title: 'Password Updated', text: 'Your password has been changed.', timer: 2000, showConfirmButton: false });
      ['cur-pass', 'new-pass', 'conf-pass'].forEach(id => document.getElementById(id).value = '');
    } catch (err) {
      const msgs = {
        'auth/wrong-password':        'Your current password is incorrect.',
        'auth/invalid-credential':    'Your current password is incorrect.',
        'auth/weak-password':         'New password must be at least 6 characters.',
        'auth/requires-recent-login': 'Please log out and back in, then try again.',
      };
      warn('Error', msgs[err.code] || err.message);
    } finally {
      btn.disabled = false;
      btn.textContent = 'Update Password';
    }
  });
}

export function initLogout(buttonId) {
  const btn = document.getElementById(buttonId);
  if (!btn) return;
  btn.addEventListener('click', async () => {
    const r = await Swal.fire({
      title: 'Logout?', text: 'Are you sure you want to sign out?',
      showCancelButton: true, confirmButtonText: 'Yes, logout', cancelButtonText: 'Cancel',
      confirmButtonColor: '#1A3A5C', cancelButtonColor: '#6A8AA0',
    });
    if (r.isConfirmed) { await signOut(auth); window.location.href = 'index.html'; }
  });
}

/* ============================================================
   STUDENT PROGRESS POPUP (story + badges)
   ============================================================ */
const STORY_CHAPTERS = [
  { id: 1, title: 'Hulihin ang Biik' },
  { id: 2, title: 'Sipa' },
  { id: 3, title: 'Palosebo' },
  { id: 4, title: 'Luksong Baka' },
];

// Same badges as the student dashboard (dashboard.js).
// Sipa / Hulihin ang Biik / Luksong Baka are saved by Unity in
// students/{uid}/achievements/{id}. 'Story Complete' is worked
// out from the story saves (all chapters completed).
const ACHIEVEMENTS = [
  { id:'sipa',              title:'Sipa',              desc:'Unlocked by completing the Sipa stage.',
    detail:(d)    => `Best score: ${num(d && d.bestScore)}` },
  { id:'hulihin_ang_baboy', title:'Hulihin ang Biik', desc:'Unlocked by completing the Hulihin ang Biik stage.',
    detail:(d)    => `Best time: ${getBestTime(d)}` },
  { id:'luksong_baka',      title:'Luksong Baka',      desc:'Unlocked by completing the Luksong Baka stage.',
    detail:(d)    => `Best score: ${num(d && d.bestScore)} - Best level: ${num(d && d.bestLevel)}` },
  { id:'story_complete',    title:'Story Complete',  desc:'Unlocked by completing all story chapters.',
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

export function initProgressModal() {
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

export async function openProgressModal(student) {
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
    safe('student stats',  () => getDoc(doc(db, 'students', student.id))),
    safe('story saves',    () => getDocs(collection(db, 'students', student.id, 'storySaves'))),
    safe('friends',        () => getDocs(collection(db, 'students', student.id, 'friends'))),
    safe('badges',         () => getDocs(collection(db, 'students', student.id, 'achievements'))),
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
        <span class="pg-row-title">Chapter ${ch.id}: ${escapeHtml(ch.title)}</span>
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
        <span class="pg-row-title">${escapeHtml(a.title)}</span>
        <div class="pg-row-meta">${escapeHtml(a.desc)}</div>
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

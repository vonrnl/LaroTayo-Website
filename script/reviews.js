// ---- GAME RATINGS + COMMENTS (Firestore): sign in to rate and comment ----
// IMPORTANT: set FIREBASE_VERSION to the SAME version number used in the
// import URLs inside login.js, so this file shares the app login.js created.
const FIREBASE_VERSION = '11.0.0';
const MAX_COMMENT = 300;
const PAGE_SIZE = 6;
// Same three avatars as the student dashboard (dashboard.js).
const AVATARS = {
  bata: 'img/avatar-bata.png', lolo: 'img/avatar-lolo.png', libro: 'img/avatar-libro.png',
  maria: 'img/avatar-maria.png',
  miguel: 'img/avatar-miguel.png',
  pedro: 'img/avatar-pedro.png',
  robert: 'img/avatar-robert.png',
  jose: 'img/avatar-jose.png',
  juan: 'img/avatar-juan.png',
  lisa: 'img/avatar-lisa.png',
  thomas: 'img/avatar-thomas.png'
};

const base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
const countEl = document.getElementById('rev-count');

function stars(n) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += '<span class="' + (i <= Math.round(n) ? '' : 'off') + '">\u2605</span>';
  return s;
}
function esc(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function showMessage(msg) {
  if (countEl) countEl.textContent = msg;
}
function toMs(t) {
  return t && typeof t.toMillis === 'function' ? t.toMillis() : 0;
}
function niceDate(ms) {
  return ms ? new Date(ms).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : '';
}

(async function () {
  if (!countEl) return;

  let fb;
  try {
    const [app, auth, fs] = await Promise.all([
      import(base + 'firebase-app.js'),
      import(base + 'firebase-auth.js'),
      import(base + 'firebase-firestore.js')
    ]);
    fb = { ...app, ...auth, ...fs };
  } catch (e) {
    showMessage('Ratings could not be loaded.');
    return;
  }

  if (!fb.getApps().length) {
    showMessage('Ratings could not be loaded. Check FIREBASE_VERSION in reviews.js.');
    return;
  }

  const app  = fb.getApp();
  const auth = fb.getAuth(app);
  const db   = fb.getFirestore(app);

  const guestBox  = document.getElementById('rev-guest');
  const form      = document.getElementById('rev-form');
  const errEl     = document.getElementById('rev-err');
  const submit    = document.getElementById('rev-submit');
  const picker    = document.getElementById('rev-picker');
  const commentEl = document.getElementById('rev-comment');
  const charsEl   = document.getElementById('rev-chars');
  const listEl    = document.getElementById('rev-list');
  const moreBtn   = document.getElementById('rev-more');

  let user = null;
  let myName = 'Player';
  let myAvatar = '';
  let ratings = [];
  let chosen = 0;
  let shown = PAGE_SIZE;

  // ---- star picker ----
  const paint = n => picker.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v <= n));
  picker.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { chosen = +b.dataset.v; paint(chosen); form.dataset.touched = '1'; });
    b.addEventListener('mouseenter', () => paint(+b.dataset.v));
  });
  picker.addEventListener('mouseleave', () => paint(chosen));

  // ---- comment box counter ----
  commentEl.addEventListener('input', () => {
    charsEl.textContent = commentEl.value.length;
    form.dataset.touched = '1';
  });

  // ---- summary: average, stars, count ----
  function renderSummary() {
    const total = ratings.length;
    const avg = total ? ratings.reduce((a, r) => a + r.rating, 0) / total : 0;
    document.getElementById('rev-avg').textContent = avg.toFixed(1);
    document.getElementById('rev-avg-stars').innerHTML = stars(avg);
    countEl.textContent = total + (total === 1 ? ' rating' : ' ratings');
  }

  // ---- comment list (newest first, only ratings that have a comment) ----
  function renderList() {
    const withText = ratings
      .filter(r => r.comment)
      .sort((a, b) => b.time - a.time);

    if (!withText.length) {
      listEl.innerHTML = '<p class="rev-empty">No comments yet. Be the first to share what you think!</p>';
      moreBtn.hidden = true;
      return;
    }

    listEl.innerHTML = withText.slice(0, shown).map(r => {
      const name = r.name || 'Player';
      return '<article class="rev-item">' +
        '<div class="rev-item-head">' +
          (r.avatar
            ? '<span class="rev-item-avatar has-img"><img src="' + AVATARS[r.avatar] + '" alt=""></span>'
            : '<span class="rev-item-avatar" aria-hidden="true">' + esc(name.charAt(0).toUpperCase()) + '</span>') +
          '<div><span class="rev-item-name">' + esc(name) + '</span>' +
          '<span class="rev-item-date">' + esc(niceDate(r.time)) + '</span></div>' +
          '<span class="rev-item-stars" aria-label="' + r.rating + ' out of 5 stars">' + stars(r.rating) + '</span>' +
        '</div>' +
        '<p class="rev-item-text">' + esc(r.comment) + '</p>' +
      '</article>';
    }).join('');

    moreBtn.hidden = withText.length <= shown;
  }

  moreBtn.addEventListener('click', () => { shown += PAGE_SIZE; renderList(); });

  // ---- live ratings (everyone can see the totals and comments) ----
  fb.onSnapshot(
    fb.collection(db, 'reviews'),
    snap => {
      ratings = snap.docs.map(d => {
        const x = d.data();
        return {
          id: d.id,
          rating: Number(x.rating) || 0,
          comment: typeof x.text === 'string' ? x.text.trim() : '',
          name: typeof x.name === 'string' ? x.name : '',
          avatar: typeof x.avatar === 'string' && AVATARS[x.avatar] ? x.avatar : '',
          time: toMs(x.updatedAt) || toMs(x.createdAt)
        };
      }).filter(r => r.rating >= 1 && r.rating <= 5);
      renderSummary();
      renderList();
      fillMine();
    },
    () => showMessage('Ratings could not be loaded.')
  );

  // pre-select the user's existing rating + comment (one per user)
  function fillMine() {
    if (!user || form.dataset.touched) return;
    const mine = ratings.find(r => r.id === user.uid);
    if (mine) {
      chosen = mine.rating;
      paint(chosen);
      commentEl.value = mine.comment;
      charsEl.textContent = mine.comment.length;
      submit.textContent = 'Update Rating';
    }
  }

  // find the display name + avatar: student account first, then school admin
  async function loadProfile(u) {
    try {
      for (const col of ['students', 'teachers']) {
        const snap = await fb.getDoc(fb.doc(db, col, u.uid));
        if (snap.exists() && snap.data().username) {
          const d = snap.data();
          return {
            name: String(d.username).slice(0, 40),
            // students with no saved choice use the dashboard default ("bata"); school admins have none
            avatar: col === 'students' ? (typeof d.avatar === 'string' && AVATARS[d.avatar] ? d.avatar : 'bata') : ''
          };
        }
      }
    } catch (_) { /* fall through */ }
    return { name: (u.email ? u.email.split('@')[0] : 'Player').slice(0, 40), avatar: '' };
  }

  // ---- sign-in state: show the sign-in button or the form ----
  fb.onAuthStateChanged(auth, async u => {
    user = u;
    guestBox.hidden = !!u;
    form.hidden = !u;
    if (u) {
      delete form.dataset.touched;
      const p = await loadProfile(u);
      myName = p.name;
      myAvatar = p.avatar;
      fillMine();
      syncMyReview();
    }
  });

  // keep the user's saved review in step with their current name + avatar
  // (the review stores a copy of the avatar, so it goes stale when it is changed in the dashboard)
  async function syncMyReview() {
    try {
      const ref = fb.doc(db, 'reviews', user.uid);
      const snap = await fb.getDoc(ref);
      if (!snap.exists()) return;
      const d = snap.data();
      const changes = {};
      if (myAvatar && d.avatar !== myAvatar) changes.avatar = myAvatar;
      if (myName && d.name !== myName) changes.name = myName;
      if (Object.keys(changes).length) await fb.updateDoc(ref, changes);
    } catch (_) { /* rules may block it; the next submit will still save the new avatar */ }
  }

  // ---- submit ----
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!user) return;
    if (!chosen) { errEl.textContent = 'Please pick a star rating.'; return; }
    const comment = commentEl.value.trim().slice(0, MAX_COMMENT);
    errEl.textContent = '';
    submit.disabled = true;

    const existing = ratings.find(r => r.id === user.uid);
    try {
      const ref = fb.doc(db, 'reviews', user.uid);
      const old = existing ? await fb.getDoc(ref) : null;
      const payload = {
        uid: user.uid,
        rating: chosen,
        text: comment,
        name: myName,
        createdAt: old && old.exists() && old.data().createdAt ? old.data().createdAt : fb.serverTimestamp(),
        updatedAt: fb.serverTimestamp()
      };
      if (myAvatar) payload.avatar = myAvatar;
      await fb.setDoc(ref, payload);
      delete form.dataset.touched;
      if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'success', title: 'Thank you!', text: 'Your rating has been saved.', confirmButtonText: 'Got it!' });
      }
    } catch (err) {
      errEl.textContent = 'Could not save your rating. Please try again.';
    }
    submit.disabled = false;
  });
})();
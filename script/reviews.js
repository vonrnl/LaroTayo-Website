// ---- GAME RATINGS (Firestore): stars only, sign in to rate ----
// IMPORTANT: set FIREBASE_VERSION to the SAME version number used in the
// import URLs inside login.js, so this file shares the app login.js created.
const FIREBASE_VERSION = '11.0.0';

const base = 'https://www.gstatic.com/firebasejs/' + FIREBASE_VERSION + '/';
const countEl = document.getElementById('rev-count');

function stars(n) {
  let s = '';
  for (let i = 1; i <= 5; i++) s += '<span class="' + (i <= Math.round(n) ? '' : 'off') + '">\u2605</span>';
  return s;
}
function showMessage(msg) {
  if (countEl) countEl.textContent = msg;
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

  const guestBox = document.getElementById('rev-guest');
  const form     = document.getElementById('rev-form');
  const errEl    = document.getElementById('rev-err');
  const submit   = document.getElementById('rev-submit');
  const picker   = document.getElementById('rev-picker');

  let user = null;
  let ratings = [];
  let chosen = 0;

  // ---- star picker ----
  const paint = n => picker.querySelectorAll('button').forEach(b => b.classList.toggle('on', +b.dataset.v <= n));
  picker.querySelectorAll('button').forEach(b => {
    b.addEventListener('click', () => { chosen = +b.dataset.v; paint(chosen); form.dataset.touched = '1'; });
    b.addEventListener('mouseenter', () => paint(+b.dataset.v));
  });
  picker.addEventListener('mouseleave', () => paint(chosen));

  // ---- summary: average, stars, count ----
  function render() {
    const total = ratings.length;
    const avg = total ? ratings.reduce((a, r) => a + r.rating, 0) / total : 0;
    document.getElementById('rev-avg').textContent = avg.toFixed(1);
    document.getElementById('rev-avg-stars').innerHTML = stars(avg);
    countEl.textContent = total + (total === 1 ? ' rating' : ' ratings');

  }

  // ---- live ratings (everyone can see the totals) ----
  fb.onSnapshot(
    fb.collection(db, 'reviews'),
    snap => {
      ratings = snap.docs.map(d => ({ id: d.id, rating: Number(d.data().rating) || 0 })).filter(r => r.rating >= 1 && r.rating <= 5);
      render();
      fillMine();
    },
    () => showMessage('Ratings could not be loaded.')
  );

  // pre-select the user's existing rating (one rating per user)
  function fillMine() {
    if (!user || form.dataset.touched) return;
    const mine = ratings.find(r => r.id === user.uid);
    if (mine) {
      chosen = mine.rating;
      paint(chosen);
      submit.textContent = 'Update Rating';
    }
  }

  // ---- sign-in state: show the sign-in button or the star picker ----
  fb.onAuthStateChanged(auth, u => {
    user = u;
    guestBox.hidden = !!u;
    form.hidden = !u;
    if (u) { delete form.dataset.touched; fillMine(); }
  });

  // ---- submit ----
  form.addEventListener('submit', async e => {
    e.preventDefault();
    if (!user) return;
    if (!chosen) { errEl.textContent = 'Please pick a star rating.'; return; }
    errEl.textContent = '';
    submit.disabled = true;

    const existing = ratings.find(r => r.id === user.uid);
    try {
      // Only the star rating is saved: no name, no comment.
      const ref = fb.doc(db, 'reviews', user.uid);
      const old = existing ? await fb.getDoc(ref) : null;
      await fb.setDoc(ref, {
        uid: user.uid,
        rating: chosen,
        createdAt: old && old.exists() && old.data().createdAt ? old.data().createdAt : fb.serverTimestamp(),
        updatedAt: fb.serverTimestamp()
      });
      if (typeof Swal !== 'undefined') {
        Swal.fire({ icon: 'success', title: 'Thank you!', text: 'Your rating has been saved.', confirmButtonText: 'Got it!' });
      }
    } catch (err) {
      errEl.textContent = 'Could not save your rating. Please try again.';
    }
    submit.disabled = false;
  });
})();
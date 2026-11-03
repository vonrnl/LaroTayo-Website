import { initializeApp, getApps, getApp } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js";
import {
  getFirestore, doc, getDoc, setDoc, deleteDoc,
  collection, query, where, limit, getDocs, getCountFromServer, onSnapshot, serverTimestamp
} from "https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDtB1ouns3wY1ljekvHm8h-_V_ChAcNjJw",
  authDomain: "bestinthesis-ef4e4.firebaseapp.com",
  projectId: "bestinthesis-ef4e4",
  storageBucket: "bestinthesis-ef4e4.firebasestorage.app",
  messagingSenderId: "774078773253",
  appId: "1:774078773253:web:28a0345c51393e9d9e046c"
};

// Reuse existing Firebase app if already initialized (avoids duplicate app error)
const app = getApps().length ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// DATE
document.getElementById('dash-date').textContent = new Date().toLocaleDateString('en-PH',{weekday:'long',year:'numeric',month:'long',day:'numeric'});

/* ============================================================
   AVATARS — only three choices
   ============================================================ */
const AVATARS = {
  bata:  { label: 'Kid',       src: 'img/avatar-bata.png'  },
  lolo:  { label: 'Mang Tomas', src: 'img/avatar-lolo.png'  },
  libro: { label: 'Book',      src: 'img/avatar-libro.png' }
};
const DEFAULT_AVATAR = 'bata';

// Accepts a new id ('bata'), or an old emoji / anything unknown -> falls back to default
function resolveAvatar(value){
  return (typeof value === 'string' && AVATARS[value]) ? value : DEFAULT_AVATAR;
}
function avatarSrc(value){ return AVATARS[resolveAvatar(value)].src; }

let selectedAvatar = DEFAULT_AVATAR;

function applyAvatar(id){
  const src = avatarSrc(id);
  ['dash-avatar','dash-avatar-mobile','dash-header-avatar','dash-hero-avatar','ep-avatar-preview'].forEach(elId=>{
    const el = document.getElementById(elId);
    if (el) el.src = src;
  });
  // highlight the matching option in the modal
  document.querySelectorAll('.ep-avatar-opt').forEach(b=>{
    b.classList.toggle('selected', b.dataset.avatar === resolveAvatar(id));
  });
}

/* ============================================================
   HELPERS
   ============================================================ */
function escapeHtml(str){
  return String(str).replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  }[c]));
}

// number that comes straight from Firestore — no sample fallback
function num(v){ return typeof v === 'number' && isFinite(v) ? v : 0; }

// Bio: shows it on the dashboard and fills the Edit Profile box
function updateBioCount(){
  const input   = document.getElementById('ep-bio');
  const counter = document.getElementById('ep-bio-count');
  if (input && counter) counter.textContent = `${input.value.length}/${input.maxLength}`;
}

function showBio(text){
  const bioEl = document.getElementById('dash-bio');
  if (bioEl){ bioEl.textContent = text; bioEl.hidden = !text; }
  const input = document.getElementById('ep-bio');
  if (input){ input.value = text; updateBioCount(); }
}

/* ============================================================
   STORY PROGRESS
   ============================================================ */
// Matches the real story flow in Unity's StoryProgressManager.cs:
// completedStage 0 = nothing done, 1 = Hulihin ang Biik done,
// 2 = Sipa done, 3 = Palosebo done, 4 = Luksong Baka done (all done).
const STORY_CHAPTERS = [
  { id: 1, title: 'Hulihin ang Biik', blurb: 'Chase and catch the running pigs.' },
  { id: 2, title: 'Sipa',              blurb: 'Keep the sipa in the air for as long as you can.' },
  { id: 3, title: 'Palosebo',          blurb: 'Climb the slippery pole to win the prize.' },
  { id: 4, title: 'Luksong Baka',      blurb: 'Jump over the tallest cow in the village.' },
];

function renderStory(completed, started){
  const total = STORY_CHAPTERS.length;
  const done  = Math.max(0, Math.min(completed, total));
  const pct   = Math.round((done / total) * 100);

  document.getElementById('story-percent').textContent = `${pct}%`;
  document.getElementById('story-subtitle').textContent = `${done} of ${total} chapters completed`;
  setTimeout(()=>{ document.getElementById('story-bar').style.width = `${pct}%`; }, 300);

  document.getElementById('chapter-list').innerHTML = STORY_CHAPTERS.map(ch => {
    let state = 'locked', badge = 'Locked';
    if (ch.id <= done)        { state = 'done';    badge = 'Completed'; }
    else if (ch.id === done+1){ state = 'current'; badge = started ? 'In progress' : 'Not started'; }
    return `<div class="chapter-card ${state}">
      <span class="chapter-num">Ch. ${ch.id}</span>
      <div class="chapter-info">
        <h4>${escapeHtml(ch.title)}</h4>
        <p>${state === 'locked' ? 'Complete the previous chapter first.' : escapeHtml(ch.blurb)}</p>
      </div>
      <span class="chapter-badge ${state === 'current' ? 'locked' : state}">
        ${badge}
      </span>
    </div>`;
  }).join('');
}

/* ============================================================
   PLAYER ACHIEVEMENTS
   Sipa / Hulihin ang Biik / Luksong Baka are saved by Unity in
   students/{uid}/achievements/{id}. 'Story Complete' comes from the
   story saves, so it needs no Firestore document.
   ============================================================ */
const ACHIEVEMENTS = [
  { id: 'sipa',              title: 'Sipa',             desc: 'Unlocked by completing the Sipa stage.' },
  { id: 'hulihin_ang_baboy', title: 'Hulihin ang Biik', desc: 'Unlocked by completing the Hulihin ang Biik stage.' },
  { id: 'luksong_baka',      title: 'Luksong Baka',     desc: 'Unlocked by completing the Luksong Baka stage.' },
  { id: 'story_complete',    title: 'Story Complete',   desc: 'Unlocked by completing all story chapters.', stage: STORY_CHAPTERS.length }
];

function formatAchievementTime(ms) {
  if (typeof ms !== 'number' || !isFinite(ms)) return '--:--.---';
  const t = Math.max(0, Math.round(ms));
  return String(Math.floor(t / 60000)).padStart(2, '0') + ':' +
         String(Math.floor((t % 60000) / 1000)).padStart(2, '0') + '.' +
         String(t % 1000).padStart(3, '0');
}

function getBestTime(data) {
  if (!data) return '--:--.---';
  if (typeof data.bestTimeDisplay === 'string' && data.bestTimeDisplay.trim() !== '') return data.bestTimeDisplay.trim();
  return formatAchievementTime(data.bestTimeMs);
}

function resultBlock(label, value, small = '', extraClass = '') {
  return `<div class="ach-result ${extraClass}">
    <span class="ach-result-label">${label}</span>
    <strong class="ach-result-value">${escapeHtml(value)}</strong>
    ${small ? `<span class="ach-result-small">${escapeHtml(small)}</span>` : ''}
  </div>`;
}

function renderAchievements(achievementData, chaptersCompleted = 0) {
  const grid = document.getElementById('ach-grid');
  if (!grid) return;

  let unlockedCount = 0;
  grid.innerHTML = ACHIEVEMENTS.map(a => {
    const data = achievementData.get(a.id);
    // Luksong Baka needs a real win (Unity also saves failed runs with completed = false).
    // Other Unity badges: a document that isn't marked unlocked:false. Story badge: chapters.
    const unlocked = a.stage
      ? chaptersCompleted >= a.stage
      : !!data && (a.id === 'luksong_baka' ? data.completed === true : data.unlocked !== false);
    if (unlocked) unlockedCount++;

    let extra = '';
    if (unlocked) {
      if (a.id === 'hulihin_ang_baboy') extra = resultBlock('Best Time', getBestTime(data), '', 'ach-time-result');
      else if (a.id === 'sipa')         extra = resultBlock('Best Score', String(num(data.bestScore)));
      else if (a.id === 'luksong_baka') extra = resultBlock('Best Score', String(num(data.bestScore)), `Best Level: ${num(data.bestLevel)}`);
      else if (a.stage)                 extra = resultBlock('Story Progress', `${Math.min(chaptersCompleted, STORY_CHAPTERS.length)}/${STORY_CHAPTERS.length}`, 'chapters completed');
    }

    return `<div class="ach-card ${unlocked ? 'unlocked' : 'locked'}">
      <h4>${escapeHtml(a.title)}</h4>
      <p>${escapeHtml(a.desc)}</p>
      ${extra}
      <span class="ach-status">${unlocked ? 'Unlocked' : 'Locked'}</span>
    </div>`;
  }).join('');

  const countText = document.getElementById('ach-count');
  if (countText) countText.textContent = `${unlockedCount} of ${ACHIEVEMENTS.length} badges unlocked`;
}

async function loadAchievements(uid, chaptersCompleted = 0) {
  const achievementData = new Map();
  try {
    const snap = await getDocs(collection(db, 'students', uid, 'achievements'));
    snap.forEach(d => achievementData.set(d.id, d.data()));
  } catch (error) {
    console.error('Could not read achievements:', error);
  }
  renderAchievements(achievementData, chaptersCompleted);
}

/* ============================================================
   LEADERBOARD RANK
   All-time rank by totalScore. Counts the students with a higher
   score on the server instead of downloading every student document.
   (There is no weekly-score field yet, so this is not a weekly rank.)
   ============================================================ */
async function loadRank(myScore){
  const pill = document.getElementById('rank-pill');
  const text = document.getElementById('rank-pill-text');
  if (typeof myScore !== 'number' || !isFinite(myScore)){ pill.hidden = true; return; }
  try{
    const higher = await getCountFromServer(query(collection(db,'students'), where('totalScore','>', myScore)));
    const rank = higher.data().count + 1;
    text.textContent = rank === 1 ? `You're #1 overall!` : `You're #${rank} overall`;
    pill.hidden = false;
  }catch(err){
    console.error('loadRank:', err);
    pill.hidden = true;
  }
}

/* ============================================================
   FRIENDS
   Firestore layout:
     students/{uid}                        -> username, usernameLower, avatar, email
     students/{uid}/friends/{friendUid}    -> { uid, username, avatar, since }
     friendRequests/{fromUid}__{toUid}  -> { from, to, fromName, fromAvatar, status }
   ============================================================ */
let me = null;                       // { uid, username, avatar }
const friendUids   = new Set();      // people I'm already friends with
const outgoingUids = new Set();      // requests I sent that are still pending
const incomingUids = new Set();      // requests waiting for me
let lastResults = [];                // last search results, so we can re-render on state change

function friendState(uid){
  if (friendUids.has(uid))   return 'friend';
  if (outgoingUids.has(uid)) return 'sent';
  if (incomingUids.has(uid)) return 'incoming';
  return 'none';
}

/* ---- search ---- */
async function searchUsers(term){
  const box = document.getElementById('fr-results');
  const q = term.trim().toLowerCase();

  if(!q){ box.innerHTML = ''; lastResults = []; return; }

  box.innerHTML = '<p class="fr-empty">Naghahanap…</p>';

  try{
    // Usernames that START with the search text (case-insensitive), 10 at most.
    // Needs the 'usernameLower' field, which the dashboard fills in on each login.
    const snap = await getDocs(query(
      collection(db,'students'),
      where('usernameLower','>=', q),
      where('usernameLower','<=', q + '\uf8ff'),
      limit(10)
    ));
    lastResults = snap.docs
      .map(d => ({ uid: d.id, ...d.data() }))
      .filter(u => u.uid !== me.uid)
      .sort((a, b) => (a.usernameLower || '').localeCompare(b.usernameLower || ''));
    renderResults();
  }catch(err){
    console.error('Search error:', err);
    box.innerHTML = `<p class="fr-empty">Hindi makapag-search.<br><code>${escapeHtml(err.code || err.message)}</code></p>`;
  }
}

function renderResults(){
  const box = document.getElementById('fr-results');
  if(!lastResults.length){
    box.innerHTML = '<p class="fr-empty">Walang nahanap na player na ganyan ang username.</p>';
    return;
  }

  box.innerHTML = lastResults.map(u => {
    const name  = escapeHtml(u.username || 'Player');
    const state = friendState(u.uid);
    let action;
    if (state === 'friend')        action = '<span class="fr-state friend">Friends</span>';
    else if (state === 'sent')     action = `<span class="fr-state pending">Request sent</span><button class="fr-btn ghost" data-act="cancel" data-uid="${u.uid}">Cancel</button>`;
    else if (state === 'incoming') action = `<button class="fr-btn accept" data-act="accept" data-uid="${u.uid}">Accept</button>`;
    else action = `<button class="fr-btn add" data-act="add" data-uid="${u.uid}" data-name="${name}">Add</button>`;

    return `<div class="fr-card">
      <img class="fr-avatar" src="${avatarSrc(u.avatar)}" alt="">
      <div class="fr-info"><h4>${name}</h4><p>Player</p></div>
      <div class="fr-actions">${action}</div>
    </div>`;
  }).join('');
}

/* ---- send a request ---- */
async function sendRequest(toUid, toName){
  try{
    await setDoc(doc(db,'friendRequests', `${me.uid}__${toUid}`), {
      from: me.uid,
      to: toUid,
      fromName: me.username,
      fromAvatar: me.avatar,
      status: 'pending',
      createdAt: serverTimestamp()
    });
    outgoingUids.add(toUid);
    renderResults();
    Swal.fire({title:'Request sent!', text:`Hinintay na lang natin si ${toName}.`, timer:1600, showConfirmButton:false});
  }catch(err){
    console.error('sendRequest:', err);
    Swal.fire({title:'Hindi naipadala', text:err.message, confirmButtonColor:'#e53935'});
  }
}

/* ---- accept / decline ---- */
async function acceptRequest(fromUid){
  try{
    const other = (await getDoc(doc(db,'students',fromUid))).data() || {};
    // add each other
    await setDoc(doc(db,'students',me.uid,'friends',fromUid), {
      uid: fromUid,
      username: other.username || 'Player',
      avatar: resolveAvatar(other.avatar),
      since: serverTimestamp()
    });
    await setDoc(doc(db,'students',fromUid,'friends',me.uid), {
      uid: me.uid,
      username: me.username,
      avatar: me.avatar,
      since: serverTimestamp()
    });
    await deleteDoc(doc(db,'friendRequests', `${fromUid}__${me.uid}`));
    Swal.fire({title:'Magkaibigan na kayo!', timer:1500, showConfirmButton:false});
  }catch(err){
    console.error('acceptRequest:', err);
    Swal.fire({title:'Hindi ma-accept', text:err.message, confirmButtonColor:'#e53935'});
  }
}

async function declineRequest(fromUid){
  try{ await deleteDoc(doc(db,'friendRequests', `${fromUid}__${me.uid}`)); }
  catch(err){ console.error('declineRequest:', err); }
}

// take back a request I sent that is still pending
async function cancelRequest(toUid){
  try{ await deleteDoc(doc(db,'friendRequests', `${me.uid}__${toUid}`)); }
  catch(err){
    console.error('cancelRequest:', err);
    Swal.fire({title:'Hindi ma-cancel', text:err.message, confirmButtonColor:'#e53935'});
  }
}

async function removeFriend(uid, name){
  const res = await Swal.fire({
    title:'Remove friend?', text:`Aalisin si ${name} sa friend list mo.`, 
    showCancelButton:true, confirmButtonText:'Yes, remove', confirmButtonColor:'#e53935'
  });
  if(!res.isConfirmed) return;
  try{
    await deleteDoc(doc(db,'students',me.uid,'friends',uid));
    await deleteDoc(doc(db,'students',uid,'friends',me.uid));

    // Also clear any leftover request between the two of you. Otherwise the
    // search keeps showing "Request sent" after you unfriend. Only delete the
    // ones we know exist (the listeners track them), because deleting a
    // document that isn't there is refused by the rules.
    try{
      if (outgoingUids.has(uid)) await deleteDoc(doc(db,'friendRequests', `${me.uid}__${uid}`));
      if (incomingUids.has(uid)) await deleteDoc(doc(db,'friendRequests', `${uid}__${me.uid}`));
    }catch(e){ console.error('removeFriend request cleanup:', e); }
  }catch(err){
    console.error('removeFriend:', err);
    Swal.fire({title:'Hindi maalis', text:err.message, confirmButtonColor:'#e53935'});
  }
}

/* ---- live lists ---- */
function watchFriends(){
  onSnapshot(collection(db,'students',me.uid,'friends'), snap=>{
    friendUids.clear();
    const list = [];
    snap.forEach(d=>{ friendUids.add(d.id); list.push({ uid:d.id, ...d.data() }); });

    document.getElementById('fr-friend-count').textContent = list.length;
    document.getElementById('fr-count').textContent =
      list.length === 1 ? '1 friend' : `${list.length} friends`;

    const box = document.getElementById('fr-friends');
    box.innerHTML = list.length
      ? list.map(f => {
          const name = escapeHtml(f.username || 'Player');
          return `<div class="fr-card">
            <img class="fr-avatar" src="${avatarSrc(f.avatar)}" alt="">
            <div class="fr-info"><h4>${name}</h4><p>Kaibigan</p></div>
            <div class="fr-actions">
              <button class="fr-btn danger" data-act="remove" data-uid="${f.uid}" data-name="${name}">
                Remove
              </button>
            </div>
          </div>`;
        }).join('')
      : '<p class="fr-empty">Add friends now!!</p>';

    renderResults();
  }, err => {
    console.error('friends listener:', err);
    document.getElementById('fr-friends').innerHTML =
      `<p class="fr-empty">Hindi mabasa ang friends.<br><code>${escapeHtml(err.code)}</code></p>`;
  });
}

function watchIncoming(){
  onSnapshot(query(collection(db,'friendRequests'), where('to','==', me.uid)), snap=>{
    incomingUids.clear();
    const list = [];
    snap.forEach(d=>{
      const r = d.data();
      if (r.status && r.status !== 'pending') return;
      incomingUids.add(r.from);
      list.push(r);
    });

    document.getElementById('fr-req-count').textContent = list.length;

    // red dot on the Add Friend button
    const badge = document.getElementById('fr-badge');
    badge.textContent = list.length;
    badge.hidden = list.length === 0;

    const box = document.getElementById('fr-requests');
    box.innerHTML = list.length
      ? list.map(r => {
          const name = escapeHtml(r.fromName || 'Player');
          return `<div class="fr-card">
            <img class="fr-avatar" src="${avatarSrc(r.fromAvatar)}" alt="">
            <div class="fr-info"><h4>${name}</h4><p>Gustong maging kaibigan mo</p></div>
            <div class="fr-actions">
              <button class="fr-btn accept" data-act="accept" data-uid="${r.from}">Accept</button>
              <button class="fr-btn ghost"  data-act="decline" data-uid="${r.from}">Decline</button>
            </div>
          </div>`;
        }).join('')
      : '<p class="fr-empty">Walang bagong request.</p>';

    renderResults();
  }, err => console.error('incoming listener:', err));
}

function watchOutgoing(){
  onSnapshot(query(collection(db,'friendRequests'), where('from','==', me.uid)), snap=>{
    outgoingUids.clear();
    snap.forEach(d=>{ const r = d.data(); if(!r.status || r.status === 'pending') outgoingUids.add(r.to); });
    renderResults();
  }, err => console.error('outgoing listener:', err));
}

/* ---- wire up the UI ---- */
const frOverlay = document.getElementById('fr-overlay');

document.getElementById('open-friends').addEventListener('click', ()=>{
  frOverlay.classList.add('open');
  setTimeout(()=> document.getElementById('fr-search-input').focus(), 250);
});
document.getElementById('fr-close').addEventListener('click', ()=> frOverlay.classList.remove('open'));
frOverlay.addEventListener('click', e=>{ if(e.target === frOverlay) frOverlay.classList.remove('open'); });
document.addEventListener('keydown', e=>{ if(e.key === 'Escape') frOverlay.classList.remove('open'); });

const searchInput = document.getElementById('fr-search-input');
document.getElementById('fr-search-btn').addEventListener('click', ()=> searchUsers(searchInput.value));
searchInput.addEventListener('keydown', e=>{ if(e.key === 'Enter') searchUsers(searchInput.value); });

let searchTimer;
searchInput.addEventListener('input', ()=>{
  clearTimeout(searchTimer);
  searchTimer = setTimeout(()=> searchUsers(searchInput.value), 400);
});

// one click handler for every friend button on the page
document.addEventListener('click', e=>{
  const btn = e.target.closest('[data-act]');
  if(!btn || !me) return;
  const uid  = btn.dataset.uid;
  const name = btn.dataset.name || 'Player';
  if (btn.dataset.act === 'add')     sendRequest(uid, name);
  if (btn.dataset.act === 'accept')  acceptRequest(uid);
  if (btn.dataset.act === 'decline') declineRequest(uid);
  if (btn.dataset.act === 'cancel')  cancelRequest(uid);
  if (btn.dataset.act === 'remove')  removeFriend(uid, name);
});

/* ============================================================
   MAIN
   ============================================================ */
onAuthStateChanged(auth, async (user) => {
  if(!user){ window.location.href='index.html'; return; }
  try{
    const userRef  = doc(db,'students',user.uid);
    const userSnap = await getDoc(userRef);
    const u = userSnap.exists() ? userSnap.data() : {};

    const name  = u.username || user.displayName || 'Player';
    const email = u.email || user.email || '';

    selectedAvatar = resolveAvatar(u.avatar);
    applyAvatar(selectedAvatar);

    me = { uid: user.uid, username: name, avatar: selectedAvatar };

    document.getElementById('dash-name').textContent = name;
    document.getElementById('dash-header-name').textContent = name;

    // bio (saved on the student document; hidden when empty)
    showBio((typeof u.bio === 'string' ? u.bio : '').trim());
    document.getElementById('ep-nickname').value = name;

    // make sure this account is findable by search (lowercase index field)
    if (u.usernameLower !== name.toLowerCase()){
      try{
        // If this is the FIRST time this account has ever touched
        // Firestore (no document existed yet), write a complete baseline
        // record — not just username/email — so it behaves exactly like
        // an account created through the normal sign-up page. Without
        // this, a student who reaches the dashboard some other way (e.g.
        // an account created directly in Firebase Auth) would end up
        // with a partial record missing 'joined'/'status'/'teacherId',
        // which used to make them silently disappear from the teacher
        // panel's Users table (Firestore's old orderBy('joined') would
        // drop any document without that field).
        const payload = { username: name, usernameLower: name.toLowerCase(), email };
        if (!userSnap.exists()) {
          payload.uid       = user.uid;
          payload.joined    = new Date().toISOString().split('T')[0];
          payload.status    = 'active';
          payload.teacherId = null;
          payload.createdAt = serverTimestamp();
        }
        await setDoc(userRef, payload, { merge:true });
      }catch(e){
        console.error('Could not save usernameLower:', e);
      }
    }

    /* ---- REAL DATA ONLY (no sample numbers) ---- */
    // Story progress is written by Unity's StoryProgressManager.cs into
    // students/{uid}/storySaves/{saveId} - one document per save slot
    // (Unity keeps at most 3). Each has 'completedStage' (0-4).
    // The dashboard shows the furthest save.
    let chaptersCompleted = 0;
    let storyDocExists = false;
    try {
      const savesSnap = await getDocs(collection(db, 'students', user.uid, 'storySaves'));
      savesSnap.forEach(d => {
        storyDocExists = true;
        chaptersCompleted = Math.max(chaptersCompleted, num(d.data().completedStage));
      });
    } catch (e) {
      console.error('Could not read storySaves:', e);
    }

    const stats = { chaptersCompleted, totalChapters: STORY_CHAPTERS.length };
    setTimeout(()=>{
      document.getElementById('stat-chapters').textContent = `${stats.chaptersCompleted}/${stats.totalChapters}`;
    },400);

    renderStory(stats.chaptersCompleted, storyDocExists);

    loadAchievements(user.uid, stats.chaptersCompleted);
    loadRank(u.totalScore);

    // friends
    watchFriends();
    watchIncoming();
    watchOutgoing();

  }catch(err){
    console.error('Dashboard load error:',err);
  }
});

/* ============================================================
   LOGOUT
   ============================================================ */
document.getElementById('dash-logout').addEventListener('click', async()=>{
  const result = await Swal.fire({title:'Logging out?',text:'See you next time!',showCancelButton:true,confirmButtonText:'Yes, logout',cancelButtonText:'Cancel',confirmButtonColor:'#e53935'});
  if(result.isConfirmed){ await signOut(auth); window.location.href='index.html'; }
});

/* ============================================================
   EDIT PROFILE
   ============================================================ */
const overlay = document.getElementById('ep-overlay');

document.getElementById('dash-edit-profile').addEventListener('click',()=>overlay.classList.add('open'));
document.getElementById('ep-close').addEventListener('click',()=>overlay.classList.remove('open'));
overlay.addEventListener('click', e=>{ if(e.target===overlay) overlay.classList.remove('open'); });

document.getElementById('ep-avatar-grid').addEventListener('click', e=>{
  const btn = e.target.closest('.ep-avatar-opt');
  if(!btn) return;
  selectedAvatar = resolveAvatar(btn.dataset.avatar);
  // preview only — the nav + header update after Save
  document.getElementById('ep-avatar-preview').src = AVATARS[selectedAvatar].src;
  document.querySelectorAll('.ep-avatar-opt').forEach(b=>b.classList.toggle('selected', b === btn));
});

document.getElementById('ep-bio').addEventListener('input', updateBioCount);

document.getElementById('ep-save').addEventListener('click', async()=>{
  const user = auth.currentUser;
  if(!user) return;
  const nickname = document.getElementById('ep-nickname').value.trim();
  const bio = document.getElementById('ep-bio').value.trim().slice(0, 150);
  const msgEl = document.getElementById('ep-msg');
  if(!nickname){ msgEl.textContent='Please enter a nickname.'; msgEl.className='ep-msg error'; return; }
  try{
    await setDoc(doc(db,'students',user.uid),{
      username: nickname,
      usernameLower: nickname.toLowerCase(),   // keeps friend search working
      avatar: selectedAvatar,
      bio: bio,                                // same field the Unity game reads
      email: user.email
    },{merge:true});

    document.getElementById('dash-name').textContent = nickname;
    document.getElementById('dash-header-name').textContent = nickname;
    applyAvatar(selectedAvatar);
    showBio(bio);
    if (me){ me.username = nickname; me.avatar = selectedAvatar; }

    msgEl.textContent='Saved!';
    msgEl.className='ep-msg success';
    setTimeout(()=>overlay.classList.remove('open'),1000);
  }catch(err){
    msgEl.textContent='Error saving. Try again.';
    msgEl.className='ep-msg error';
    console.error(err);
  }
});
/* ============================================================
   admin.js – Laro Tayo Admin Panel
   ============================================================ */

/* ---- MOCK DATA (replace with Firebase calls) ---- */
const MOCK_USERS = [
  { id: 1,  username: 'juan_dela',    email: 'juan@email.com',    joined: '2026-01-05', status: 'active'   },
  { id: 2,  username: 'maria_santos', email: 'maria@email.com',   joined: '2026-01-08', status: 'active'   },
  { id: 3,  username: 'pedro_reyes',  email: 'pedro@email.com',   joined: '2026-01-12', status: 'inactive' },
  { id: 4,  username: 'ana_garcia',   email: 'ana@email.com',     joined: '2026-01-15', status: 'active'   },
  { id: 5,  username: 'carlos_lim',   email: 'carlos@email.com',  joined: '2026-01-18', status: 'active'   },
  { id: 6,  username: 'rosa_cruz',    email: 'rosa@email.com',    joined: '2026-01-20', status: 'inactive' },
  { id: 7,  username: 'ben_torres',   email: 'ben@email.com',     joined: '2026-01-22', status: 'active'   },
  { id: 8,  username: 'ling_tan',     email: 'ling@email.com',    joined: '2026-01-25', status: 'active'   },
  { id: 9,  username: 'diego_flores', email: 'diego@email.com',   joined: '2026-01-28', status: 'active'   },
  { id: 10, username: 'tina_vera',    email: 'tina@email.com',    joined: '2026-02-01', status: 'inactive' },
  { id: 11, username: 'rudy_pablo',   email: 'rudy@email.com',    joined: '2026-02-05', status: 'active'   },
  { id: 12, username: 'liza_reyes',   email: 'liza@email.com',    joined: '2026-02-10', status: 'active'   },
];

const MOCK_LEADERBOARD = [
  { rank: 1,  player: 'langit_master',  pat: 980,  baka: 870,  langit: 1200, total: 3050 },
  { rank: 2,  player: 'laro_pro99',     pat: 860,  baka: 920,  langit: 1100, total: 2880 },
  { rank: 3,  player: 'juan_dela',      pat: 750,  baka: 800,  langit: 1050, total: 2600 },
  { rank: 4,  player: 'maria_santos',   pat: 700,  baka: 750,  langit: 980,  total: 2430 },
  { rank: 5,  player: 'patintero_ace',  pat: 950,  baka: 600,  langit: 870,  total: 2420 },
  { rank: 6,  player: 'baka_champ',     pat: 580,  baka: 990,  langit: 820,  total: 2390 },
  { rank: 7,  player: 'carlos_lim',     pat: 650,  baka: 720,  langit: 900,  total: 2270 },
  { rank: 8,  player: 'ana_garcia',     pat: 620,  baka: 680,  langit: 850,  total: 2150 },
  { rank: 9,  player: 'ben_torres',     pat: 540,  baka: 610,  langit: 800,  total: 1950 },
  { rank: 10, player: 'ling_tan',       pat: 490,  baka: 580,  langit: 760,  total: 1830 },
];

const MOCK_KPI = { users: 248, sessions: 1842, downloads: 576, active: 87 };

const MOCK_ACTIVITY = {
  labels: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
  data:   [120, 95, 180, 210, 165, 290, 310],
};

const MOCK_POPULARITY = {
  labels: ['Patintero', 'Luksong Baka', 'Langit Lupa'],
  data:   [880, 982, 1530],
};

/* ---- STATE ---- */
let announcements = JSON.parse(localStorage.getItem('lt_announcements') || '[]');
let filteredUsers = [...MOCK_USERS];
let activityChart, popularityChart;

/* ============================================================
   INIT
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {
  setDateDisplay();
  initTabs();
  initHamburger();
  populateKPIs();
  populateRecentReg();
  initCharts();
  populateUsersTable(MOCK_USERS);
  populateLeaderboard();
  renderAnnouncements();
  animateKPIs();
  initUserSearch();
  initExportCSV();
  initAnnouncements();
  initSettings();
  initLogout();
  animateGSBars();
});

/* ---- DATE DISPLAY ---- */
function setDateDisplay() {
  const el = document.getElementById('admin-date-display');
  if (!el) return;
  const now = new Date();
  el.textContent = now.toLocaleDateString('en-PH', {
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
  });
}

/* ============================================================
   TAB NAVIGATION
   ============================================================ */
function initTabs() {
  // Collect all tab buttons (desktop + mobile)
  const allTabBtns = document.querySelectorAll('.admin-tab-btn');
  const panels     = document.querySelectorAll('.admin-tab-panel');

  allTabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.tab;

      // Update active state on ALL buttons with same tab
      allTabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === target));
      panels.forEach(p => p.classList.toggle('active', p.id === `tab-${target}`));

      // Close mobile menu after selection
      const mobileMenu = document.getElementById('admin-mobile-menu');
      if (mobileMenu) mobileMenu.classList.remove('open');

      // Lazy re-render charts when switching to overview
      if (target === 'overview') {
        setTimeout(() => {
          activityChart && activityChart.update();
          popularityChart && popularityChart.update();
        }, 50);
      }

      // Animate bars when switching to games
      if (target === 'games') setTimeout(animateGSBars, 100);
    });
  });

  // "View All Users" shortcut button
  const viewAllBtn = document.getElementById('view-all-users-btn');
  if (viewAllBtn) {
    viewAllBtn.addEventListener('click', () => {
      allTabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === 'users'));
      panels.forEach(p => p.classList.toggle('active', p.id === 'tab-users'));
    });
  }
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

  // Close on outside click
  document.addEventListener('click', e => {
    if (!hamburger.contains(e.target) && !mobileMenu.contains(e.target)) {
      mobileMenu.classList.remove('open');
      hamburger.classList.remove('open');
    }
  });
}

/* ============================================================
   KPI CARDS
   ============================================================ */
function populateKPIs() {
  document.getElementById('kpi-users').textContent     = MOCK_KPI.users;
  document.getElementById('kpi-sessions').textContent  = MOCK_KPI.sessions.toLocaleString();
  document.getElementById('kpi-downloads').textContent = MOCK_KPI.downloads;
  document.getElementById('kpi-active').textContent    = MOCK_KPI.active;
  document.getElementById('user-count-badge').textContent = MOCK_USERS.length;
}

function animateKPIs() {
  document.querySelectorAll('.kpi-value').forEach(el => {
    const target = parseInt(el.textContent.replace(/,/g, ''), 10);
    if (isNaN(target)) return;
    let current = 0;
    const step  = Math.ceil(target / 60);
    const timer = setInterval(() => {
      current = Math.min(current + step, target);
      el.textContent = current.toLocaleString();
      if (current >= target) clearInterval(timer);
    }, 18);
  });
}

/* ============================================================
   RECENT REGISTRATIONS
   ============================================================ */
function populateRecentReg() {
  const tbody = document.getElementById('recent-reg-body');
  if (!tbody) return;
  const recent = [...MOCK_USERS].slice(-5).reverse();
  tbody.innerHTML = recent.map((u, i) => `
    <tr>
      <td>${i + 1}</td>
      <td><strong>${u.username}</strong></td>
      <td>${u.email}</td>
      <td>${formatDate(u.joined)}</td>
      <td><span class="status-badge ${u.status}">${u.status}</span></td>
    </tr>
  `).join('');
}

/* ============================================================
   CHARTS (Chart.js)
   ============================================================ */
function initCharts() {
  const ctxA = document.getElementById('activityChart');
  const ctxP = document.getElementById('popularityChart');
  if (!ctxA || !ctxP) return;

  // Shared chart defaults
  Chart.defaults.font.family = "'Nunito', sans-serif";
  Chart.defaults.font.weight = '700';

  // Activity Bar Chart
  activityChart = new Chart(ctxA, {
    type: 'bar',
    data: {
      labels:   MOCK_ACTIVITY.labels,
      datasets: [{
        label:           'Sessions',
        data:            MOCK_ACTIVITY.data,
        backgroundColor: 'rgba(43,127,212,0.75)',
        borderColor:     '#2B7FD4',
        borderWidth:     2,
        borderRadius:    8,
        borderSkipped:   false,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(0,0,0,0.06)' }, ticks: { color: '#4A6A8A' } },
        x: { grid: { display: false }, ticks: { color: '#4A6A8A' } }
      }
    }
  });

  // Popularity Doughnut Chart
  popularityChart = new Chart(ctxP, {
    type: 'doughnut',
    data: {
      labels:   MOCK_POPULARITY.labels,
      datasets: [{
        data:            MOCK_POPULARITY.data,
        backgroundColor: ['#2B7FD4', '#F4A234', '#4CAF50'],
        borderColor:     ['#1a6abf', '#D4851A', '#2E7D32'],
        borderWidth:     3,
        hoverOffset:     6,
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      cutout: '60%',
      plugins: {
        legend: {
          position: 'bottom',
          labels: { color: '#1A3A5C', padding: 16, font: { size: 13, weight: '700' } }
        }
      }
    }
  });
}

/* ============================================================
   USERS TABLE
   ============================================================ */
function populateUsersTable(users) {
  const tbody = document.getElementById('users-table-body');
  if (!tbody) return;

  if (users.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" style="text-align:center;padding:28px;color:#aaa">No users found.</td></tr>`;
    return;
  }

  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.id}</td>
      <td><strong>${u.username}</strong></td>
      <td>${u.email}</td>
      <td>${formatDate(u.joined)}</td>
      <td><span class="status-badge ${u.status}">${u.status}</span></td>
      <td>
        <div class="action-btns">
          <button class="tbl-btn view"   onclick="viewUser(${u.id})"   title="View">
            <span class="material-symbols-rounded">visibility</span>
          </button>
          <button class="tbl-btn delete" onclick="deleteUser(${u.id})" title="Delete">
            <span class="material-symbols-rounded">delete</span>
          </button>
        </div>
      </td>
    </tr>
  `).join('');
}

function initUserSearch() {
  const searchInput  = document.getElementById('user-search');
  const filterSelect = document.getElementById('user-filter');
  if (!searchInput || !filterSelect) return;

  function applyFilters() {
    const q      = searchInput.value.toLowerCase().trim();
    const status = filterSelect.value;
    filteredUsers = MOCK_USERS.filter(u => {
      const matchQ = !q || u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      const matchS = status === 'all' || u.status === status;
      return matchQ && matchS;
    });
    populateUsersTable(filteredUsers);
  }

  searchInput.addEventListener('input', applyFilters);
  filterSelect.addEventListener('change', applyFilters);
}

function viewUser(id) {
  const u = MOCK_USERS.find(x => x.id === id);
  if (!u) return;
  Swal.fire({
    title: `👤 ${u.username}`,
    html: `
      <div style="text-align:left;line-height:2">
        <b>Email:</b> ${u.email}<br>
        <b>Joined:</b> ${formatDate(u.joined)}<br>
        <b>Status:</b> <span style="color:${u.status==='active'?'#4CAF50':'#aaa'}">${u.status}</span>
      </div>`,
    confirmButtonText: 'Close',
    confirmButtonColor: '#2B7FD4',
    customClass: { popup: 'swal-popup' }
  });
}

function deleteUser(id) {
  const u = MOCK_USERS.find(x => x.id === id);
  if (!u) return;
  Swal.fire({
    title: 'Delete User?',
    html: `Are you sure you want to remove <strong>${u.username}</strong>?`,
    icon: 'warning',
    showCancelButton:   true,
    confirmButtonText:  'Yes, delete',
    cancelButtonText:   'Cancel',
    confirmButtonColor: '#e53935',
    cancelButtonColor:  '#6A8AA0',
  }).then(result => {
    if (result.isConfirmed) {
      const idx = MOCK_USERS.findIndex(x => x.id === id);
      if (idx !== -1) MOCK_USERS.splice(idx, 1);
      populateUsersTable(MOCK_USERS);
      populateKPIs();
      populateRecentReg();
      Swal.fire({ icon: 'success', title: 'Deleted!', text: `${u.username} has been removed.`, timer: 2000, showConfirmButton: false });
    }
  });
}

/* ============================================================
   EXPORT CSV
   ============================================================ */
function initExportCSV() {
  const btn = document.getElementById('export-users-btn');
  if (!btn) return;
  btn.addEventListener('click', () => {
    const rows = [['ID', 'Username', 'Email', 'Joined', 'Status']];
    filteredUsers.forEach(u => rows.push([u.id, u.username, u.email, u.joined, u.status]));
    const csv     = rows.map(r => r.join(',')).join('\n');
    const blob    = new Blob([csv], { type: 'text/csv' });
    const url     = URL.createObjectURL(blob);
    const a       = document.createElement('a');
    a.href        = url;
    a.download    = 'laro-tayo-users.csv';
    a.click();
    URL.revokeObjectURL(url);
  });
}

/* ============================================================
   LEADERBOARD
   ============================================================ */
function populateLeaderboard() {
  const tbody = document.getElementById('leaderboard-body');
  if (!tbody) return;
  const medals = ['🥇', '🥈', '🥉'];
  tbody.innerHTML = MOCK_LEADERBOARD.map(r => `
    <tr>
      <td><strong>${medals[r.rank - 1] || r.rank}</strong></td>
      <td><strong>${r.player}</strong></td>
      <td>${r.pat.toLocaleString()}</td>
      <td>${r.baka.toLocaleString()}</td>
      <td>${r.langit.toLocaleString()}</td>
      <td><strong style="color:#F4A234">${r.total.toLocaleString()}</strong></td>
    </tr>
  `).join('');
}

/* ============================================================
   GAME STAT BAR ANIMATION
   ============================================================ */
function animateGSBars() {
  document.querySelectorAll('.gscard-bar').forEach(bar => {
    const target = bar.dataset.width || '0%';
    bar.style.width = '0%';
    requestAnimationFrame(() => {
      setTimeout(() => { bar.style.width = target; }, 80);
    });
  });
}

/* ============================================================
   ANNOUNCEMENTS
   ============================================================ */
function initAnnouncements() {
  const newBtn    = document.getElementById('new-ann-btn');
  const cancelBtn = document.getElementById('ann-cancel-btn');
  const postBtn   = document.getElementById('ann-post-btn');
  const compose   = document.getElementById('ann-compose');
  const msgArea   = document.getElementById('ann-message');
  const charCount = document.getElementById('ann-char-count');

  if (newBtn) newBtn.addEventListener('click', () => {
    compose.style.display = 'block';
    compose.scrollIntoView({ behavior: 'smooth', block: 'start' });
  });

  if (cancelBtn) cancelBtn.addEventListener('click', () => {
    compose.style.display = 'none';
    clearAnnForm();
  });

  if (msgArea) msgArea.addEventListener('input', () => {
    charCount.textContent = `${msgArea.value.length} / 300`;
  });

  if (postBtn) postBtn.addEventListener('click', postAnnouncement);
}

function postAnnouncement() {
  const title   = document.getElementById('ann-title').value.trim();
  const type    = document.getElementById('ann-type').value;
  const message = document.getElementById('ann-message').value.trim();

  if (!title || !message) {
    Swal.fire({ icon: 'warning', title: 'Incomplete', text: 'Please fill in the title and message.', confirmButtonColor: '#F4A234' });
    return;
  }

  const ann = {
    id:      Date.now(),
    title,
    type,
    message,
    date:    new Date().toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
  };

  announcements.unshift(ann);
  localStorage.setItem('lt_announcements', JSON.stringify(announcements));
  renderAnnouncements();
  clearAnnForm();
  document.getElementById('ann-compose').style.display = 'none';

  Swal.fire({ icon: 'success', title: 'Posted!', text: 'Announcement published successfully.', timer: 2000, showConfirmButton: false });
}

function clearAnnForm() {
  ['ann-title', 'ann-message'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const charCount = document.getElementById('ann-char-count');
  if (charCount) charCount.textContent = '0 / 300';
  const typeEl = document.getElementById('ann-type');
  if (typeEl) typeEl.value = 'info';
}

const ANN_ICONS = { info: 'ℹ️', update: '🆕', event: '🎉', maintenance: '🔧' };
const ANN_LABELS = { info: 'Info', update: 'Update', event: 'Event', maintenance: 'Maintenance' };

function renderAnnouncements() {
  const list = document.getElementById('ann-list');
  if (!list) return;

  if (announcements.length === 0) {
    list.innerHTML = `<div class="ann-empty">No announcements yet. Click <strong>New Announcement</strong> to get started!</div>`;
    return;
  }

  list.innerHTML = announcements.map(a => `
    <div class="ann-card ann-type-${a.type}" id="ann-${a.id}">
      <div class="ann-card-top">
        <span class="ann-type-badge ${a.type}">${ANN_ICONS[a.type]} ${ANN_LABELS[a.type]}</span>
        <span class="ann-date">${a.date}</span>
        <button class="ann-delete-btn" onclick="deleteAnn(${a.id})" title="Delete">
          <span class="material-symbols-rounded">close</span>
        </button>
      </div>
      <h4 class="ann-card-title">${escapeHtml(a.title)}</h4>
      <p class="ann-card-msg">${escapeHtml(a.message)}</p>
    </div>
  `).join('');
}

function deleteAnn(id) {
  Swal.fire({
    title: 'Delete Announcement?',
    text: 'This cannot be undone.',
    icon: 'warning',
    showCancelButton: true,
    confirmButtonText: 'Delete',
    confirmButtonColor: '#e53935',
    cancelButtonColor: '#6A8AA0',
  }).then(r => {
    if (r.isConfirmed) {
      announcements = announcements.filter(a => a.id !== id);
      localStorage.setItem('lt_announcements', JSON.stringify(announcements));
      renderAnnouncements();
    }
  });
}

/* ============================================================
   SETTINGS
   ============================================================ */
function initSettings() {
  // Change password
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
    // Simulate success (hook into Firebase Auth here)
    Swal.fire({ icon: 'success', title: 'Password Updated', text: 'Your password has been changed.', timer: 2000, showConfirmButton: false });
    ['cur-pass', 'new-pass', 'conf-pass'].forEach(id => document.getElementById(id).value = '');
  });

  // Toggle switches with SweetAlert feedback
  const toggleMaint = document.getElementById('toggle-maintenance');
  if (toggleMaint) toggleMaint.addEventListener('change', () => {
    const msg = toggleMaint.checked ? 'Maintenance mode ON. Users cannot access the app.' : 'Maintenance mode OFF. App is live.';
    Swal.fire({ icon: 'info', title: 'Setting Updated', text: msg, timer: 2200, showConfirmButton: false });
  });

  const toggleReg = document.getElementById('toggle-reg');
  if (toggleReg) toggleReg.addEventListener('change', () => {
    const msg = toggleReg.checked ? 'New registrations are now allowed.' : 'New registrations are now disabled.';
    Swal.fire({ icon: 'info', title: 'Setting Updated', text: msg, timer: 2200, showConfirmButton: false });
  });

  const togglePiko = document.getElementById('toggle-piko');
  if (togglePiko) togglePiko.addEventListener('change', () => {
    const msg = togglePiko.checked ? 'Piko is now enabled for players!' : 'Piko has been disabled.';
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
      text: 'Are you sure you want to sign out?',
      icon: 'question',
      showCancelButton: true,
      confirmButtonText: 'Yes, logout',
      cancelButtonText: 'Cancel',
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
  return new Date(dateStr).toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' });
}

function escapeHtml(str) {
  const div = document.createElement('div');
  div.appendChild(document.createTextNode(str));
  return div.innerHTML;
}
// ---- REVEAL ANIMATIONS ----
const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));


// ---- NAV ACTIVE STATE ----
const navItems   = document.querySelectorAll('.nav-item');
const currentPage = window.location.pathname.split('/').pop();

function setActiveByPage() {
  navItems.forEach(i => i.classList.remove('active'));

  if (currentPage === 'about.html') {
    navItems.forEach(item => {
      if (item.getAttribute('href') === 'about.html') item.classList.add('active');
    });
    return;
  }

  navItems.forEach(item => {
    if (item.getAttribute('href') === '#home') item.classList.add('active');
  });
}

setActiveByPage();

if (currentPage === 'index.html' || currentPage === '') {
  const sections = document.querySelectorAll('section[id]');

  const scrollObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        const id = entry.target.getAttribute('id');
        navItems.forEach(i => i.classList.remove('active'));
        navItems.forEach(item => {
          const href = item.getAttribute('href');
          if (href === '#' + id || href === 'index.html#' + id) {
            item.classList.add('active');
          }
        });
      }
    });
  }, { threshold: 0.3, rootMargin: '-60px 0px -40% 0px' });

  sections.forEach(sec => scrollObserver.observe(sec));
}

navItems.forEach(item => {
  item.addEventListener('click', function () {
    const href = this.getAttribute('href');
    if (href && href.startsWith('#')) {
      navItems.forEach(i => i.classList.remove('active'));
      this.classList.add('active');
    }
  });
});


// ---- TRAILER (YouTube) ----
// Put your YouTube link in index.html: <div id="trailer-embed" data-youtube="...">
(function () {
  const wrap = document.getElementById('trailer-embed');
  if (!wrap) return;

  function getVideoId(url) {
    const m = url.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/);
    if (m) return m[1];
    return /^[\w-]{11}$/.test(url) ? url : null;
  }

  const id = getVideoId((wrap.dataset.youtube || '').trim());
  if (!id) {
    wrap.innerHTML = '<div class="trailer-placeholder">Trailer coming soon</div>';
    return;
  }

  const base  = 'https://www.youtube-nocookie.com/embed/' + id + '?rel=0&playsinline=1';
  const frame = document.createElement('iframe');
  frame.id    = 'featured-video';
  frame.src   = base;
  frame.title = 'Laro Tayo Trailer';
  frame.loading = 'lazy';
  frame.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.allowFullscreen = true;
  wrap.appendChild(frame);

  // "Watch Trailer" button in the hero: jump to the trailer and start playing it
  const trailerBtn = document.getElementById('watch-trailer-btn');
  if (trailerBtn) {
    trailerBtn.addEventListener('click', () => {
      setTimeout(() => { frame.src = base + '&autoplay=1'; }, 200);
    });
  }
})();


// ---- SCREENSHOTS: click a picture to view it larger ----
(function () {
  const grid = document.getElementById('shots-grid');
  if (!grid || typeof Swal === 'undefined') return;

  grid.querySelectorAll('.shot').forEach(btn => {
    btn.addEventListener('click', () => {
      const img = btn.querySelector('img');
      Swal.fire({
        imageUrl: img.getAttribute('src'),
        imageAlt: img.alt,
        imageWidth: '100%',
        imageHeight: 'auto',
        width: 'min(92vw, 900px)',
        padding: '1rem',
        showConfirmButton: false,
        showCloseButton: true
      });
    });
  });
})();


// ---- HAMBURGER MENU ----
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  navLinks.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });

  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    }
  });
}


// ---- GAME HISTORY: click a game card to read its history ----
(function () {
  if (typeof Swal === 'undefined') return;

  // Edit the text below to change what each popup says.
  const GAME_HISTORY = {
    'sipa': {
      origin: 'Pre-colonial Philippines',
      paragraphs: [
        'Sipa is one of the oldest traditional games in the Philippines and is often called the country\u2019s native kicking game. Filipinos were already playing it long before the Spanish arrived, and similar kick games exist across Southeast Asia, such as sepak takraw.',
        'It is traditionally played with a \u201Csipa\u201D: a small metal washer wrapped in colorful strips of paper, plastic, or cloth. Players use the foot (and sometimes the knee or heel) to keep it in the air for as long as possible.'
      ]
    },
    'luksong baka': {
      origin: 'Rural farming communities',
      paragraphs: [
        'Luksong Baka is a close cousin of Luksong Tinik and is believed to come from farming communities, where children took inspiration from the cows and carabaos around them.',
        'One player crouches as the \u201Cbaka\u201D (cow) while the others take turns leaping over. The baka gets taller as the game goes on, so it tests agility and courage. Traditionally, jumpers may use their hands to push off the baka but must not touch it with their body.'
      ]
    },
    'hulihin ang biik': {
      origin: 'Fiesta and barrio games',
      paragraphs: [
        'Chasing and catching a pig is a classic fiesta and barrio game. It is part of the Philippines\u2019 festive tradition of lively community contests, often alongside games like Palosebo.',
        'Players chase a pig (sometimes a greased one) around an open area, and the one who catches it can win it as a prize. It is as much about fun and laughter for the crowd as it is about speed and quick thinking.'
      ]
    },
    'palosebo': {
      origin: 'Spanish colonial period',
      paragraphs: [
        'The name comes from the Spanish words \u201Cpalo\u201D (pole) and \u201Csebo\u201D (grease or tallow). Palosebo became a favorite at town fiestas, especially during the Spanish colonial period.',
        'A tall bamboo pole is greased and a prize is hung at the top, which can be anything from food to money. Players try to climb up, often working together, and the slippery pole makes it a real test of patience and teamwork.'
      ]
    },
    'patintero': {
      origin: 'Street and schoolyard play',
      paragraphs: [
        'Patintero is one of the most popular street games in the Philippines and is also known as \u201Charangang taga\u201D in Tagalog and \u201Ctubigan\u201D in parts of the Visayas.',
        'Lines are drawn on the ground, and one team (the taggers) guards the lines while the other team tries to cross every line and return without being tagged. It is usually played at dusk with a big group of neighborhood kids, and it builds teamwork and speed.'
      ]
    },
    'bamsak': {
      origin: 'Hide-and-seek tradition',
      paragraphs: [
        'Bamsak belongs to the family of Filipino hide-and-seek style street games, like \u201Ctagu-taguan,\u201D that children have played in neighborhoods for generations.',
        'Players scatter and hide while the seekers try to find them, and the last player left standing wins. It needs no equipment, only a good hiding spot and quick feet.'
      ]
    },
    'sekyu base': {
      origin: 'Base-capturing street games',
      paragraphs: [
        'Sekyu Base is inspired by traditional Filipino base games like \u201Cagawan base,\u201D where two teams each protect a home base and try to capture the other team\u2019s.',
        'Players run, dodge, and tag opponents to defend their own base while sneaking into enemy territory. It is a game of strategy and teamwork that neighborhood kids have played in open streets and yards for generations.'
      ]
    }
  };

  document.querySelectorAll('#games .card').forEach(card => {
    const titleEl = card.querySelector('h3');
    if (!titleEl) return;
    const key = titleEl.textContent.trim().toLowerCase();
    const info = GAME_HISTORY[key];
    if (!info) return;

    card.classList.add('card-clickable');
    card.setAttribute('role', 'button');
    card.setAttribute('tabindex', '0');
    card.setAttribute('aria-label', 'Read the history of ' + titleEl.textContent.trim());

    const hint = document.createElement('span');
    hint.className = 'card-hint';
    hint.textContent = 'Tap to read its history';
    card.appendChild(hint);

    const openHistory = () => {
      const body = info.paragraphs.map(p => '<p>' + p + '</p>').join('');
      Swal.fire({
        title: titleEl.textContent.trim(),
        html:
          '<span class="history-origin">' + info.origin + '</span>' +
          '<div class="history-body">' + body + '</div>',
        confirmButtonText: 'Got it!',
        showCloseButton: true,
        width: 'min(92vw, 560px)',
        customClass: {
          popup: 'history-popup',
          title: 'history-title',
          confirmButton: 'history-btn'
        }
      });
    };

    card.addEventListener('click', openHistory);
    card.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        openHistory();
      }
    });
  });
})();
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


// ---- SCREENSHOT GALLERY ----
(function () {
  const thumbs = document.querySelectorAll('.gthumb');
  const featuredImg = document.getElementById('featured-img');
  const emptyMain = document.getElementById('gallery-empty-main');
  const prevBtn = document.getElementById('gallery-prev');
  const nextBtn = document.getElementById('gallery-next');
  if (!thumbs.length || !featuredImg) return;

  let current = 0;

  function setActive(index) {
    current = (index + thumbs.length) % thumbs.length;
    thumbs.forEach(t => t.classList.remove('active'));
    thumbs[current].classList.add('active');

    const src = thumbs[current].dataset.src;

    if (src) {
      featuredImg.style.opacity = '0';
      setTimeout(() => {
        featuredImg.src = src;
        featuredImg.style.display = 'block';
        if (emptyMain) emptyMain.style.display = 'none';
        featuredImg.style.opacity = '1';
      }, 150);
    } else {
      featuredImg.style.display = 'none';
      if (emptyMain) emptyMain.style.display = 'flex';
    }
  }

  thumbs.forEach((thumb, i) => {
    thumb.addEventListener('click', () => setActive(i));
  });

  if (prevBtn) prevBtn.addEventListener('click', () => setActive(current - 1));
  if (nextBtn) nextBtn.addEventListener('click', () => setActive(current + 1));
})();

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
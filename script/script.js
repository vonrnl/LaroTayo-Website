const observer = new IntersectionObserver(entries => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.reveal').forEach(el => observer.observe(el));

const navItems = document.querySelectorAll('.nav-item');
const currentPage = window.location.pathname.split('/').pop();

navItems.forEach(item => {
  item.addEventListener('click', function (e) {
    const href = this.getAttribute('href');

    if (
      (currentPage === 'about.html' && href === 'about.html') ||
      (currentPage === '' && href === 'index.html') ||
      (currentPage === 'index.html' && href === 'index.html')
    ) {
      e.preventDefault();
    }

    navItems.forEach(i => i.classList.remove('active'));
    this.classList.add('active');
  });
});

if (currentPage === 'about.html') {
  navItems.forEach(i => i.classList.remove('active'));
  navItems.forEach(item => {
    if (item.getAttribute('href') === 'about.html') {
      item.classList.add('active');
    }
  });
}

if (currentPage === 'index.html' || currentPage === '') {

  navItems.forEach(i => i.classList.remove('active'));
  navItems.forEach(item => {
    if (item.getAttribute('href') === '#home') item.classList.add('active');
  });

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
  }, {
    threshold: 0.3,
    rootMargin: '-60px 0px -40% 0px'
  });

  sections.forEach(sec => scrollObserver.observe(sec));
}
// ---- HAMBURGER MENU ----
const hamburger = document.getElementById('hamburger');
const navLinks  = document.getElementById('nav-links');

if (hamburger && navLinks) {
  hamburger.addEventListener('click', () => {
    hamburger.classList.toggle('open');
    navLinks.classList.toggle('open');
  });

  // Close menu when a nav item is clicked
  navLinks.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    });
  });

  // Close menu when clicking outside
  document.addEventListener('click', (e) => {
    if (!hamburger.contains(e.target) && !navLinks.contains(e.target)) {
      hamburger.classList.remove('open');
      navLinks.classList.remove('open');
    }
  });
}
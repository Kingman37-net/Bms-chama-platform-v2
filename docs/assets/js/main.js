/* ============================================================
   BODMAS CHAMAA — Shared Site JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  // ---------- Mobile hamburger toggle ----------
  var hamburger = document.querySelector('.hamburger');
  var navMenu = document.querySelector('.nav-menu');

  if (hamburger && navMenu) {
    hamburger.addEventListener('click', function () {
      navMenu.classList.toggle('open');
      hamburger.classList.toggle('active');
      var expanded = hamburger.getAttribute('aria-expanded') === 'true';
      hamburger.setAttribute('aria-expanded', !expanded);
    });

    // Close on link click (mobile UX)
    navMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        navMenu.classList.remove('open');
        hamburger.classList.remove('active');
        hamburger.setAttribute('aria-expanded', 'false');
      });
    });
  }

  // ---------- Highlight current page in nav ----------
  var currentPath = window.location.pathname.split('/').pop() || 'index.html';
  document.querySelectorAll('.nav-menu a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (!href) return;
    var hrefFile = href.split('/').pop();
    if (hrefFile === currentPath) {
      link.classList.add('active');
    }
  });

  // ---------- Current year in footer (if placeholder present) ----------
  document.querySelectorAll('[data-current-year]').forEach(function (el) {
    el.textContent = new Date().getFullYear();
  });
});

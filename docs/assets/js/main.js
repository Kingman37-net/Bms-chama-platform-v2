/* ============================================================
   BODMAS CHAMAA — Shared Site JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  // ---------- Mobile hamburger toggle ----------
  var hamburger = document.querySelector('.hamburger');
  var navMenu = document.querySelector('.nav-menu');

  if (hamburger && navMenu) {
    function setMenuOpen(open) {
      navMenu.classList.toggle('open', open);
      hamburger.classList.toggle('active', open);
      hamburger.setAttribute('aria-expanded', String(open));
    }

    hamburger.addEventListener('click', function () {
      var isOpen = navMenu.classList.contains('open');
      setMenuOpen(!isOpen);
    });

    // Close the menu after selecting a navigation link.
    navMenu.querySelectorAll('a').forEach(function (link) {
      link.addEventListener('click', function () {
        setMenuOpen(false);
      });
    });

    // Close the menu when the user taps outside it.
    document.addEventListener('click', function (event) {
      if (
        navMenu.classList.contains('open') &&
        !navMenu.contains(event.target) &&
        !hamburger.contains(event.target)
      ) {
        setMenuOpen(false);
      }
    });

    // Support the Escape key.
    document.addEventListener('keydown', function (event) {
      if (event.key === 'Escape' && navMenu.classList.contains('open')) {
        setMenuOpen(false);
        hamburger.focus();
      }
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

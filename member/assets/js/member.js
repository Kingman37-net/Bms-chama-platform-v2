/* ============================================================
   BODMAS CHAMAA — Member Portal JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.member-menu-toggle');
  var sidebar = document.getElementById('memberSidebar');
  var overlay = document.getElementById('memberOverlay');

  function openSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
    if (toggle) {
      toggle.classList.add('active');
      toggle.setAttribute('aria-expanded', 'true');
    }
  }

  function closeSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    if (toggle) {
      toggle.classList.remove('active');
      toggle.setAttribute('aria-expanded', 'false');
    }
  }

  if (toggle) {
    toggle.addEventListener('click', function () {
      if (sidebar.classList.contains('open')) closeSidebar();
      else openSidebar();
    });
  }

  if (overlay) overlay.addEventListener('click', closeSidebar);

  // Close drawer when a link is clicked on mobile
  document.querySelectorAll('.member-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.innerWidth < 960) closeSidebar();
    });
  });

  // Highlight current page
  var current = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.member-nav a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href && href.split('/').pop() === current) {
      link.classList.add('active');
    }
  });

  // Login form — mock only (no real auth in V1)
  var loginForm = document.getElementById('memberLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      alert('Authentication will be wired in Phase 5 (backend). For now, this is a UI prototype.');
      window.location.href = 'dashboard.html';
    });
  }
});

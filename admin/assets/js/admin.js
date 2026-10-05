/* ============================================================
   BODMAS CHAMAA — Admin System JavaScript
   ============================================================ */

document.addEventListener('DOMContentLoaded', function () {
  var toggle = document.querySelector('.admin-menu-toggle');
  var sidebar = document.getElementById('adminSidebar');
  var overlay = document.getElementById('adminOverlay');

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

  document.querySelectorAll('.admin-nav a').forEach(function (link) {
    link.addEventListener('click', function () {
      if (window.innerWidth < 1024) closeSidebar();
    });
  });

  // Highlight current page
  var current = window.location.pathname.split('/').pop() || 'dashboard.html';
  document.querySelectorAll('.admin-nav a').forEach(function (link) {
    var href = link.getAttribute('href');
    if (href && href.split('/').pop() === current) {
      link.classList.add('active');
    }
  });

  // Mock login
  var loginForm = document.getElementById('adminLoginForm');
  if (loginForm) {
    loginForm.addEventListener('submit', function (e) {
      e.preventDefault();
      alert('Admin authentication will be wired in Phase 6 (backend). For now, this is a UI prototype.');
      window.location.href = 'dashboard.html';
    });
  }
});

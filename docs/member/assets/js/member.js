/* BODMAS CHAMAA - Member Portal Client */
'use strict';

var API_BASE = (function () {
  var h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:8000'
    : 'https://api.bodmaschamaa.com'\;
})();

function sget(k) { return sessionStorage.getItem(k); }
function sset(k, v) { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); }
function getAccessToken() { return sget('bmc_at'); }
function setAccessToken(v) { sset('bmc_at', v); }
function getRefreshToken() { return sget('bmc_rt'); }
function setRefreshToken(v) { sset('bmc_rt', v); }
function getUser() {
  var raw = sget('bmc_user');
  if (!raw) return null;
  try { return JSON.parse(raw); } catch (e) { return null; }
}
function setUser(v) { sset('bmc_user', v ? JSON.stringify(v) : null); }
function clearSession() { setAccessToken(null); setRefreshToken(null); setUser(null); }
function hasSession() { return cat > register.html << 'EOF'
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Apply for Membership | BODMAS CHAMAA</title>
  <link rel="stylesheet" href="assets/css/member.css">
</head>
<body class="member-body is-login">
  <div class="member-login-box">
    <img class="login-logo" src="assets/images/bodmas-chamaa-logo.png" alt="BODMAS CHAMAA Logo">
    <h1>Apply for Membership</h1>
    <p class="sub">BODMAS CHAMAA Portal</p>
    
    <form id="memberRegisterForm" autocomplete="off" novalidate>
      <label for="fullName">Full Name</label>
      <input type="text" id="fullName" name="fullName" placeholder="e.g. John Doe" required>
      
      <label for="email">Email Address</label>
      <input type="email" id="email" name="email" placeholder="e.g. john@example.com" required>
      
      <label for="phone">Phone Number</label>
      <input type="tel" id="phone" name="phone" placeholder="e.g. 0712345678" required>
      
      <label for="password">Password</label>
      <input type="password" id="password" name="password" placeholder="Create a password" required>
      
      <button type="submit">Submit Application</button>
    </form>
    
    <a href="index.html" class="back-link">&larr; Already have an account? Login</a>
    <a href="../membership.html" class="back-link" style="margin-top: 10px; display: block;">&larr; Back to Membership Info</a>
  </div>
  <script src="assets/js/member.js" defer></script>
</body>
</html>
EOF(getAccessToken() || getRefreshToken()); }

function formatKsh(minor) {
  var n = Number(minor || 0) / 100;
  return 'KSh ' + n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function initShell() {
  var toggle = document.querySelector('.member-menu-toggle');
  var sidebar = document.getElementById('memberSidebar');
  var overlay = document.getElementById('memberOverlay');

  function openSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.add('open');
    sidebar.setAttribute('aria-hidden', 'false');
    overlay.hidden = false;
    if (toggle) { toggle.classList.add('active'); toggle.setAttribute('aria-expanded', 'true'); }
  }
  function closeSidebar() {
    if (!sidebar || !overlay) return;
    sidebar.classList.remove('open');
    sidebar.setAttribute('aria-hidden', 'true');
    overlay.hidden = true;
    if (toggle) { toggle.classList.remove('active'); toggle.setAttribute('aria-expanded', 'false'); }
  }

  if (toggle) toggle.addEventListener('click', function () {
    if (sidebar && sidebar.classList.contains('open')) closeSidebar();
    else openSidebar();
  });
  if (overlay) overlay.addEventListener('click', closeSidebar);

  var logoutLink = document.querySelector('.member-logout');
  if (logoutLink) logoutLink.addEventListener('click', function (e) {
    e.preventDefault();
    clearSession();
    window.location.href = 'index.html';
  });
}

function initLogin() {
  var form = document.getElementById('memberLoginForm');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.querySelector('#memberId').value.trim();
    var password = form.querySelector('#password').value;
    var btn = form.querySelector('button[type="submit"]');
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Signing in...';

    fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        if (!res.ok || !b || !b.ok) {
          var msg = (b && b.error && b.error.message) || 'Login failed';
          alert(msg);
          btn.disabled = false;
          btn.textContent = original;
          return;
        }
        setAccessToken(b.data.access_token);
        setRefreshToken(b.data.refresh_token);
        setUser(b.data.user);
        window.location.href = 'dashboard.html';
      });
    }).catch(function (err) {
      alert('Network error: ' + err.message);
      btn.disabled = false;
      btn.textContent = original;
    });
  });
}

function initRegister() {
  var form = document.getElementById('memberRegisterForm');
  if (!form) return;

  form.addEventListener('submit', function (e) {
    e.preventDefault(); // Prevents the URL GET request!
    
    var fullName = form.querySelector('#fullName').value.trim();
    var email = form.querySelector('#email').value.trim();
    var phone = form.querySelector('#phone').value.trim();
    var password = form.querySelector('#password').value;

    if (!fullName || !email || !password) {
      alert('Please fill in all required fields.');
      return;
    }

    var btn = form.querySelector('button[type="submit"]');
    var original = btn.textContent;
    btn.disabled = true;
    btn.textContent = 'Submitting...';

    fetch(API_BASE + '/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        display_name: fullName,
        email: email,
        phone: phone,
        password: password
      })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        if (!res.ok || !b || !b.ok) {
          var msg = (b && b.error && b.error.message) || 'Registration failed';
          alert(msg);
          btn.disabled = false;
          btn.textContent = original;
          return;
        }
        alert('Registration successful! Please log in.');
        window.location.href = 'index.html';
      });
    }).catch(function (err) {
      alert('Network error: ' + err.message);
      btn.disabled = false;
      btn.textContent = original;
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initShell();
  
  var isLoginPage = document.body.classList.contains('is-login');
  
  if (isLoginPage) {
    // Check if we are on the Register page
    if (document.getElementById('memberRegisterForm')) {
      initRegister();
      return;
    }
    
    // Check if we are on the Login page
    if (document.getElementById('memberLoginForm')) {
      if (hasSession()) { 
        window.location.href = 'dashboard.html'; 
        return; 
      }
      initLogin();
    }
  }
});

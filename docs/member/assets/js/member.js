/* BODMAS CHAMAA - Member Portal Client */
'use strict';

var API_BASE = (function () {
  var h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:8000'
    : 'YOUR_NEW_CLOUDFLARE_URL';
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
function hasSession() { return sed -i 's|<script src="assets/js/member.js" defer></script>|<script src="assets/js/member.js?v=2" defer></script>|g' index.html(getAccessToken() || getRefreshToken()); }

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
    e.preventDefault(); // THIS IS WHAT STOPS THE URL GET REQUEST
    
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
  var isLoginPage = document.body.classList.contains('is-login');
  
  if (isLoginPage) {
    if (document.getElementById('memberRegisterForm')) {
      initRegister();
      return;
    }
    
    if (document.getElementById('memberLoginForm')) {
      if (hasSession()) { 
        window.location.href = 'dashboard.html'; 
        return; 
      }
      initLogin();
    }
  }
});

/* BODMAS CHAMAA - Member Portal Client */
'use strict';

var API_BASE = (function () {
  var h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:8000'
    : 'https://api.bodmaschamaa.com';
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
function hasSession() { return !!(getAccessToken() || getRefreshToken()); }

function ApiClientError(code, message, status) {
  this.name = 'ApiClientError';
  this.code = code;
  this.message = message;
  this.status = status;
}
ApiClientError.prototype = Object.create(Error.prototype);

function tryRefresh() {
  return new Promise(function (resolve) {
    var rt = getRefreshToken();
    if (!rt) return resolve(false);
    fetch(API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        if (!res.ok || !b || !b.ok) return resolve(false);
        setAccessToken(b.data.access_token);
        setRefreshToken(b.data.refresh_token);
        resolve(true);
      });
    }).catch(function () { resolve(false); });
  });
}

function apiFetch(path, options) {
  options = options || {};
  var headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  var at = getAccessToken();
  if (at) headers['Authorization'] = 'Bearer ' + at;
  var opts = { method: options.method || 'GET', headers: headers };
  if (options.body !== undefined) opts.body = JSON.stringify(options.body);

  return fetch(API_BASE + path, opts).then(function (res) {
    if (res.status === 401 && !options._retried) {
      return tryRefresh().then(function (ok) {
        if (ok) {
          var next = Object.assign({}, options, { _retried: true });
          return apiFetch(path, next);
        }
        clearSession();
        window.location.href = 'index.html';
        throw new ApiClientError('UNAUTHENTICATED', 'Session expired.', 401);
      });
    }
    return res.json().catch(function () { return null; }).then(function (b) {
      if (!res.ok || !b || !b.ok) {
        var code = (b && b.error && b.error.code) || ('HTTP_' + res.status);
        var msg = (b && b.error && b.error.message) || 'Request failed';
        throw new ApiClientError(code, msg, res.status);
      }
      return b;
    });
  }).catch(function (err) {
    if (err instanceof ApiClientError) throw err;
    throw new ApiClientError('NETWORK_ERROR', 'Cannot reach API at ' + API_BASE, 0);
  });
}

function formatKsh(minor) {
  var n = Number(minor || 0) / 100;
  return 'KSh ' + n.toLocaleString('en-KE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escapeHtml(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
  });
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

  var navLinks = document.querySelectorAll('.member-nav a');
  for (var i = 0; i < navLinks.length; i++) {
    navLinks[i].addEventListener('click', function () {
      if (window.innerWidth < 960) closeSidebar();
    });
  }

  var current = window.location.pathname.split('/').pop() || 'dashboard.html';
  for (var j = 0; j < navLinks.length; j++) {
    var href = navLinks[j].getAttribute('href');
    if (href && href.split('/').pop() === current) navLinks[j].classList.add('active');
  }

  var u = getUser();
  var nameEl = document.querySelector('.member-name');
  if (nameEl && u) nameEl.textContent = u.display_name || 'Member';

  var logoutLink = document.querySelector('.member-logout');
  if (logoutLink) logoutLink.addEventListener('click', function (e) {
    e.preventDefault();
    apiFetch('/auth/logout', { method: 'POST', body: { refresh_token: getRefreshToken() } })
      .catch(function () {})
      .then(function () {
        clearSession();
        window.location.href = 'index.html';
      });
  });
}

function initLogin() {
  if (hasSession()) { window.location.href = 'dashboard.html'; return; }
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

function initDashboard() {
  var savingsEl = document.querySelector('[data-stat="savings"]');
  if (!savingsEl) return;

  Promise.all([
    apiFetch('/accounts/2000/balance').then(function (r) { return r.data; }).catch(function () { return { balance_minor: 0 }; }),
    apiFetch('/loans?per_page=100').then(function (r) { return r.data; }).catch(function () { return []; })
  ]).then(function (results) {
    var savings = results[0], loans = results[1];
    var active = loans.filter(function (l) { return l.status === 'active' || l.status === 'disbursed'; });
    var outstanding = active.reduce(function (s, l) { return s + (l.outstanding_minor || 0); }, 0);
    savingsEl.textContent = formatKsh(savings.balance_minor);
    var loanEl = document.querySelector('[data-stat="loan"]');
    if (loanEl) loanEl.textContent = formatKsh(outstanding);
    return apiFetch('/contributions?per_page=5').then(function (r) { return r.data; }).catch(function () { return []; });
  }).then(function (contribs) {
    var el = document.querySelector('[data-activity]');
    if (!el) return;
    if (!contribs || contribs.length === 0) {
      el.innerHTML = '<p>No activity yet.</p>';
      return;
    }
    var html = '';
    for (var i = 0; i < contribs.length; i++) {
      var c = contribs[i];
      html += '<div style="padding:10px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between">';
      html += '<div><strong>' + escapeHtml(c.plan_id || 'Contribution') + '</strong><br>';
      html += '<span style="color:#6b7280;font-size:0.85rem">' + escapeHtml(c.contribution_date) + ' &middot; ' + escapeHtml(c.status) + '</span></div>';
      html += '<span style="font-weight:600">' + formatKsh(c.amount_minor) + '</span></div>';
    }
    el.innerHTML = html;
  }).catch(function (err) { console.error('[dashboard]', err); });
}

function initContributions() {
  var el = document.querySelector('[data-contributions-list]');
  if (!el) return;
  apiFetch('/contributions?per_page=50').then(function (res) {
    if (res.data.length === 0) { el.innerHTML = '<p>No contributions yet.</p>'; return; }
    var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#6b7280;font-size:0.85rem">';
    html += '<th style="padding:8px 0">Date</th><th style="padding:8px 0;text-align:right">Amount</th><th style="padding:8px 0;text-align:right">Status</th>';
    html += '</tr></thead><tbody>';
    for (var i = 0; i < res.data.length; i++) {
      var c = res.data[i];
      html += '<tr style="border-top:1px solid #eee">';
      html += '<td style="padding:10px 0">' + escapeHtml(c.contribution_date) + '<br>';
      html += '<span style="color:#6b7280;font-size:0.8rem">' + escapeHtml(c.receipt_number || '') + '</span></td>';
      html += '<td style="padding:10px 0;text-align:right;font-weight:600">' + formatKsh(c.amount_minor) + '</td>';
      html += '<td style="padding:10px 0;text-align:right">' + escapeHtml(c.status) + '</td></tr>';
    }
    html += '</tbody></table>';
    el.innerHTML = html;
  }).catch(function (err) {
    el.innerHTML = '<p style="color:#ef4444">Failed to load: ' + escapeHtml(err.message) + '</p>';
  });
}

function initLoans() {
  var el = document.querySelector('[data-loans-list]');
  if (!el) return;
  apiFetch('/loans?per_page=50').then(function (res) {
    if (res.data.length === 0) { el.innerHTML = '<p>No loans yet.</p>'; return; }
    var html = '';
    for (var i = 0; i < res.data.length; i++) {
      var l = res.data[i];
      html += '<div style="padding:14px;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:12px">';
      html += '<div style="display:flex;justify-content:space-between;margin-bottom:8px">';
      html += '<strong>' + escapeHtml(l.reference) + '</strong>';
      html += '<span style="padding:2px 10px;background:#e0e7ff;border-radius:10px;font-size:0.78rem;text-transform:uppercase;font-weight:600">' + escapeHtml(l.status) + '</span></div>';
      html += '<div style="color:#6b7280;font-size:0.9rem;line-height:1.6">';
      html += 'Principal: <strong style="color:#111">' + formatKsh(l.principal_minor) + '</strong><br>';
      html += 'Outstanding: <strong style="color:#111">' + formatKsh(l.outstanding_minor) + '</strong><br>';
      html += 'Next due: ' + escapeHtml(l.next_due_date || 'None') + '</div></div>';
    }
    el.innerHTML = html;
  }).catch(function (err) {
    el.innerHTML = '<p style="color:#ef4444">Failed to load: ' + escapeHtml(err.message) + '</p>';
  });
}

document.addEventListener('DOMContentLoaded', function () {
  initShell();
  var isLogin = document.body.classList.contains('is-login');
  if (isLogin) { initLogin(); return; }
  if (!hasSession()) { window.location.href = 'index.html'; return; }
  initDashboard();
  initContributions();
  initLoans();
});

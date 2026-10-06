/* BODMAS CHAMAA - Admin Client */
'use strict';

var API_BASE = (function () {
  var h = window.location.hostname;
  return (h === 'localhost' || h === '127.0.0.1')
    ? 'http://localhost:8000'
    : 'https://api.bodmaschamaa.com';
})();

function sget(k) { return sessionStorage.getItem(k); }
function sset(k, v) { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); }
function getAT() { return sget('bmc_at'); }
function setAT(v) { sset('bmc_at', v); }
function getRT() { return sget('bmc_rt'); }
function setRT(v) { sset('bmc_rt', v); }
function getUser() {
  var r = sget('bmc_user');
  if (!r) return null;
  try { return JSON.parse(r); } catch (e) { return null; }
}
function setUser(v) { sset('bmc_user', v ? JSON.stringify(v) : null); }
function clearSession() { setAT(null); setRT(null); setUser(null); }
function hasSession() { return !!(getAT() || getRT()); }

function ApiClientError(code, message, status) {
  this.name = 'ApiClientError';
  this.code = code;
  this.message = message;
  this.status = status;
}
ApiClientError.prototype = Object.create(Error.prototype);

function tryRefresh() {
  return new Promise(function (resolve) {
    var rt = getRT();
    if (!rt) return resolve(false);
    fetch(API_BASE + '/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        if (!res.ok || !b || !b.ok) return resolve(false);
        setAT(b.data.access_token);
        setRT(b.data.refresh_token);
        resolve(true);
      });
    }).catch(function () { resolve(false); });
  });
}

function apiFetch(path, options) {
  options = options || {};
  var headers = options.headers || {};
  headers['Content-Type'] = 'application/json';
  var at = getAT();
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

function toast(msg, kind) {
  kind = kind || 'info';
  var box = document.getElementById('adminToast');
  if (!box) {
    box = document.createElement('div');
    box.id = 'adminToast';
    box.style.cssText = 'position:fixed;bottom:20px;left:50%;transform:translateX(-50%);background:#111;color:#fff;padding:12px 20px;border-radius:8px;font-size:14px;z-index:9999;max-width:90vw;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.3)';
    document.body.appendChild(box);
  }
  if (kind === 'error') box.style.background = '#b91c1c';
  else if (kind === 'success') box.style.background = '#047857';
  else box.style.background = '#111';
  box.textContent = msg;
  box.style.display = 'block';
  clearTimeout(toast._t);
  toast._t = setTimeout(function () { box.style.display = 'none'; }, 3200);
}

function busy(btn, label) {
  if (!btn) return;
  btn.disabled = true;
  btn.dataset.original = btn.dataset.original || btn.textContent;
  btn.textContent = label || 'Working...';
}
function unbusy(btn) {
  if (!btn) return;
  btn.disabled = false;
  if (btn.dataset.original) btn.textContent = btn.dataset.original;
}

function initShell() {
  var toggle = document.querySelector('.admin-menu-toggle');
  var sidebar = document.getElementById('adminSidebar');
  var overlay = document.getElementById('adminOverlay');

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

  var navLinks = document.querySelectorAll('.admin-nav a');
  for (var i = 0; i < navLinks.length; i++) {
    navLinks[i].addEventListener('click', function () {
      if (window.innerWidth < 1024) closeSidebar();
    });
  }

  var current = window.location.pathname.split('/').pop() || 'dashboard.html';
  var currentPath = window.location.pathname;
  for (var j = 0; j < navLinks.length; j++) {
    var href = navLinks[j].getAttribute('href');
    if (!href) continue;
    if (currentPath.endsWith(href.replace(/^\.\.\//, '/'))) navLinks[j].classList.add('active');
    else if (href.split('/').pop() === current && href.indexOf('/') === -1) navLinks[j].classList.add('active');
  }

  var u = getUser();
  var roleEl = document.querySelector('.admin-role');
  if (roleEl && u) roleEl.textContent = (u.roles && u.roles[0]) ? u.roles[0] : 'Admin';

  var logoutLink = document.querySelector('.admin-logout');
  if (logoutLink) logoutLink.addEventListener('click', function (e) {
    e.preventDefault();
    apiFetch('/auth/logout', { method: 'POST', body: { refresh_token: getRT() } })
      .catch(function () {})
      .then(function () {
        clearSession();
        var inSub = window.location.pathname.indexOf('/admin/') > -1 &&
                    window.location.pathname.replace(/.*\/admin\//, '').indexOf('/') > -1;
        window.location.href = inSub ? '../../admin/index.html' : 'index.html';
      });
  });
}

function initLogin() {
  if (hasSession()) { window.location.href = 'dashboard.html'; return; }
  var form = document.getElementById('adminLoginForm');
  if (!form) return;
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var email = form.querySelector('#adminEmail').value.trim();
    var password = form.querySelector('#adminPassword').value;
    var btn = form.querySelector('button[type="submit"]');
    busy(btn, 'Signing in...');
    fetch(API_BASE + '/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: email, password: password })
    }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (b) {
        if (!res.ok || !b || !b.ok) {
          toast((b && b.error && b.error.message) || 'Login failed', 'error');
          unbusy(btn);
          return;
        }
        setAT(b.data.access_token);
        setRT(b.data.refresh_token);
        setUser(b.data.user);
        window.location.href = 'dashboard.html';
      });
    }).catch(function (err) {
      toast('Network error: ' + err.message, 'error');
      unbusy(btn);
    });
  });
}

function initDashboard() {
  var membersEl = document.querySelector('[data-stat="members"]');
  if (!membersEl) return;

  Promise.all([
    apiFetch('/members?per_page=1').then(function (r) { return r.meta.total; }).catch(function () { return 0; }),
    apiFetch('/accounts/2000/balance').then(function (r) { return r.data.balance_minor; }).catch(function () { return 0; }),
    apiFetch('/loans?per_page=100&status=active').then(function (r) { return r.data; }).catch(function () { return []; }),
    apiFetch('/accounts/1000/balance').then(function (r) { return r.data.balance_minor; }).catch(function () { return 0; }),
    apiFetch('/expenses?per_page=1').then(function (r) { return r.meta.total; }).catch(function () { return 0; }),
    apiFetch('/contributions?per_page=1').then(function (r) { return r.meta.total; }).catch(function () { return 0; })
  ]).then(function (r) {
    var memberCount = r[0], savings = r[1], activeLoans = r[2], cash = r[3], expCount = r[4], contribCount = r[5];
    var loanOutstanding = activeLoans.reduce(function (s, l) { return s + (l.outstanding_minor || 0); }, 0);

    membersEl.textContent = memberCount;
    document.querySelector('[data-stat="savings"]').textContent = formatKsh(savings);
    document.querySelector('[data-stat="loans"]').textContent = formatKsh(loanOutstanding);
    document.querySelector('[data-stat="cash"]').textContent = formatKsh(cash);
    document.querySelector('[data-stat="contributions"]').textContent = contribCount;
    document.querySelector('[data-stat="expenses"]').textContent = expCount;

    var list = document.querySelector('[data-recent-loans]');
    if (list) {
      if (activeLoans.length === 0) list.innerHTML = '<p style="color:#6b7280">No active loans.</p>';
      else {
        var html = '';
        for (var i = 0; i < Math.min(activeLoans.length, 5); i++) {
          var l = activeLoans[i];
          html += '<div style="padding:10px 0;border-bottom:1px solid #eee;display:flex;justify-content:space-between">';
          html += '<div><strong>' + escapeHtml(l.reference) + '</strong><br>';
          html += '<span style="color:#6b7280;font-size:0.85rem">' + escapeHtml(l.member_name || '') + '</span></div>';
          html += '<span style="font-weight:600">' + formatKsh(l.outstanding_minor) + '</span></div>';
        }
        list.innerHTML = html;
      }
    }
  }).catch(function (err) {
    console.error('[admin dashboard]', err);
    toast('Failed to load dashboard: ' + err.message, 'error');
  });
}

function initMembers() {
  var listEl = document.querySelector('[data-members-list]');
  if (!listEl) return;

  function load() {
    listEl.innerHTML = '<p>Loading...</p>';
    var q = document.querySelector('[data-members-search]');
    var query = q ? q.value.trim() : '';
    var url = '/members?per_page=100' + (query ? '&q=' + encodeURIComponent(query) : '');
    apiFetch(url).then(function (res) {
      if (res.data.length === 0) {
        listEl.innerHTML = '<p style="color:#6b7280">No members found.</p>';
        return;
      }
      var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#6b7280;font-size:0.85rem">';
      html += '<th style="padding:8px 4px">Member #</th><th style="padding:8px 4px">Name</th><th style="padding:8px 4px;text-align:right">Status</th>';
      html += '</tr></thead><tbody>';
      for (var i = 0; i < res.data.length; i++) {
        var m = res.data[i];
        html += '<tr style="border-top:1px solid #eee">';
        html += '<td style="padding:10px 4px;font-family:monospace;font-size:0.85rem">' + escapeHtml(m.member_number || '-') + '</td>';
        html += '<td style="padding:10px 4px"><strong>' + escapeHtml(m.full_name) + '</strong>';
        if (m.phone) html += '<br><span style="color:#6b7280;font-size:0.8rem">' + escapeHtml(m.phone) + '</span>';
        html += '</td>';
        html += '<td style="padding:10px 4px;text-align:right"><span style="padding:2px 8px;border-radius:10px;font-size:0.75rem;background:#e0f2fe;color:#0369a1;font-weight:600">' + escapeHtml(m.status) + '</span></td>';
        html += '</tr>';
      }
      html += '</tbody></table>';
      listEl.innerHTML = html;
    }).catch(function (err) {
      listEl.innerHTML = '<p style="color:#ef4444">' + escapeHtml(err.message) + '</p>';
    });
  }

  var search = document.querySelector('[data-members-search]');
  if (search) {
    var t;
    search.addEventListener('input', function () {
      clearTimeout(t);
      t = setTimeout(load, 300);
    });
  }

  var form = document.querySelector('[data-member-form]');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, 'Creating...');
      var body = {
        full_name: form.elements.full_name.value.trim(),
        phone: form.elements.phone.value.trim() || null,
        email: form.elements.email.value.trim() || null,
        address: form.elements.address.value.trim() || null,
        gender: form.elements.gender.value || null,
        joined_on: form.elements.joined_on.value || null
      };
      apiFetch('/members', { method: 'POST', body: body }).then(function (res) {
        toast('Member created: ' + res.data.member_number, 'success');
        form.reset();
        unbusy(btn);
        load();
      }).catch(function (err) {
        toast(err.message, 'error');
        unbusy(btn);
      });
    });
  }

  load();
}

function initContributions() {
  var listEl = document.querySelector('[data-contributions-list]');
  if (!listEl) return;

  function load() {
    listEl.innerHTML = '<p>Loading...</p>';
    apiFetch('/contributions?per_page=100').then(function (res) {
      if (res.data.length === 0) {
        listEl.innerHTML = '<p style="color:#6b7280">No contributions yet.</p>';
        return;
      }
      var html = '<table style="width:100%;border-collapse:collapse"><thead><tr style="text-align:left;color:#6b7280;font-size:0.85rem">';
      html += '<th style="padding:8px 4px">Date</th><th style="padding:8px 4px">Member</th><th style="padding:8px 4px">Receipt</th>';
      html += '<th style="padding:8px 4px;text-align:right">Amount</th><th style="padding:8px 4px;text-align:right">Status</th></tr></thead><tbody>';
      for (var i = 0; i < res.data.length; i++) {
        var c = res.data[i];
        html += '<tr style="border-top:1px solid #eee">';
        html += '<td style="padding:10px 4px;font-size:0.85rem">' + escapeHtml(c.contribution_date) + '</td>';
        html += '<td style="padding:10px 4px">' + escapeHtml(c.member_name || '') + '</td>';
        html += '<td style="padding:10px 4px;font-family:monospace;font-size:0.75rem">' + escapeHtml(c.receipt_number || '') + '</td>';
        html += '<td style="padding:10px 4px;text-align:right;font-weight:600">' + formatKsh(c.amount_minor) + '</td>';
        html += '<td style="padding:10px 4px;text-align:right;font-size:0.8rem">' + escapeHtml(c.status) + '</td></tr>';
      }
      html += '</tbody></table>';
      listEl.innerHTML = html;
    }).catch(function (err) {
      listEl.innerHTML = '<p style="color:#ef4444">' + escapeHtml(err.message) + '</p>';
    });
  }

  var form = document.querySelector('[data-contribution-form]');
  if (form) {
    // Load members into select
    apiFetch('/members?per_page=100').then(function (res) {
      var sel = form.elements.member_id;
      for (var i = 0; i < res.data.length; i++) {
        var m = res.data[i];
        var opt = document.createElement('option');
        opt.value = m.id;
        opt.textContent = (m.member_number || '') + ' - ' + m.full_name;
        sel.appendChild(opt);
      }
    });

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, 'Recording...');
      var body = {
        member_id: form.elements.member_id.value,
        plan_id: form.elements.plan_id.value || null,
        amount_minor: Math.round(Number(form.elements.amount.value) * 100),
        currency: 'KES',
        contribution_date: form.elements.date.value,
        period_label: form.elements.period_label.value || null,
        payment_reference: form.elements.ref.value || null
      };
      apiFetch('/contributions', { method: 'POST', body: body }).then(function (res) {
        toast('Recorded. Receipt: ' + res.data.receipt_number, 'success');
        form.reset();
        unbusy(btn);
        load();
      }).catch(function (err) {
        toast(err.message, 'error');
        unbusy(btn);
      });
    });
  }

  load();
}

function initLoans() {
  var listEl = document.querySelector('[data-loans-list]');
  if (!listEl) return;

  function load() {
    listEl.innerHTML = '<p>Loading...</p>';
    apiFetch('/loans?per_page=100').then(function (res) {
      if (res.data.length === 0) {
        listEl.innerHTML = '<p style="color:#6b7280">No loans.</p>';
        return;
      }
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var l = res.data[i];
        html += '<div style="padding:14px;border:1px solid #d7dde3;border-radius:8px;margin-bottom:12px;background:#fff">';
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;flex-wrap:wrap;gap:8px">';
        html += '<strong>' + escapeHtml(l.reference) + '</strong>';
        html += '<span style="padding:2px 10px;background:#e0e7ff;border-radius:10px;font-size:0.75rem;text-transform:uppercase;font-weight:600">' + escapeHtml(l.status) + '</span>';
        html += '</div>';
        html += '<div style="color:#6b7280;font-size:0.9rem;line-height:1.7">';
        html += 'Member: <strong style="color:#111">' + escapeHtml(l.member_name || '') + '</strong><br>';
        html += 'Principal: <strong style="color:#111">' + formatKsh(l.principal_minor) + '</strong> &nbsp; Outstanding: <strong style="color:#111">' + formatKsh(l.outstanding_minor) + '</strong>';
        html += '</div>';
        html += '<div style="margin-top:10px;display:flex;gap:8px;flex-wrap:wrap">';
        if (l.status === 'submitted' || l.status === 'under_review') {
          html += '<button data-action="approve" data-id="' + l.id + '" style="padding:8px 14px;background:#0b7fab;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Approve</button>';
        }
        if (l.status === 'approved') {
          html += '<button data-action="disburse" data-id="' + l.id + '" style="padding:8px 14px;background:#10b981;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Disburse</button>';
        }
        if (l.status === 'active') {
          html += '<button data-action="repay" data-id="' + l.id + '" data-outstanding="' + l.outstanding_minor + '" style="padding:8px 14px;background:#f7931e;color:#111;border:none;border-radius:6px;font-weight:600;cursor:pointer">Record Repayment</button>';
        }
        html += '</div></div>';
      }
      listEl.innerHTML = html;

      var buttons = listEl.querySelectorAll('button[data-action]');
      for (var k = 0; k < buttons.length; k++) {
        buttons[k].addEventListener('click', handleLoanAction);
      }
    }).catch(function (err) {
      listEl.innerHTML = '<p style="color:#ef4444">' + escapeHtml(err.message) + '</p>';
    });
  }

  function handleLoanAction(e) {
    var btn = e.currentTarget;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    if (action === 'repay') {
      var raw = prompt('Repayment amount in KSh (outstanding ' + (btn.dataset.outstanding / 100) + '):', (btn.dataset.outstanding / 100).toFixed(2));
      if (!raw) return;
      var amount = Math.round(Number(raw) * 100);
      if (!amount || amount <= 0) { toast('Invalid amount', 'error'); return; }
      busy(btn, 'Recording...');
      apiFetch('/loans/' + id + '/repay', {
        method: 'POST',
        body: { amount_minor: amount, payment_method: 'cash' }
      }).then(function (res) {
        toast('Repayment recorded. Receipt: ' + res.data.receipt_number, 'success');
        load();
      }).catch(function (err) { toast(err.message, 'error'); unbusy(btn); });
      return;
    }

    if (!confirm('Confirm "' + action + '" for ' + id + '?')) return;
    busy(btn, '...');
    var path = '/loans/' + id + '/' + action;
    apiFetch(path, { method: 'POST', body: action === 'disburse' ? { method: 'cash' } : {} })
      .then(function (res) {
        toast(action + ' OK', 'success');
        load();
      }).catch(function (err) { toast(err.message, 'error'); unbusy(btn); });
  }

  load();
}

function initExpenses() {
  var listEl = document.querySelector('[data-expenses-list]');
  if (!listEl) return;

  function load() {
    listEl.innerHTML = '<p>Loading...</p>';
    apiFetch('/expenses?per_page=100').then(function (res) {
      if (res.data.length === 0) { listEl.innerHTML = '<p style="color:#6b7280">No expenses.</p>'; return; }
      var html = '';
      for (var i = 0; i < res.data.length; i++) {
        var x = res.data[i];
        html += '<div style="padding:14px;border:1px solid #d7dde3;border-radius:8px;margin-bottom:10px;background:#fff">';
        html += '<div style="display:flex;justify-content:space-between;margin-bottom:6px;flex-wrap:wrap;gap:8px">';
        html += '<strong>' + escapeHtml(x.description) + '</strong>';
        html += '<span style="padding:2px 10px;background:#e0e7ff;border-radius:10px;font-size:0.75rem;text-transform:uppercase;font-weight:600">' + escapeHtml(x.status) + '</span></div>';
        html += '<div style="color:#6b7280;font-size:0.85rem">' + escapeHtml(x.category) + ' &middot; ' + escapeHtml(x.paid_at) + ' &middot; ' + escapeHtml(x.payment_method) + '</div>';
        html += '<div style="margin-top:8px;font-weight:700;font-size:1.1rem;color:#0b7fab">' + formatKsh(x.amount_minor) + '</div>';
        if (x.status === 'pending') {
          html += '<div style="margin-top:10px"><button data-action="approve-exp" data-id="' + x.id + '" style="padding:8px 14px;background:#10b981;color:#fff;border:none;border-radius:6px;font-weight:600;cursor:pointer">Approve</button></div>';
        }
        html += '</div>';
      }
      listEl.innerHTML = html;
      listEl.querySelectorAll('button[data-action="approve-exp"]').forEach(function (btn) {
        btn.addEventListener('click', function () {
          if (!confirm('Approve this expense?')) return;
          busy(btn, '...');
          apiFetch('/expenses/' + btn.dataset.id + '/approve', { method: 'POST', body: {} })
            .then(function () { toast('Expense approved', 'success'); load(); })
            .catch(function (err) { toast(err.message, 'error'); unbusy(btn); });
        });
      });
    }).catch(function (err) { listEl.innerHTML = '<p style="color:#ef4444">' + escapeHtml(err.message) + '</p>'; });
  }

  var form = document.querySelector('[data-expense-form]');
  if (form) {
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var btn = form.querySelector('button[type="submit"]');
      busy(btn, 'Recording...');
      var body = {
        category: form.elements.category.value.trim(),
        description: form.elements.description.value.trim(),
        payee: form.elements.payee.value.trim() || null,
        amount_minor: Math.round(Number(form.elements.amount.value) * 100),
        payment_method: form.elements.payment_method.value,
        paid_at: form.elements.paid_at.value
      };
      apiFetch('/expenses', { method: 'POST', body: body }).then(function () {
        toast('Expense recorded', 'success');
        form.reset();
        unbusy(btn);
        load();
      }).catch(function (err) { toast(err.message, 'error'); unbusy(btn); });
    });
  }

  load();
}

document.addEventListener('DOMContentLoaded', function () {
  initShell();
  var isLogin = document.body.classList.contains('is-login');
  if (isLogin) { initLogin(); return; }
  if (!hasSession()) {
    var inSub = window.location.pathname.replace(/.*\/admin\//, '').indexOf('/') > -1;
    window.location.href = inSub ? '../../admin/index.html' : 'index.html';
    return;
  }
  initDashboard();
  initMembers();
  initContributions();
  initLoans();
  initExpenses();
});

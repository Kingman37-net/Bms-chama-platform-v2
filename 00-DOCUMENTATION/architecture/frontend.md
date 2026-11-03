# BODMAS CHAMAA — Frontend Architecture

> **Version:** 0.1.0 (Phase 6A)
> **Status:** Blueprint

---

## 1. Three Zones, One API

```

+-------------------+   +-------------------+   +-------------------+

|  Public Website   |   |  Member Portal    |   |   Admin System    |

|  (docs/)          |   |  (member/)        |   |   (admin/)        |
+---------+---------+   +---------+---------+   +---------+---------+

```

**Rules:**
- Public website NEVER calls authenticated endpoints.
- Member Portal NEVER calls admin endpoints.
- Admin System can call any endpoint (subject to its own permissions).
- Each zone is statically hosted — no server-side rendering.

---

## 2. Current Stack (V1)

- HTML5
- CSS3 (custom, no framework)
- Vanilla JavaScript (ES2020)
- Fetch API for HTTP
- No build step

**Reason:** Prove the business model with minimal tooling.
A framework (React/Vue/Svelte) may be introduced later if complexity justifies it.

---

## 3. Shared vs Zone-Specific

| File | Purpose |
|---|---|
| `docs/assets/css/style.css` | Public site styles |
| `docs/assets/js/main.js` | Public site behaviour |
| `member/assets/css/member.css` | Member portal styles |
| `member/assets/js/member.js` | Member portal behaviour |
| `admin/assets/css/admin.css` | Admin system styles |
| `admin/assets/js/admin.js` | Admin system behaviour |

**No cross-zone CSS or JS.** Each zone is fully self-contained.

---

## 4. Templates

Templates live at `templates/` and are injected into zone HTML files by
`scripts/apply_templates.py`.

| Template | Used by |
|---|---|
| `nav.html` | Public site |
| `footer.html` | Public site |
| `member-nav.html` | Member portal (topbar + sidebar + overlay) |
| `member-footer.html` | Member portal |
| `admin-nav.html` | Admin system (topbar + sidebar + overlay) |
| `admin-footer.html` | Admin system |

The script supports a `{{ROOT}}` placeholder that expands to the correct
number of `../` based on file depth. This allows a template to link to files
outside its zone (e.g. admin → public site) without hardcoding paths.

---

## 5. API Client Convention (future)

Each zone will get a small `api.js` module. It wraps `fetch` with:

- Base URL (from a `<meta name="api-base">` tag)
- Authorization header injection (member/admin only)
- JSON serialization
- Standard error handling
- Request ID propagation

Example shape:
```js
// member/assets/js/api.js
const API_BASE = document.querySelector('meta[name="api-base"]').content;

async function apiFetch(path, options = {}) {
  const token = localStorage.getItem('access_token');
  const res = await fetch(`${API_BASE}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': token ? `Bearer ${token}` : '',
      ...options.headers
    }
  });
  const body = await res.json();
  if (!body.ok) throw new ApiError(body.error);
  return body.data;
}
```

---

6. Auth Storage (V1 plan)

Token Storage Reason
access_token in-memory variable (JS module scope) immune to XSS via localStorage
refresh_token httpOnly, Secure, SameSite=Strict cookie immune to JS access

Note: Since the member/admin portals are statically hosted, cookie-based
refresh requires either the API and the site to be on the same domain
(Cloudflare Pages + Workers, both bodmaschamaa.com) — which is the target
deployment for Phase 9.

Until then, the portals ship with mock data.

---

7. State Management

No framework → no global state store.

Rules:

· Each page owns its own data fetch on load.
· Cross-page state is limited to the access token (in-memory per session).
· No localStorage of financial data.
· No caching of private data outside the current page's lifetime.

---

8. Mobile-First Design

Every zone must be fully usable at 360px width.

Patterns:

· Hamburger opens a slide-in sidebar (member + admin)
· Tables collapse to stacked cards on small screens (future)
· Forms use native inputs (no fake select boxes)
· Touch targets ≥ 44 × 44 px
· No hover-only interactions

---

9. Accessibility

· Semantic HTML (<header>, <nav>, <main>, <section>, <aside>)
· ARIA labels on icon-only buttons
· Focus order matches visual order
· Skip-to-content link (future)
· Contrast ratio ≥ 4.5:1 for body text
· All forms have visible labels

---

10. Progressive Enhancement

The site must work without JavaScript for content pages.
JavaScript enhances:

· Mobile drawer toggling
· Form submission via fetch
· Live validation

If JS is disabled:

· Public pages: fully readable
· Login forms: submit to a fallback route that returns a plain HTML response

---

11. Future Migration (React/Vue/Svelte)

Trigger conditions for adopting a framework:

· Repeated state management bugs
· More than 30 interactive components
· Need for offline-first or real-time updates
· Team grows beyond 2 developers

Migration path:

1. Freeze V1 templates as "legacy"
2. Build new portal in a framework alongside
3. Cut over zone by zone (public first, then member, then admin)
4. Retire legacy HTML only after 3 months of stable parallel operation

---

12. What This Document Is NOT

· Not a design system (see future documentation/design/)
· Not a UI/UX spec
· Not a performance budget (see documentation/operations/)
  EOF


#!/usr/bin/env python3
"""
BODMAS CHAMAA — Multi-Zone Template & Asset Injector
----------------------------------------------------
Injects shared nav, footer, CSS link and JS script into HTML files
across multiple zones (public site, member portal, admin system).

Each zone has its own templates and its own CSS/JS bundle.
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATES = ROOT / "templates"

ZONES = [
    {
        "name": "public",
        "root": ROOT / "docs",
        "nav_file": "nav.html",
        "footer_file": "footer.html",
        "css": "assets/css/style.css",
        "js": "assets/js/main.js",
        "skip_files": set(),
        "exclude_dirs": {"assets"},
        "prefix_style": "public",
    },
    {
        "name": "member",
        "root": ROOT / "member",
        "nav_file": "member-nav.html",
        "footer_file": "member-footer.html",
        "css": "assets/css/member.css",
        "js": "assets/js/member.js",
        "skip_files": {"index.html"},
        "exclude_dirs": {"assets"},
        "prefix_style": "member",
    },
    {
        "name": "admin",
        "root": ROOT / "admin",
        "nav_file": "admin-nav.html",
        "footer_file": "admin-footer.html",
        "css": "assets/css/admin.css",
        "js": "assets/js/admin.js",
        "skip_files": {"index.html"},
        "exclude_dirs": {"assets"},
        "prefix_style": "admin",
    },
]

RE_STYLE = re.compile(r"<style\b[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
RE_NAV = re.compile(r'<nav\s+class="navbar".*?</nav>', re.DOTALL | re.IGNORECASE)
RE_MEMBER_TOPBAR = re.compile(r'<header\s+class="member-topbar".*?</header>', re.DOTALL | re.IGNORECASE)
RE_MEMBER_SIDEBAR = re.compile(r'<aside\s+class="member-sidebar".*?</aside>', re.DOTALL | re.IGNORECASE)
RE_MEMBER_OVERLAY = re.compile(r'<div\s+class="member-overlay".*?</div>', re.DOTALL | re.IGNORECASE)
RE_ADMIN_TOPBAR = re.compile(r'<header\s+class="admin-topbar".*?</header>', re.DOTALL | re.IGNORECASE)
RE_ADMIN_SIDEBAR = re.compile(r'<aside\s+class="admin-sidebar".*?</aside>', re.DOTALL | re.IGNORECASE)
RE_ADMIN_OVERLAY = re.compile(r'<div\s+class="admin-overlay".*?</div>', re.DOTALL | re.IGNORECASE)
RE_FOOTER = re.compile(r"<footer\b.*?</footer>", re.DOTALL | re.IGNORECASE)
RE_CSS_LINK = re.compile(r'<link\s+rel="stylesheet"\s+href="[^"]*"[^>]*>', re.IGNORECASE)
RE_JS_SCRIPT = re.compile(r'<script\s+src="[^"]*assets/js/[^"]*"[^>]*>\s*</script>', re.IGNORECASE)

SKIP_LINK_PREFIX = r"(?!#|https?:|mailto:|tel:|\.\./|/)"


def prefix_links(html: str, prefix: str) -> str:
    if not prefix:
        return html
    return re.sub(rf'href="{SKIP_LINK_PREFIX}', f'href="{prefix}', html)


def process_file(html_path: Path, zone: dict) -> bool:
    original = html_path.read_text(encoding="utf-8")
    content = original

    rel = html_path.relative_to(zone["root"])
    depth = len(rel.parts) - 1
    prefix = "../" * depth

    is_skipped = html_path.name in zone["skip_files"]

    content = RE_STYLE.sub("", content)
    content = RE_NAV.sub("", content)
    content = RE_MEMBER_TOPBAR.sub("", content)
    content = RE_MEMBER_SIDEBAR.sub("", content)
    content = RE_MEMBER_OVERLAY.sub("", content)
    content = RE_ADMIN_TOPBAR.sub("", content)
    content = RE_ADMIN_SIDEBAR.sub("", content)
    content = RE_ADMIN_OVERLAY.sub("", content)
    content = RE_FOOTER.sub("", content)

    content = RE_CSS_LINK.sub("", content)
    css_href = prefix + zone["css"]
    css_tag = f'  <link rel="stylesheet" href="{css_href}">\n'
    content = re.sub(r"</head>", css_tag + "</head>", content, count=1, flags=re.IGNORECASE)

    content = RE_JS_SCRIPT.sub("", content)
    js_src = prefix + zone["js"]
    js_tag = f'  <script src="{js_src}" defer></script>\n'
    content = re.sub(r"</body>", js_tag + "</body>", content, count=1, flags=re.IGNORECASE)

    if is_skipped:
        if content != original:
            html_path.write_text(content, encoding="utf-8")
            return True
        return False

    # ROOT prefix — how many "../" to climb OUT of the zone to reach repo root
    # depth 0 in member/admin means one "../" gets to root (sibling docs/)
    if zone["name"] == "public":
        root_prefix = ""  # public zone never references outside docs/
    else:
        root_prefix = "../" * (depth + 1)

    nav_html = (TEMPLATES / zone["nav_file"]).read_text(encoding="utf-8").strip()
    nav_html = nav_html.replace("{{ROOT}}", root_prefix)
    nav_html = prefix_links(nav_html, prefix)
    content = re.sub(
        r"(<body[^>]*>)",
        r"\1\n" + nav_html + "\n",
        content, count=1, flags=re.IGNORECASE,
    )

    footer_html = (TEMPLATES / zone["footer_file"]).read_text(encoding="utf-8").strip()
    footer_html = footer_html.replace("{{ROOT}}", root_prefix)
    footer_html = prefix_links(footer_html, prefix)
    content = re.sub(
        r"</body>",
        footer_html + "\n</body>",
        content, count=1, flags=re.IGNORECASE,
    )

    if content != original:
        html_path.write_text(content, encoding="utf-8")
        return True
    return False


def process_zone(zone: dict):
    print(f"\n[{zone['name']}] root: {zone['root'].relative_to(ROOT)}")
    exclude = zone.get("exclude_dirs", set())
    changed, total = 0, 0
    for html_path in sorted(zone["root"].rglob("*.html")):
        rel_parts = html_path.relative_to(zone["root"]).parts
        if any(part in exclude for part in rel_parts):
            continue
        total += 1
        if process_file(html_path, zone):
            changed += 1
            print(f"  updated   {html_path.relative_to(ROOT)}")
        else:
            print(f"  unchanged {html_path.relative_to(ROOT)}")
    print(f"  → {changed}/{total} files updated")


def main():
    for zone in ZONES:
        if not zone["root"].exists():
            print(f"\n[{zone['name']}] skipped — folder does not exist")
            continue
        process_zone(zone)
    print("\nDone.")


if __name__ == "__main__":
    main()

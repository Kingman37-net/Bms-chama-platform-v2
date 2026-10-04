#!/usr/bin/env python3
"""
BODMAS CHAMAA — Template & Asset Injector
------------------------------------------
Applies shared nav, footer, CSS link and JS script to every HTML file
inside docs/ (public website). Handles any folder depth correctly and
skips links that already start with ../ or are absolute/protocol links.

Safe to run repeatedly (idempotent).
"""

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
TEMPLATE_DIR = ROOT / "templates"
DOCS_DIR = ROOT / "docs"

NAV = (TEMPLATE_DIR / "nav.html").read_text(encoding="utf-8").strip()
FOOTER = (TEMPLATE_DIR / "footer.html").read_text(encoding="utf-8").strip()

CSS_LINK_TEMPLATE = '<link rel="stylesheet" href="{prefix}assets/css/style.css">'
JS_SCRIPT_TEMPLATE = '<script src="{prefix}assets/js/main.js" defer></script>'

RE_STYLE = re.compile(r"<style\b[^>]*>.*?</style>", re.DOTALL | re.IGNORECASE)
RE_NAV = re.compile(r'<nav\s+class="navbar".*?</nav>', re.DOTALL | re.IGNORECASE)
RE_FOOTER = re.compile(r"<footer\b.*?</footer>", re.DOTALL | re.IGNORECASE)
RE_CSS_LINK = re.compile(
    r'<link\s+rel="stylesheet"\s+href="[^"]*assets/css/style\.css"[^>]*>',
    re.IGNORECASE,
)
RE_JS_SCRIPT = re.compile(
    r'<script\s+src="[^"]*assets/js/main\.js"[^>]*>\s*</script>',
    re.IGNORECASE,
)

# Skip these link prefixes when applying relative-depth prefixing
SKIP_LINK_PREFIX = r"(?!#|https?:|mailto:|tel:|\.\./|/)"


def compute_depth(html_path: Path) -> int:
    return len(html_path.relative_to(DOCS_DIR).parts) - 1


def prefix_for(depth: int) -> str:
    return "../" * depth


def apply_prefix_to_links(html: str, prefix: str) -> str:
    if not prefix:
        return html
    return re.sub(
        rf'href="{SKIP_LINK_PREFIX}',
        f'href="{prefix}',
        html,
    )


def process(html_path: Path) -> bool:
    original = html_path.read_text(encoding="utf-8")
    content = original

    depth = compute_depth(html_path)
    prefix = prefix_for(depth)

    # 1. Strip inline styles and existing nav/footer
    content = RE_STYLE.sub("", content)
    content = RE_NAV.sub("", content)
    content = RE_FOOTER.sub("", content)

    # 2. Insert CSS link before </head>
    content = RE_CSS_LINK.sub("", content)
    css_tag = "  " + CSS_LINK_TEMPLATE.format(prefix=prefix) + "\n"
    content = re.sub(r"</head>", css_tag + "</head>", content, count=1, flags=re.IGNORECASE)

    # 3. Insert JS before </body>
    content = RE_JS_SCRIPT.sub("", content)
    js_tag = "  " + JS_SCRIPT_TEMPLATE.format(prefix=prefix) + "\n"
    content = re.sub(r"</body>", js_tag + "</body>", content, count=1, flags=re.IGNORECASE)

    # 4. Insert nav after <body>
    nav = apply_prefix_to_links(NAV, prefix)
    content = re.sub(
        r"(<body[^>]*>)",
        r"\1\n" + nav + "\n",
        content,
        count=1,
        flags=re.IGNORECASE,
    )

    # 5. Insert footer before </body>
    footer = apply_prefix_to_links(FOOTER, prefix)
    content = re.sub(
        r"</body>",
        footer + "\n</body>",
        content,
        count=1,
        flags=re.IGNORECASE,
    )

    if content != original:
        html_path.write_text(content, encoding="utf-8")
        return True
    return False


def main():
    changed, total = 0, 0
    for html_path in sorted(DOCS_DIR.rglob("*.html")):
        total += 1
        if process(html_path):
            changed += 1
            print(f"  updated   {html_path.relative_to(ROOT)}")
        else:
            print(f"  unchanged {html_path.relative_to(ROOT)}")
    print(f"\nDone. {changed}/{total} files updated.")


if __name__ == "__main__":
    main()

import re
from pathlib import Path

# Paths
TEMPLATE_DIR = Path(__file__).parent.parent / 'templates'
DOCS_DIR = Path(__file__).parent.parent / 'docs'

nav_html = (TEMPLATE_DIR / 'nav.html').read_text(encoding='utf-8')
footer_html = (TEMPLATE_DIR / 'footer.html').read_text(encoding='utf-8')

# For each HTML file
for html_path in DOCS_DIR.glob('*.html'):
    content = html_path.read_text(encoding='utf-8')
    
    # Remove existing nav block (any <nav class="navbar">...</nav>)
    content = re.sub(r'<nav\s+class="navbar">.*?</nav>', '', content, flags=re.DOTALL | re.IGNORECASE)
    # Remove existing footer block (any <footer>...</footer>)
    content = re.sub(r'<footer>.*?</footer>', '', content, flags=re.DOTALL | re.IGNORECASE)
    
    # Insert new nav after <body>
    content = re.sub(r'(<body[^>]*>)', r'\1\n' + nav_html, content, flags=re.IGNORECASE)
    # Insert new footer before </body>
    content = re.sub(r'(</body>)', footer_html + r'\n\1', content, flags=re.IGNORECASE)
    
    html_path.write_text(content, encoding='utf-8')
    print(f"✅ Updated {html_path.name}")

print("All pages updated with fresh nav and footer from templates.")

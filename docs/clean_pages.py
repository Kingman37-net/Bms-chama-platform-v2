import os
import re
import html
from pathlib import Path

for filepath in Path('.').glob('*.html'):
    if filepath.name == 'clean_pages.py':
        continue
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    
    match = re.search(r'data-code="([^"]*)"', content)
    if match:
        encoded = match.group(1)
        decoded = html.unescape(encoded)
        with open(filepath, 'w', encoding='utf-8') as f:
            f.write(decoded)
        print(f"✅ Cleaned {filepath}")
    else:
        print(f"⚠️ No data-code in {filepath}, skipped.")

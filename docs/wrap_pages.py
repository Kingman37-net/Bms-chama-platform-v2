import os
import re
from pathlib import Path

TEMPLATE_HEAD = '''<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>BODMAS CHAMAA</title>
</head>
<body>
'''

TEMPLATE_FOOT = '''
</body>
</html>
'''

for filepath in Path('.').glob('*.html'):
    if filepath.name in ('wrap_pages.py', 'clean_pages.py'):
        continue
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()
    # If it already has a DOCTYPE, skip
    if re.search(r'<!DOCTYPE\s+html', content, re.IGNORECASE):
        print(f"✅ {filepath} is already a full page, skipped.")
        continue
    # Otherwise, wrap it
    new_content = TEMPLATE_HEAD + content + TEMPLATE_FOOT
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(new_content)
    print(f"🔁 Wrapped {filepath}")

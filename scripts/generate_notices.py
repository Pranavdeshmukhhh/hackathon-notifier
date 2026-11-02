"""Retain the complete license texts of JavaScript libraries shipped in the SPA."""
import argparse
from pathlib import Path
import json

ROOT = Path(__file__).resolve().parents[1]
PACKAGES = ['react', 'react-dom', 'scheduler', 'lucide-react']


def notices():
    manifest = json.loads((ROOT / 'Frontend/package.json').read_text())
    if set(manifest['dependencies']) != {'@tailwindcss/vite', 'react', 'react-dom', 'lucide-react'}:
        raise ValueError('Runtime dependencies changed: review the shipped license inventory')
    sections = ['Hackathon Notifier — shipped JavaScript third-party notices\n'
                'Font licenses are distributed alongside the fonts in /fonts/.\n']
    for package in PACKAGES:
        folder = ROOT / 'Frontend/node_modules' / package
        metadata = json.loads((folder / 'package.json').read_text())
        candidates = [folder / name for name in ['LICENSE', 'LICENSE.txt', 'LICENSE.md']]
        license_path = next((path for path in candidates if path.is_file()), None)
        if license_path is None:
            raise ValueError('Missing distributed license: ' + package)
        sections.append(f"\n--- {package} {metadata['version']} ---\n" + license_path.read_text().strip() + '\n')
    return '\n'.join(sections)


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    target = ROOT / 'Frontend/public/THIRD_PARTY_NOTICES.txt'
    generated = notices()
    if args.check:
        if not target.is_file() or target.read_text() != generated:
            raise SystemExit('Third-party notices are stale; run python scripts/generate_notices.py')
    else:
        target.write_text(generated)
    print('Shipped license texts verified' if args.check else 'Shipped license texts generated')

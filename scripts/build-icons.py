#!/usr/bin/env python3
"""Baut ein schlankes Font-Awesome-Subset nur mit den Symbolen, die die App wirklich nutzt.

Ergebnis (wird wie vendor/tailwind.css mit eingecheckt):
  vendor/fontawesome/css/icons.min.css      (Basis-Regeln + benutzte Symbole)
  vendor/fontawesome/webfonts/fa-solid-subset.woff2

Quelle ist vendor/fontawesome/source/ (Original Font Awesome Free 6.7.2).
Nach dem Hinzufügen neuer Symbole in index.html/app.js: npm run build:icons
Benötigt: pip install fonttools brotli
"""
import pathlib
import re
import sys

from fontTools import subset

ROOT = pathlib.Path(__file__).resolve().parent.parent
SRC_CSS = ROOT / 'vendor/fontawesome/source/all.min.css'
SRC_FONT = ROOT / 'vendor/fontawesome/source/fa-solid-900.woff2'
OUT_CSS = ROOT / 'vendor/fontawesome/css/icons.min.css'
OUT_FONT = ROOT / 'vendor/fontawesome/webfonts/fa-solid-subset.woff2'
SCAN = ['index.html', 'app.js']
# Symbole, deren Namen im Code zusammengesetzt werden (z.B. `fa-${d.l ? 'lock' : 'lock-open'}`)
EXTRA = {'fa-lock', 'fa-lock-open'}

used = set(EXTRA)
for name in SCAN:
    used |= set(re.findall(r'fa-[a-z0-9-]+', (ROOT / name).read_text(encoding='utf-8')))

css = SRC_CSS.read_text(encoding='utf-8')
rules, codepoints, found = [], set(), set()
for selectors, value in re.findall(r'([^{}]+)\{--fa:"\\([0-9a-f]+)"\}', css):
    keep = [sel for sel in selectors.split(',') if sel.startswith('.') and sel[1:] in used]
    if keep:
        rules.append(f'{",".join(keep)}{{--fa:"\\{value}"}}')
        codepoints.add(int(value, 16))
        found |= {sel[1:] for sel in keep}

missing = sorted(used - found)
if missing:
    sys.exit(f'Unbekannte Symbole (Tippfehler?): {", ".join(missing)}')

base = (
    '/*! Font Awesome Free 6.7.2 (Subset) by @fontawesome - https://fontawesome.com '
    'License - https://fontawesome.com/license/free (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License) */\n'
    '@font-face{font-family:"Font Awesome 6 Free";font-style:normal;font-weight:900;font-display:block;'
    'src:url(../webfonts/fa-solid-subset.woff2) format("woff2")}'
    '.fas{-moz-osx-font-smoothing:grayscale;-webkit-font-smoothing:antialiased;display:inline-block;'
    'font-style:normal;font-variant:normal;line-height:1;text-rendering:auto;'
    'font-family:"Font Awesome 6 Free";font-weight:900}'
    '.fas:before{content:var(--fa)}'
)
OUT_CSS.write_text(base + ''.join(sorted(rules)) + '\n', encoding='utf-8')

OUT_FONT.parent.mkdir(parents=True, exist_ok=True)
opts = subset.Options()
opts.flavor = 'woff2'
opts.layout_features = []
opts.name_IDs = ['*']
font = subset.load_font(str(SRC_FONT), opts)
sub = subset.Subsetter(opts)
sub.populate(unicodes=codepoints)
sub.subset(font)
subset.save_font(font, str(OUT_FONT), opts)

print(f'{len(found)} Symbole, {len(codepoints)} Glyphen -> '
      f'{OUT_CSS.stat().st_size} B CSS, {OUT_FONT.stat().st_size} B Schrift')

"""生成 design-demos/shared/fonts.css：拉丁展示字体 base64 内嵌 + 思源宋体（Noto Serif SC）按需子集。

CJK 子集字符来源：design-demos/*/display-chars.txt（各版只把「用宋体展示的固定文案」写进去）。
用法：python design-demos/tools/build_fonts.py
"""
import base64
import io
import pathlib
import re

from fontTools import subset
from fontTools.ttLib import TTFont

ROOT = pathlib.Path(__file__).resolve().parents[1]
NM = pathlib.Path('D:/tmp/jixu-fonts/node_modules')
OUT = ROOT / 'shared' / 'fonts.css'

LATIN_RANGE = 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD'

LATIN = [
    ('Instrument Serif', 'normal', '400', '@fontsource/instrument-serif/files/instrument-serif-latin-400-normal.woff2', 'woff2'),
    ('Instrument Serif', 'italic', '400', '@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2', 'woff2'),
    ('Bricolage Grotesque', 'normal', '200 800', '@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-opsz-normal.woff2', 'woff2-variations'),
    ('Martian Mono', 'normal', '300', '@fontsource/martian-mono/files/martian-mono-latin-300-normal.woff2', 'woff2'),
    ('Martian Mono', 'normal', '400', '@fontsource/martian-mono/files/martian-mono-latin-400-normal.woff2', 'woff2'),
    ('Martian Mono', 'normal', '500', '@fontsource/martian-mono/files/martian-mono-latin-500-normal.woff2', 'woff2'),
    ('Martian Mono', 'normal', '700', '@fontsource/martian-mono/files/martian-mono-latin-700-normal.woff2', 'woff2'),
    ('Inter Tight', 'normal', '100 900', '@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2', 'woff2-variations'),
    ('JetBrains Mono', 'normal', '100 800', '@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2', 'woff2-variations'),
]

CJK_FAMILY = 'Noto Serif SC Display'
CJK_WEIGHTS = ['500', '700', '900']


def b64(data):
    return base64.b64encode(data).decode('ascii')


def face(family, style, weight, data, fmt, urange, mime='font/woff2'):
    return (
        '@font-face{font-family:\'%s\';font-style:%s;font-weight:%s;font-display:block;'
        'src:url(data:%s;base64,%s) format(\'%s\');unicode-range:%s}\n'
        % (family, style, weight, mime, b64(data), fmt, urange)
    )


def parse_ranges(spec):
    cps = set()
    for part in spec.split(','):
        part = part.strip().upper().replace('U+', '')
        if '-' in part:
            a, b = part.split('-')
            cps.update(range(int(a, 16), int(b, 16) + 1))
        elif part:
            cps.add(int(part, 16))
    return cps


def cjk_chars():
    chars = set()
    for f in ROOT.glob('*/display-chars.txt'):
        for ch in f.read_text(encoding='utf-8'):
            if ord(ch) > 0x2E7F:
                chars.add(ord(ch))
    return chars


def cjk_faces(chars):
    css = []
    total = 0
    pkg = NM / '@fontsource' / 'noto-serif-sc'
    for w in CJK_WEIGHTS:
        sheet = (pkg / ('%s.css' % w)).read_text(encoding='utf-8')
        for m in re.finditer(r"src: url\(\./files/([^)]+?)\.woff2\).*?unicode-range: ([^;]+);", sheet, re.S):
            need = parse_ranges(m.group(2)) & chars
            if not need:
                continue
            font = TTFont(str(pkg / 'files' / (m.group(1) + '.woff')))
            opts = subset.Options()
            opts.flavor = 'woff'
            opts.layout_features = ['*']
            opts.name_IDs = []
            opts.notdef_outline = False
            sub = subset.Subsetter(opts)
            sub.populate(unicodes=sorted(need))
            sub.subset(font)
            buf = io.BytesIO()
            font.flavor = 'woff'
            font.save(buf)
            data = buf.getvalue()
            total += len(data)
            urange = ','.join('U+%X' % c for c in sorted(need))
            css.append(face(CJK_FAMILY, 'normal', w, data, 'woff', urange, 'font/woff'))
    return css, total


def main():
    out = ['/* 自动生成：python design-demos/tools/build_fonts.py — 勿手改 */\n']
    for family, style, weight, rel, fmt in LATIN:
        out.append(face(family, style, weight, (NM / rel).read_bytes(), fmt, LATIN_RANGE))
    chars = cjk_chars()
    cjk_css, cjk_bytes = cjk_faces(chars) if chars else ([], 0)
    out.extend(cjk_css)
    OUT.write_text(''.join(out), encoding='utf-8')
    print('fonts.css %d KB; CJK subset %d chars x %d weights = %d KB woff'
          % (OUT.stat().st_size // 1024, len(chars), len(CJK_WEIGHTS), cjk_bytes // 1024))


if __name__ == '__main__':
    main()

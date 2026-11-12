"""用项目自带思源黑体生成启动页的等比例矢量名称。"""

import argparse
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont


PROJECT = Path(__file__).resolve().parents[1]
ROOT = next(parent for parent in PROJECT.parents if (parent / 'mobile/web/public/fonts/NotoSansSC.ttf').is_file())
FONT = ROOT / 'mobile/web/public/fonts/NotoSansSC.ttf'
OUTPUT = PROJECT / 'app/src/main/res/drawable/seal_startup_wordmark.xml'


def number(value):
    result = f'{value:.3f}'.rstrip('0').rstrip('.')
    return '0' if result in ('', '-0') else result


def make_wordmark():
    font = TTFont(FONT)
    glyphs = font.getGlyphSet(location={'wght': 500})
    cmap = font.getBestCmap()
    names = [cmap[ord(char)] for char in '海豹办公']
    scale = 18 / font['head'].unitsPerEm
    cursor = 144 - sum(glyphs[name].width for name in names) * scale / 2
    paths = []
    for name in names:
        pen = SVGPathPen(glyphs, ntos=number)
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, cursor, 197)))
        paths.append(f'    <path android:fillColor="#28334D" android:pathData="{pen.getCommands()}" />')
        cursor += glyphs[name].width * scale
    return '\n'.join([
        '<?xml version="1.0" encoding="utf-8"?>',
        '<!-- 文字字形取自项目内思源黑体，按中等字重等比例生成。 -->',
        '<vector xmlns:android="http://schemas.android.com/apk/res/android"',
        '    android:width="288dp" android:height="288dp"',
        '    android:viewportWidth="288" android:viewportHeight="288">',
        *paths,
        '</vector>',
        '',
    ])


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description='生成或核对启动页应用名称矢量资源')
    parser.add_argument('--check', action='store_true')
    args = parser.parse_args()
    result = make_wordmark()
    if args.check:
        if not OUTPUT.is_file() or OUTPUT.read_text(encoding='utf-8') != result:
            parser.exit(1, '启动页文字资源与生成结果不一致\n')
        print('启动页文字资源与生成结果一致')
    else:
        OUTPUT.write_text(result, encoding='utf-8', newline='\n')
        print('已生成启动页文字矢量资源')

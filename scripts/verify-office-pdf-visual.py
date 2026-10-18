"""Inspect synthetic native PDF fixtures using an independent parser and Poppler."""
import json
from pathlib import Path
import shutil
import subprocess
import pdfplumber
from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / '.upgrade-private/office-pdf-third-pass'


def inspect():
    executable = shutil.which('pdftoppm')
    if not executable:
        raise RuntimeError('Poppler pdftoppm is required for independent visual QA')
    report = {'passed': False, 'renderer': 'Poppler pdftoppm', 'parser': 'pdfplumber', 'syntheticOnly': True, 'documents': []}
    for name, expected in [('complex-sections', '原始甲'), ('complex-sections-saved', '已修改乙')]:
        source = OUTPUT / (name + '.pdf')
        subprocess.run([executable, '-r', '96', '-png', str(source), str(OUTPUT / name)], check=True, timeout=60, capture_output=True)
        thumbnails, records = [], []
        with pdfplumber.open(source) as pdf:
            assert len(pdf.pages) == 5, 'odd-page section must preserve the physical blank page'
            texts = [page.extract_text() or '' for page in pdf.pages]
            assert expected in texts[0]
            assert '首页专用页眉甲' in texts[0] and '脚注' in texts[0] and '不得丢失' in texts[0]
            assert '偶数页页眉甲' in texts[1] and '横向双栏页眉乙' in texts[2]
            assert not texts[3].strip(), 'automatically inserted fourth page remains blank'
            assert '末节奇数起页页眉丙' in texts[4] and '末节页脚丙' in texts[4] and texts[4].strip().endswith('5')
            assert len(pdf.pages[0].images) == 1
            columns = [sum(1 for char in pdf.pages[1].chars if (char['x0'] < pdf.pages[1].width / 2) == left) for left in [True, False]]
            assert min(columns) > 100, 'both columns must contain visible text'
            for index, page in enumerate(pdf.pages, 1):
                assert (page.width > page.height) == (index in [2, 3])
                image_path = OUTPUT / f'{name}-{index}.png'
                image = Image.open(image_path).convert('RGB')
                if index == 1:
                    pixels = getattr(image, 'get_flattened_data', image.getdata)
                    counts = [sum(1 for color in pixels() if all(abs(color[k] - target[k]) < 10 for k in range(3))) for target in [(30, 100, 210), (240, 130, 35)]]
                    assert min(counts) > 1000, 'both independently authored image colors must be visible'
                image.thumbnail((620, 880))
                card = Image.new('RGB', (640, 920), '#dce3ed')
                card.paste(image, ((640 - image.width) // 2, 28))
                ImageDraw.Draw(card).text((16, 4), f'Page {index}', fill='black')
                thumbnails.append(card)
                records.append({'page': index, 'width': page.width, 'height': page.height, 'images': len(page.images), 'text': texts[index - 1], 'png': str(image_path.relative_to(ROOT)).replace('\\', '/')})
        sheet = Image.new('RGB', (1280, 2760), '#dce3ed')
        for index, image in enumerate(thumbnails):
            sheet.paste(image, ((index % 2) * 640, (index // 2) * 920))
        sheet.save(OUTPUT / (name + '-contact-sheet.png'))
        report['documents'].append({'name': name, 'pages': records, 'checks': ['edited body text', 'first/even/default headers', 'footnote text', 'two-column text', 'portrait/landscape geometry', 'physical blank fourth page', 'odd final page number', 'two-color anchored image']})
    report['passed'] = True
    (OUTPUT / 'visual-verification.json').write_text(json.dumps(report, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'passed': True, 'documents': len(report['documents']), 'pages': sum(len(doc['pages']) for doc in report['documents'])}))


if __name__ == '__main__':
    inspect()

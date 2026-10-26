"""Build 1080x1920 AppGallery screenshots from real mobile web captures.

The source images are actual mobile app screenshots captured at 540x960 CSS
pixels with a 2x device scale. This script only adds the listing headline,
brand frame and the required AI label; it does not fabricate app content.
"""
from pathlib import Path
import hashlib
import json

from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "build/store-assets/raw-v2.2.0"
OUT = ROOT / "build/store-assets/mobile-v2.2.0"
VERSION = "2.2.0"
W, H = 1080, 1920

BG = "#F2F6FC"
INK = "#13233D"
MUTED = "#5B687D"
LINE = "#DCE5F2"
WHITE = "#FFFFFF"
BLUE = "#2B6CF6"
NAVY = "#1D3557"
GREEN = "#0F9D67"
ORANGE = "#E87922"
VIOLET = "#6046D8"

SHOTS = [
    ("word.png", "01-移动文字编辑-1080x1920.png", "移动文字编辑，随时开始",
     "查看、编辑和导出常用文字文档；支持公文字体与专属格式。", BLUE, "文字"),
    ("sheet.png", "02-表格与数据-1080x1920.png", "表格与数据，轻松整理",
     "工作表、公式与单元格格式，移动端也能高效处理。", GREEN, "表格"),
    ("services.png", "03-办公服务-1080x1920.png", "办公服务，一页直达",
     "文字、表格、演示、PDF 与常用工具集中管理。", NAVY, "服务"),
    ("assistant.png", "04-AI助手-1080x1920.png", "AI 辅助，内容有标识",
     "AI 生成内容均显示“AI生成”，请核对后使用。", VIOLET, "AI 助手"),
]


def font(name, size):
    path = Path("C:/Windows/Fonts") / name
    if not path.exists():
        path = Path("C:/Windows/Fonts/msyh.ttc")
    return ImageFont.truetype(str(path), size)


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def text_size(draw, text, fnt):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def make_background():
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image, "RGBA")
    # Fine grid, deliberately quiet: it gives the page structure without
    # looking like a generic AI gradient poster.
    for x in range(0, W, 24):
        draw.line((x, 0, x, H), fill=(34, 59, 102, 5), width=1)
    for y in range(0, H, 24):
        draw.line((0, y, W, y), fill=(34, 59, 102, 5), width=1)
    draw.rectangle((0, 0, W, 10), fill=BLUE)
    return image


def make_shot(source, title, subtitle, accent, badge):
    image = make_background()
    draw = ImageDraw.Draw(image, "RGBA")
    logo = Image.open(ROOT / "mobile/web/public/icons/icon192.png").convert("RGBA").resize((76, 76), Image.LANCZOS)
    image.paste(logo, (64, 58), logo)
    draw.text((160, 62), "海豹办公", font=font("msyhbd.ttc", 34), fill=INK)
    draw.text((160, 105), "SEAL OFFICE", font=font("arial.ttf", 15), fill=MUTED)

    pill = "版本 " + VERSION
    pw, ph = text_size(draw, pill, font("msyh.ttc", 21))
    rounded(draw, (W - 84 - pw - 42, 72, W - 64, 72 + ph + 26), 20, fill="#E7EEFC", outline="#C8D8FA", width=1)
    draw.text((W - 84 - pw - 21, 78), pill, font=font("msyh.ttc", 21), fill=BLUE)

    draw.rectangle((64, 168, 136, 175), fill=accent)
    # Headline: keep two lines with generous leading instead of shrinking text
    # into an unreadable single line.
    lines = [title]
    if title == "移动文字编辑，随时开始":
        lines = ["移动文字编辑，", "随时开始"]
    headline = font("msyhbd.ttc", 68)
    y = 208
    for line in lines:
        draw.text((62, y), line, font=headline, fill=INK)
        y += 88
    draw.text((64, y + 6), subtitle, font=font("msyh.ttc", 28), fill=MUTED)

    # Screenshot card: real app UI, no device frame, no status bar, no alpha.
    card = (90, 500, 990, 1810)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded(sd, (card[0] + 6, card[1] + 16, card[2] + 6, card[3] + 16), 42, fill=(26, 48, 84, 34))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    image.paste(shadow, (0, 0), shadow)
    rounded(draw, card, 42, fill=WHITE, outline=LINE, width=2)

    shot = Image.open(RAW / source).convert("RGB")
    if source == "assistant.png":
        shot = shot.crop((36, 24, 1044, 1900))
    elif source == "services.png":
        shot = shot.crop((0, 0, 1068, 1920))
    target_h = 1250
    target_w = round(shot.width * target_h / shot.height)
    if target_w > 840:
        target_w = 840
        target_h = round(shot.height * target_w / shot.width)
    shot = shot.resize((target_w, target_h), Image.LANCZOS)
    x = (W - target_w) // 2
    y_shot = 530 + (1250 - target_h) // 2
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, target_w, target_h), radius=24, fill=255)
    image.paste(shot, (x, y_shot), mask)

    # Floating category badge on the card, not a fake device notch.
    tw, th = text_size(draw, badge, font("msyhbd.ttc", 22))
    bx, by = 92, 474
    rounded(draw, (bx, by, bx + tw + 34, by + th + 22), 18, fill=accent)
    draw.text((bx + 17, by + 8), badge, font=font("msyhbd.ttc", 22), fill=WHITE)

    if source == "assistant.png":
        # Required AIGC disclosure: visible on the image itself, not only in
        # the listing description.
        label = "AI 生成内容"
        lw, lh = text_size(draw, label, font("msyhbd.ttc", 24))
        lx, ly = 690, 474
        rounded(draw, (lx, ly, lx + lw + 38, ly + lh + 24), 18, fill="#B42318")
        draw.text((lx + 19, ly + 9), label, font=font("msyhbd.ttc", 24), fill=WHITE)

    draw.line((64, 1838, W - 64, 1838), fill=LINE, width=2)
    footer = "AI 生成内容均显示“AI生成” · 实际界面截图" if source == "assistant.png" else "海豹办公 2.2.0  ·  实际界面截图"
    draw.text((64, 1860), footer, font=font("msyh.ttc", 21), fill="#7A879A")
    draw.text((W - 64 - 192, 1860), "移动端 · 竖屏", font=font("msyh.ttc", 21), fill="#7A879A")
    return image


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for source, name, title, subtitle, accent, badge in SHOTS:
        image = make_shot(source, title, subtitle, accent, badge)
        target = OUT / name
        image.save(target, "PNG", optimize=True)
        records.append({
            "file": name, "width": image.width, "height": image.height,
            "bytes": target.stat().st_size,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "source": f"build/store-assets/raw-v2.2.0/{source}",
            "aiLabel": source == "assistant.png",
        })
        print(name, target.stat().st_size)
    (OUT / "screenshots.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

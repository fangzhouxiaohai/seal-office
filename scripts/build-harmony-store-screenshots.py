"""Build ten 1080x1920 HarmonyOS AppGallery screenshots.

Sources are real app screens captured from the signed 2.2.0 HarmonyOS App Pack.
The script only crops system bars, redacts account identifiers, adds the brand
frame, headline and the required AIGC label; it does not redraw app content.
"""
from pathlib import Path
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps
import hashlib
import json

ROOT = Path(__file__).resolve().parent.parent
RAW = ROOT / "build/store-assets/raw-harmony-2.2.0"
RAW_OLD = ROOT / "build/store-assets/raw-v2.2.0"
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
RED = "#B42318"

# (source, output, title lines, subtitle, accent, badge, ai, redact-account)
SHOTS = [
    ("01-home.jpg", "01-移动工作台-1080x1920.png", ["手机上的文档", "工作台"],
     "最近文档、本机文件与云同步集中在一个入口。", BLUE, "首页", False, False),
    (str(RAW_OLD / "word.png"), "02-移动文字编辑-1080x1920.png", ["移动文字编辑，", "随时开始"],
     "查看、编辑和导出常用文字文档；支持公文字体与专属格式。", BLUE, "文字", False, False),
    (str(RAW_OLD / "sheet.png"), "03-表格与数据-1080x1920.png", ["表格与数据，", "轻松整理"],
     "工作表、公式与单元格格式，移动端也能高效处理。", GREEN, "表格", False, False),
    ("02-services.jpg", "04-办公服务-1080x1920.png", ["办公服务，", "一页直达"],
     "文字、表格、演示、PDF 与常用工具集中管理。", NAVY, "服务", False, False),
    ("03-templates.jpg", "05-模板市场-1080x1920.png", ["演示模板，", "快速开始"],
     "主题模板、风格组合与文档转演示，内置内容离线可用。", ORANGE, "模板", False, False),
    ("04-cloud.jpg", "06-云文档-1080x1920.png", ["云文档，", "加密同步"],
     "本机编辑不受影响；开通后可加密同步与团队协作。", BLUE, "云盘", False, False),
    ("06-ai.jpg", "07-AI助手-1080x1920.png", ["AI 辅助，", "内容有标识"],
     "AI 生成内容均显示“AI生成”，请核对后使用。", VIOLET, "AI 助手", True, False),
    ("08-ppt.jpg", "08-演示编辑-1080x1920.png", ["演示文稿，", "随手修改"],
     "幻灯片、文本框与版式在手机上继续编辑。", ORANGE, "演示", False, False),
    ("09-pdf.jpg", "09-PDF工具-1080x1920.png", ["PDF 工具，", "随手处理"],
     "阅读、整理与导出 PDF，常用工具集中在一个页面。", NAVY, "PDF", False, False),
    ("10-local.jpg", "10-本机文件-1080x1920.png", ["本机文件，", "打开即用"],
     "本机文档集中列出，未登录也可阅读、编辑和导出。", GREEN, "本机", False, False),
]


def font(name, size):
    path = Path("C:/Windows/Fonts") / name
    if not path.exists():
        path = Path("C:/Windows/Fonts/msyh.ttc")
    return ImageFont.truetype(str(path), size)


def text_size(draw, text, fnt):
    bbox = draw.textbbox((0, 0), text, font=fnt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


def rounded(draw, box, radius, fill=None, outline=None, width=1):
    draw.rounded_rectangle(box, radius=radius, fill=fill, outline=outline, width=width)


def background():
    image = Image.new("RGB", (W, H), BG)
    draw = ImageDraw.Draw(image, "RGBA")
    for x in range(0, W, 24):
        draw.line((x, 0, x, H), fill=(34, 59, 102, 5), width=1)
    for y in range(0, H, 24):
        draw.line((0, y, W, y), fill=(34, 59, 102, 5), width=1)
    draw.rectangle((0, 0, W, 10), fill=BLUE)
    return image


def load_shot(path: Path, redact: bool):
    image = Image.open(path).convert("RGB")
    if redact:
        # Drop the account header entirely; the store asset must not contain
        # a phone number or account identifier.
        image = image.crop((0, 980, image.width, image.height))
    if image.height > 2000:
        # HarmonyOS captures: drop the system status bar and bottom gesture bar.
        image = image.crop((0, 110, image.width, image.height - 100))
    else:
        # Existing 1080x1920 captures: drop the old bottom tab bar.
        image = image.crop((0, 0, image.width, min(image.height, 1600)))
    return image


def make_shot(item):
    source, name, lines, subtitle, accent, badge, ai_label, redact = item
    path = Path(source)
    if not path.is_absolute():
        path = RAW / path
    image = background()
    draw = ImageDraw.Draw(image, "RGBA")
    logo = Image.open(ROOT / "mobile/web/public/icons/icon192.png").convert("RGBA").resize((76, 76), Image.LANCZOS)
    image.paste(logo, (64, 48), logo)
    draw.text((160, 52), "海豹办公", font=font("msyhbd.ttc", 34), fill=INK)
    draw.text((160, 95), "SEAL OFFICE", font=font("arial.ttf", 15), fill=MUTED)

    pill = "版本 " + VERSION
    pw, ph = text_size(draw, pill, font("msyh.ttc", 21))
    rounded(draw, (W - 84 - pw - 42, 60, W - 64, 60 + ph + 26), 20, fill="#E7EEFC", outline="#C8D8FA", width=1)
    draw.text((W - 84 - pw - 21, 66), pill, font=font("msyh.ttc", 21), fill=BLUE)

    draw.rectangle((64, 154, 136, 161), fill=accent)
    headline = font("msyhbd.ttc", 60)
    y = 186
    for line in lines:
        draw.text((62, y), line, font=headline, fill=INK)
        y += 78
    draw.text((64, y + 2), subtitle, font=font("msyh.ttc", 26), fill=MUTED)

    card = (84, 424, 996, 1836)
    shadow = Image.new("RGBA", (W, H), (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    rounded(sd, (card[0] + 6, card[1] + 16, card[2] + 6, card[3] + 16), 42, fill=(26, 48, 84, 34))
    shadow = shadow.filter(ImageFilter.GaussianBlur(18))
    image.paste(shadow, (0, 0), shadow)
    rounded(draw, card, 42, fill=WHITE, outline=LINE, width=2)

    shot = load_shot(path, redact)
    target_w, target_h = 840, 1352
    shot = ImageOps.fit(shot, (target_w, target_h), method=Image.LANCZOS, centering=(0.5, 0.18))
    x = (W - target_w) // 2
    y_shot = 454
    mask = Image.new("L", shot.size, 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, target_w, target_h), radius=24, fill=255)
    image.paste(shot, (x, y_shot), mask)

    tw, th = text_size(draw, badge, font("msyhbd.ttc", 22))
    bx, by = 86, 398
    rounded(draw, (bx, by, bx + tw + 34, by + th + 22), 18, fill=accent)
    draw.text((bx + 17, by + 8), badge, font=font("msyhbd.ttc", 22), fill=WHITE)

    if ai_label:
        label = "AI 生成内容"
        lw, lh = text_size(draw, label, font("msyhbd.ttc", 24))
        lx, ly = 700, 398
        rounded(draw, (lx, ly, lx + lw + 38, ly + lh + 24), 18, fill=RED)
        draw.text((lx + 19, ly + 9), label, font=font("msyhbd.ttc", 24), fill=WHITE)

    draw.line((64, 1862, W - 64, 1862), fill=LINE, width=2)
    footer = "AI 生成内容均显示“AI生成” · 实际界面截图" if ai_label else "海豹办公 2.2.0  ·  实际界面截图"
    draw.text((64, 1880), footer, font=font("msyh.ttc", 21), fill="#7A879A")
    draw.text((W - 64 - 192, 1880), "HarmonyOS · 竖屏", font=font("msyh.ttc", 21), fill="#7A879A")
    image.save(OUT / name, "PNG", optimize=True)
    return image, name


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    records = []
    for item in SHOTS:
        image, name = make_shot(item)
        target = OUT / name
        records.append({
            "file": name, "width": image.width, "height": image.height,
            "bytes": target.stat().st_size,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest(),
            "source": f"build/store-assets/raw-v2.2.0/{Path(item[0]).name}" if Path(item[0]).is_absolute() else f"build/store-assets/raw-harmony-2.2.0/{item[0]}",
            "aiLabel": item[6],
        })
        print(name, target.stat().st_size)
    (OUT / "screenshots.json").write_text(json.dumps(records, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()

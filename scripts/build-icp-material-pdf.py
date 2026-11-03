"""Build a filing-ready PDF from the six uploaded screenshots.

The images are placed without cropping; captions and page numbers are vector
text. Sensitive filing details are preserved because the source screenshots
were supplied for this document, so the PDF is marked internal-use only.
"""
from pathlib import Path

from PIL import Image
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4, landscape
from reportlab.lib.utils import ImageReader
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "build" / "海豹办公-备案与安全评估材料.pdf"

INK = HexColor("#13233D")
MUTED = HexColor("#5B687D")
LINE = HexColor("#DCE5F2")
BLUE = HexColor("#2B6CF6")
SOFT = HexColor("#F4F7FC")
WHITE = HexColor("#FFFFFF")
PALE_BLUE = HexColor("#E7EEFC")

FONT = "Deng"
FONT_BOLD = "DengBold"


def register_fonts():
    pdfmetrics.registerFont(TTFont(FONT, "C:/Windows/Fonts/Deng.ttf"))
    pdfmetrics.registerFont(TTFont(FONT_BOLD, "C:/Windows/Fonts/Dengb.ttf"))


def wrap(text: str, font: str, size: float, width: float) -> list[str]:
    # Chinese text has no word spaces; split by character and measure.
    lines, current = [], ""
    for char in text:
        candidate = current + char
        if pdfmetrics.stringWidth(candidate, font, size) <= width:
            current = candidate
        else:
            lines.append(current)
            current = char
    if current:
        lines.append(current)
    return lines


def footer(c: canvas.Canvas, page: int, total: int, label: str, width: float, height: float):
    c.setStrokeColor(LINE)
    c.setLineWidth(0.6)
    c.line(36, 30, width - 36, 30)
    c.setFont(FONT, 7.5)
    c.setFillColor(MUTED)
    c.drawString(36, 18, label)
    c.drawRightString(width - 36, 18, f"{page} / {total}")


def header(c: canvas.Canvas, title: str, subtitle: str, width: float, height: float):
    c.setFillColor(BLUE)
    c.rect(0, height - 8, width, 8, fill=1, stroke=0)
    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 20)
    c.drawString(36, height - 48, title)
    c.setFont(FONT, 9)
    c.setFillColor(MUTED)
    c.drawString(36, height - 64, subtitle)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.7)
    c.line(36, height - 76, width - 36, height - 76)


def image_frame(c: canvas.Canvas, path: Path, box: tuple[float, float, float, float]):
    x, y, w, h = box
    c.setFillColor(SOFT)
    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.roundRect(x - 8, y - 8, w + 16, h + 16, 7, fill=1, stroke=1)
    image = Image.open(path)
    iw, ih = image.size
    scale = min(w / iw, h / ih)
    dw, dh = iw * scale, ih * scale
    dx, dy = x + (w - dw) / 2, y + (h - dh) / 2
    c.drawImage(ImageReader(str(path)), dx, dy, width=dw, height=dh, preserveAspectRatio=True, mask="auto")
    c.setStrokeColor(HexColor("#C9D4E5"))
    c.setLineWidth(0.6)
    c.rect(dx, dy, dw, dh, fill=0, stroke=1)


def cover(c: canvas.Canvas):
    w, h = A4
    c.setFillColor(SOFT)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    c.setFillColor(BLUE)
    c.rect(0, h - 10, w, 10, fill=1, stroke=0)

    icon = ROOT / "mobile/web/public/icons/icon192.png"
    if icon.exists():
        c.drawImage(ImageReader(str(icon)), 48, h - 104, 50, 50, mask="auto")

    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 13)
    c.drawString(110, h - 78, "海豹办公")
    c.setFont(FONT, 7.5)
    c.setFillColor(MUTED)
    c.drawString(110, h - 92, "SEAL OFFICE  ·  HARMONYOS")

    c.setFont(FONT, 8)
    c.setFillColor(MUTED)
    c.drawRightString(w - 48, h - 78, "内部提交材料")
    c.setStrokeColor(BLUE)
    c.setLineWidth(3)
    c.line(48, h - 150, 88, h - 150)

    c.setFillColor(INK)
    c.setFont(FONT_BOLD, 27)
    c.drawString(48, h - 215, "应用备案与")
    c.drawString(48, h - 251, "安全评估材料")

    c.setFont(FONT, 11)
    c.setFillColor(MUTED)
    c.drawString(48, h - 285, "海豹办公 2.2.0  ·  HarmonyOS 应用")
    c.drawString(48, h - 302, "ICP 备案、App 备案、安全评估与智能助手界面")

    c.setStrokeColor(LINE)
    c.setLineWidth(0.8)
    c.line(48, h - 330, w - 48, h - 330)

    meta = [
        ("文档日期", "2026 年 10 月 27 日"),
        ("应用版本", "2.2.0 / 20200"),
        ("材料内容", "6 张实际界面截图"),
        ("主体名称", "新疆星之远境智能科技有限公司"),
    ]
    y = h - 366
    for key, value in meta:
        c.setFont(FONT, 8.5)
        c.setFillColor(MUTED)
        c.drawString(48, y, key)
        c.setFont(FONT_BOLD, 9.5)
        c.setFillColor(INK)
        c.drawString(122, y, value)
        y -= 23

    note_box = (48, h - 560, w - 96, 116)
    c.setFillColor(HexColor("#FFF8EC"))
    c.setStrokeColor(HexColor("#F0D8A8"))
    c.roundRect(*note_box, 5, fill=1, stroke=1)
    c.setFillColor(HexColor("#8A5A12"))
    c.setFont(FONT_BOLD, 8.5)
    c.drawString(62, h - 478, "个人信息提示")
    c.setFont(FONT, 8)
    note = "本文件包含备案主体、负责人姓名、证件号码、手机号码及电子邮箱等个人信息，仅用于应用备案与内部审核，请妥善保管，不要公开传播。"
    for i, line in enumerate(wrap(note, FONT, 8, w - 124)):
        c.drawString(62, h - 496 - i * 13, line)

    c.setFillColor(MUTED)
    c.setFont(FONT, 7.5)
    c.drawString(48, 42, "海豹办公  ·  应用备案材料")
    c.drawRightString(w - 48, 42, "第 1 页")
    c.showPage()


def wide_page(c: canvas.Canvas, path: Path, title: str, subtitle: str, caption: str, page: int, total: int):
    w, h = landscape(A4)
    c.setPageSize((w, h))
    c.setFillColor(WHITE)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    header(c, title, subtitle, w, h)
    image_frame(c, path, (36, 110, w - 72, h - 210))
    c.setFillColor(MUTED)
    c.setFont(FONT, 8)
    c.drawString(36, 76, caption)
    footer(c, page, total, "海豹办公 2.2.0  ·  备案与安全评估材料", w, h)
    c.showPage()


def phone_page(c: canvas.Canvas, path: Path, title: str, subtitle: str, caption: str, page: int, total: int):
    w, h = A4
    c.setPageSize((w, h))
    c.setFillColor(WHITE)
    c.rect(0, 0, w, h, fill=1, stroke=0)
    header(c, title, subtitle, w, h)
    image_frame(c, path, (110, 150, w - 220, h - 260))
    c.setFillColor(MUTED)
    c.setFont(FONT, 8)
    for i, line in enumerate(wrap(caption, FONT, 8, w - 220)):
        c.drawString(110, 116 - i * 12, line)
    footer(c, page, total, "海豹办公 2.2.0  ·  智能助手界面", w, h)
    c.showPage()


def main():
    register_fonts()
    paths = {
        "icp": Path(r"C:\Users\A\.dsh\attachments\v1\objects\dd\dd95924737854ed79efb87db6c6b7feb2684c67a8cae9a22e52ef50e15dbd312"),
        "app": Path(r"C:\Users\A\.dsh\attachments\v1\objects\cf\cfa8bb2957a1333e9d4286a9804094b1667fdc0118e0ecfd49c2e3bdbf657830"),
        "assess": Path(r"C:\Users\A\.dsh\attachments\v1\objects\4e\4e9c0f037faa75beab9bf57b174e77bc765cc21d7e2a00d852ef898655908197"),
        "history": Path(r"C:\Users\A\.dsh\attachments\v1\objects\61\61ac37dacd66edc7306097edcfa0f67f6717aa31c446de9135a974569bd82f62"),
        "ai1": Path(r"C:\Users\A\.dsh\attachments\v1\objects\f2\f231f22bd3885a4953693a9c59601f60b9ce89d3e82f424ba7fd111319f3f9cc"),
        "ai2": Path(r"C:\Users\A\.dsh\attachments\v1\objects\28\289f201b964d9a9dc452568ac7406228920333265011d431cbcfadaf6c808a8c"),
    }
    OUT.parent.mkdir(parents=True, exist_ok=True)
    c = canvas.Canvas(str(OUT), pagesize=A4)
    c.setTitle("海豹办公应用备案与安全评估材料")
    c.setAuthor("海豹办公")
    c.setSubject("ICP 备案、App 备案、安全评估与智能助手界面")
    c.setCreator("Seal Office")
    total = 7
    cover(c)
    wide_page(c, paths["icp"], "ICP 备案信息", "我的 ICP 备案信息 · 网站与 App 备案",
              "图 1  ICP 备案主体、网站与 App 备案信息", 2, total)
    wide_page(c, paths["app"], "App 备案信息", "海豹办公 App 备案详情",
              "图 2  App 名称、备案号、平台信息与互联网服务负责人", 3, total)
    wide_page(c, paths["assess"], "安全评估详情", "全国互联网安全管理服务平台 · 评估对象与开展情况",
              "图 3  安全评估对象、评估方法与用户信息留存措施", 4, total)
    wide_page(c, paths["history"], "历史安全评估", "全国互联网安全管理服务平台 · 历史评估记录",
              "图 4  海豹办公历史安全评估记录与审核状态", 5, total)
    phone_page(c, paths["ai1"], "智能助手 · 工作模式", "AI 生成修改预览，确认后应用",
               "图 5  工作模式：AI 生成修改预览，待确认修改 1 处。", 6, total)
    phone_page(c, paths["ai2"], "智能助手 · 任务执行", "AI 生成步骤与修改确认",
               "图 6  工作模式：任务计划执行中，AI 助手（AI生成）状态与待确认修改。", 7, total)
    c.save()
    print(OUT, OUT.stat().st_size)


if __name__ == "__main__":
    main()

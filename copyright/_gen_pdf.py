# -*- coding: utf-8 -*-
from fpdf import FPDF
import os

BASE = r"E:\seal-office\copyright"

# ========== 1. 源程序鉴别材料 PDF ==========
class SrcPDF(FPDF):
    def header(self):
        self.set_font("simsun", "", 9)
        self.cell(0, 6, "海豹办公软件 V2.1.0", align="L")
        self.cell(0, 6, f"第 {self.page_no()} 页 / 共 60 页", align="R", new_x="LMARGIN", new_y="NEXT")
        self.line(10, 18, 200, 18)
        self.ln(2)
    def footer(self):
        pass

# 读源程序
with open(os.path.join(BASE, "02-源程序鉴别材料", "_source-concat.txt"), "r", encoding="utf-8") as f:
    all_lines = [l.rstrip() for l in f.readlines()]

front = all_lines[:1500]
back = all_lines[-1500:]

pdf = SrcPDF(format="A4", unit="mm")
pdf.add_font("simsun", "", r"C:\Windows\Fonts\simsun.ttc")
pdf.add_font("simhei", "", r"C:\Windows\Fonts\simhei.ttf")
pdf.set_auto_page_break(auto=False)

lines_per_page = 48
font_size = 7
line_h = 4.2

def write_page(lines):
    pdf.add_page()
    pdf.set_font("simsun", "", font_size)
    for i, line in enumerate(lines):
        if i >= lines_per_page:
            break
        # 截断过长的行
        safe = line.replace("\t", "    ")
        if len(safe) > 95:
            safe = safe[:95]
        pdf.set_xy(10, 22 + i * line_h)
        pdf.cell(0, line_h, safe)

for p in range(30):
    chunk = front[p*lines_per_page:(p+1)*lines_per_page]
    write_page(chunk)

# 中间省略页
pdf.add_page()
pdf.set_font("simhei", "", 12)
pdf.set_xy(10, 100)
pdf.cell(0, 10, "（中间部分省略）", align="C")

for p in range(30):
    chunk = back[p*lines_per_page:(p+1)*lines_per_page]
    write_page(chunk)

src_pdf = os.path.join(BASE, "02-源程序鉴别材料", "海豹办公V2.1.0-源程序鉴别材料.pdf")
pdf.output(src_pdf)
print(f"源程序PDF: {src_pdf}, {os.path.getsize(src_pdf)//1024}KB")

# ========== 2. 用户手册 PDF ==========
class ManualPDF(FPDF):
    def header(self):
        self.set_font("simhei", "", 10)
        self.cell(0, 6, "海豹办公软件 V2.1.0 用户手册", align="C", new_x="LMARGIN", new_y="NEXT")
        self.line(10, 18, 200, 18)
        self.ln(2)

with open(os.path.join(BASE, "03-软件用户手册", "海豹办公V2.1.0-用户手册.md"), "r", encoding="utf-8") as f:
    manual_lines = [l.rstrip() for l in f.readlines()]

pdf2 = ManualPDF(format="A4", unit="mm")
pdf2.add_font("simsun", "", r"C:\Windows\Fonts\simsun.ttc")
pdf2.add_font("simhei", "", r"C:\Windows\Fonts\simhei.ttf")
pdf2.set_auto_page_break(auto=True, margin=20)

for line in manual_lines:
    if line.startswith("# "):
        pdf2.add_page()
        pdf2.set_font("simhei", "", 18)
        pdf2.multi_cell(190, 10, line[2:])
        pdf2.ln(5)
    elif line.startswith("## "):
        pdf2.set_font("simhei", "", 14)
        pdf2.multi_cell(190, 8, line[3:])
        pdf2.ln(2)
    elif line.startswith("### "):
        pdf2.set_font("simhei", "", 12)
        pdf2.multi_cell(190, 7, line[4:])
        pdf2.ln(1)
    elif line.startswith("---"):
        pdf2.ln(2)
    elif line.strip() == "":
        pdf2.ln(2)
    else:
        pdf2.set_font("simsun", "", 10)
        clean = line.replace("**", "").replace("*", "")
        pdf2.multi_cell(190, 6, clean)

manual_pdf = os.path.join(BASE, "03-软件用户手册", "海豹办公V2.1.0-用户手册.pdf")
pdf2.output(manual_pdf)
print(f"用户手册PDF: {manual_pdf}, {os.path.getsize(manual_pdf)//1024}KB")

# WPS 版式对照：自评估报告 DOCX 导入错乱修复

日期：2026-10-28。

## 样本

`D:\downsoft\全国互联网安全管理服务平台_自评估报告_2026-10-16 20_03_32.docx`

这是平台导出的表单式文档：一个 6 列表格、固定列宽、纵向合并单元格、竖排“主体信息/安全评估的基本情况”表头，以及大量 `w:spacing` 紧凑行距。

## 对照方法

WPS 是闭源商业软件，不复制其代码，也不修改其安装目录。使用本机 WPS 12.1.0.26895 通过 COM 将原 DOCX 导出为 `wps-reference.pdf`，以它作为版式基准；海豹办公读取同一份 `word/document.xml`，逐步对照 WPS 的页面结果。

WPS 参考 PDF 只用于本次分析，包含个人信息，未进入仓库。

## 原实现的问题

对照 XML 与海豹办公生成的 HTML，确认三处导致排版错乱：

1. 自动行距直接写成小数：`w:line="185" w:lineRule="auto"` 被写成 `line-height:0.7708…`。WPS 按至少一行处理，原文的实际行距约为 1.0 倍；海豹办公的正文行线因此压在一起。
2. 表格没有固定列宽：忽略了 `w:tblGrid/w:gridCol` 与 `w:tblLayout type="fixed"`，浏览器按内容自动分配列宽，长文本把列挤乱。
3. 竖排单元格没有处理：`w:textDirection w:val="tbRlV"` 未转换为竖排，且把 `w:ind left="1795"` 映射成很大的 `margin-left`，把“主体信息”推出单元格。

## 修复

`main/office/docxReader.js`：

- 自动行距使用 `Math.max(1, 行距 / 240)`，Safari/ArkWeb/Chromium 均不会把中文行高压到重叠。
- 读取 `w:tblGrid` 生成 `<colgroup>`；`w:tblLayout=fixed` 时写入 `table-layout:fixed`。
- 单元格内容增加 `word-break:break-word`，长 URL 不再撑开列。
- `w:textDirection=tbRlV/btLr` 时用内层 `writing-mode:vertical-rl;text-orientation:upright`，并移除会破坏竖排位置的段落左右缩进。
- 保留原有 `colspan/rowspan`、边框、底纹和段落样式处理。
- 忽略残缺的外部超链接；仅页边距有微小差异的多节文档不再触发“需要转换后打开”拦截。

`main/office/docxRoundTrip.test.js` 新增两条回归：

- 185/240 的紧凑行距不得低于 1。
- 固定表格生成列组，竖排单元格生成竖排样式。

## 验证

- `npx vitest run main/office/docxRoundTrip.test.js main/office/docxSourceSecurity.test.js --config vitest.main.config.js`：69 项通过。
- 对原 DOCX 重新生成 HTML 并在 Chromium 中渲染：功能描述、版本号、用户信息留存等长文本不再重叠；表格列宽与竖排表头按 WPS 参考版式显示。
- WPS 参考 PDF 与原 DOCX 保留在私有分析目录，不随发行物分发。

## 边界

本次复刻的是**这份平台表单 DOCX 依赖的 OOXML 排版规则**，不是 WPS 全部文件处理代码。WPS 对 XLSX、PPTX、PDF 的完整兼容层不能通过复制闭源程序实现；后续格式兼容仍需按样本逐项对照、补测试和发布。

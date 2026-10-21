# PDF 新增文字的兼容边界

PDF 页面新增文字、可见批注和视觉替换在 Windows、Linux、Web、Android/HarmonyOS 内置编辑器共用 `main/pdf/pdfTextLayout.js`。此处不改变已导入 PDF 的原文字对象、字符映射或原始字体。

- 先核验每个 Unicode 标量对应的实际字形 ID 大于零，再核验整段排版结果；普通中文优先 Noto Sans SC，缺少的扩展汉字（例如 `𠮷`）使用 Noto Serif CJK SC 回退。
- 新输入文字按 NFC 规范化，因此 `e` 加组合重音会以等价字符 `é` 保存。换行统一为 LF，保留其他空格。
- 当前不保证从右到左、连接字形排版、尚未组合的附标、变体选择符/emoji 序列和控制字符的正确显示。这些输入会明确拒绝本次编辑。字体缺少实际字形时，错误中列出字符与码点；不会替换成空格或写出部分编辑结果。
- 本次使用仓库已有、可以再分发的 Noto 字体及其 OFL 许可证。桌面资源位置为 `resources/fonts/`，Web/移动位置为 `fonts/`；未使用或打包 Windows 专有字体。

`@pdf-lib/fontkit` 固定为 1.1.1，其子集生成包含旧版 TrueType `loca` 奇数偏移和 CID-keyed CFF header/FDSelect 缺陷。`main/pdf/safeFontkit.js` 仅修复 PDF 编辑所创建的字体实例，不修改 `node_modules`、依赖全局原型或其他导出引擎。它对 TrueType 字形记录补齐偶数字节边界，对 CFF 修复合法的 header `offSize` 及每个字形的 FD/局部子程序索引。

来源与依据：

- [fontkit #191：loca 格式与奇数偏移](https://github.com/foliojs/fontkit/pull/191)
- [fontkit #230：Noto CFF 的 FDSelect/局部子程序索引](https://github.com/foliojs/fontkit/pull/230)
- [pdf-lib #1232：子集文本可以提取、页面却缺字的复现](https://github.com/Hopding/pdf-lib/issues/1232)

验证要求是实际写出和重开，并将子集字体生成的页面光栅像素与完整字体嵌入的同一页面逐字比较。单独检查提取文字、文件扩展名或按钮状态不足以验证显示完整性。回归用例位于 `main/pdf/pdfTextLayout.test.js`，包含中文、扩展汉字、组合重音、交替 CFF 字典以及明确拒绝后原 PDF 字节未变化的断言。

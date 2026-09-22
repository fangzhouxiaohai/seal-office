# WPS 文字文档编辑器实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 在仿 WPS 首页之上实现文字文档编辑器，完整还原 Ribbon 六标签界面并提供真实可用的编辑能力。

**架构：** Ribbon 按钮一律派发命令，行为集中在 `editor/commands.ts` 的命令注册表；编辑区为 `contentEditable` 容器；撤销重做由自研快照栈承担；文档内容与历史栈由 `store` 按文档分别持有；可测逻辑全部提取为纯函数。

**技术栈：** Electron 25、Vite 4、React 18、Ant Design 5、Vitest 0.34、@testing-library/react 14、jsdom 22、TypeScript。

**规格来源：** `docs/superpowers/specs/2026-09-22-wps-word-editor-design.md`

---

## 文件结构

| 文件 | 职责 |
| --- | --- |
| `renderer/src/editor/wordCount.ts` | 字数统计纯函数 |
| `renderer/src/editor/history.ts` | 撤销重做快照栈 |
| `renderer/src/editor/exportDoc.ts` | 导出为 HTML 与纯文本 |
| `renderer/src/editor/commands.ts` | 命令注册表与未实现命令工厂 |
| `renderer/src/editor/fontOptions.ts` | 字体、字号、行距、纸张等下拉选项常量 |
| `renderer/src/editor/spellCheck.ts` | 基础拼写检查纯函数 |
| `renderer/src/editor/ribbon/RibbonButton.tsx` | 大按钮、小按钮、下拉按钮 |
| `renderer/src/editor/ribbon/RibbonGroup.tsx` | 功能组（含组名） |
| `renderer/src/editor/ribbon/RibbonPanel.tsx` | 当前标签的功能区 |
| `renderer/src/editor/ribbon/RibbonTabs.tsx` | 标签行 |
| `renderer/src/editor/ribbon/tabs/StartTab.tsx` | 开始标签内容声明 |
| `renderer/src/editor/ribbon/tabs/InsertTab.tsx` | 插入标签内容声明 |
| `renderer/src/editor/ribbon/tabs/LayoutTab.tsx` | 页面布局标签内容声明 |
| `renderer/src/editor/ribbon/tabs/ReferenceTab.tsx` | 引用标签内容声明 |
| `renderer/src/editor/ribbon/tabs/ReviewTab.tsx` | 审阅标签内容声明 |
| `renderer/src/editor/ribbon/tabs/ViewTab.tsx` | 视图标签内容声明 |
| `renderer/src/editor/EditorCanvas.tsx` | contentEditable 编辑区与 A4 纸张 |
| `renderer/src/editor/Ruler.tsx` | 水平标尺 |
| `renderer/src/editor/FindReplacePanel.tsx` | 查找替换浮层 |
| `renderer/src/editor/DocumentTabs.tsx` | 文档标签栏 |
| `renderer/src/editor/EditorStatusBar.tsx` | 编辑器状态栏 |
| `renderer/src/editor/DocEditor.tsx` | 编辑器容器：装配以上全部 |
| `renderer/src/pages/WordPage.tsx` | 由占位页改为渲染 `DocEditor` |
| `renderer/src/store.ts` | 扩展多文档状态与文档级历史栈 |

测试文件与源码同目录，命名 `*.test.ts(x)`。

**任务 1：字数统计**

- 创建：`renderer/src/editor/wordCount.ts`
- 测试：`renderer/src/editor/wordCount.test.ts`

- [ ] 步骤 1：编写失败的测试

```ts
import { describe, it, expect } from 'vitest'
import { countWords } from './wordCount'

describe('字数统计', () => {
  it('纯中文按字计数', () => {
    const 结果 = countWords('今天天气很好')
    expect(结果.字符数).toBe(6)
    expect(结果.词数).toBe(6)
  })

  it('纯英文按词计数', () => {
    const 结果 = countWords('hello world foo')
    expect(结果.词数).toBe(3)
    expect(结果.字符数).toBe(13)
  })

  it('中英混排分别计数', () => {
    const 结果 = countWords('使用 React 开发界面')
    expect(结果.词数).toBe(6)
  })

  it('标点与空白不计入', () => {
    const 结果 = countWords('你好，世界！')
    expect(结果.词数).toBe(4)
  })

  it('按换行统计段落数', () => {
    const 结果 = countWords('第一段\n第二段\n\n第三段')
    expect(结果.段落数).toBe(3)
  })

  it('空字符串各项为零', () => {
    const 结果 = countWords('')
    expect(结果.字符数).toBe(0)
    expect(结果.词数).toBe(0)
    expect(结果.段落数).toBe(0)
  })
})
```

- [ ] 步骤 2：运行确认失败

运行：`npm run test:run -- wordCount`，预期 FAIL，无法解析 `./wordCount`。

- [ ] 步骤 3：实现

```ts
// 字数统计：中文按字、西文按词，标点与空白不计入。
export interface WordCountResult {
  /** 不含空白与标点的字符数 */
  字符数: number
  /** 中文按字、连续西文按词统计后的合计 */
  词数: number
  段落数: number
}

const 中日韩字符 = /[\u4e00-\u9fff\u3400-\u4dbf\uf900-\ufaff]/
const 西文字符 = /[A-Za-z0-9]/

export function countWords(文本: string): WordCountResult {
  if (文本.length === 0) {
    return { 字符数: 0, 词数: 0, 段落数: 0 }
  }

  let 字符数 = 0
  let 词数 = 0
  let 处于西文词中 = false

  for (const 单字 of 文本) {
    if (中日韩字符.test(单字)) {
      字符数 += 1
      词数 += 1
      处于西文词中 = false
      continue
    }
    if (西文字符.test(单字)) {
      字符数 += 1
      if (!处于西文词中) {
        词数 += 1
        处于西文词中 = true
      }
      continue
    }
    处于西文词中 = false
  }

  const 段落数 = 文本
    .split(/\n+/)
    .filter((段) => 段.trim().length > 0).length

  return { 字符数, 词数, 段落数 }
}
```

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增字数统计纯函数`

---

**任务 2：撤销重做历史栈**

- 创建：`renderer/src/editor/history.ts`
- 测试：`renderer/src/editor/history.test.ts`

- [ ] 步骤 1：编写失败的测试

覆盖：初始无可撤销、记录后可撤销、撤销后可重做、新记录清空重做分支、
栈上限 100 条（超出丢弃最早）、`canUndo` 与 `canRedo` 状态正确。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

```ts
// 撤销重做：以内容快照加选区的形式维护历史，栈上限 100 条。
const 栈上限 = 100

export interface 快照 {
  html: string
  /** 选区以路径与偏移的形式保存，避免持有活动 Range 导致失效 */
  selection: { 起点路径: number[]; 起点偏移: number; 终点路径: number[]; 终点偏移: number } | null
}

export class HistoryStack {
  private 列表: 快照[] = []
  private 指针 = -1

  /** 记录新快照；记录后重做分支被清空 */
  record(快照: 快照): void {
    this.列表 = this.列表.slice(0, this.指针 + 1)
    this.列表.push(快照)
    if (this.列表.length > 栈上限) {
      this.列表.shift()
    }
    this.指针 = this.列表.length - 1
  }

  canUndo(): boolean {
    return this.指针 > 0
  }

  canRedo(): boolean {
    return this.指针 < this.列表.length - 1
  }

  undo(): 快照 | null {
    if (!this.canUndo()) {
      return null
    }
    this.指针 -= 1
    return this.列表[this.指针]
  }

  redo(): 快照 | null {
    if (!this.canRedo()) {
      return null
    }
    this.指针 += 1
    return this.列表[this.指针]
  }

  current(): 快照 | null {
    return this.指针 >= 0 ? this.列表[this.指针] : null
  }

  size(): number {
    return this.列表.length
  }
}
```

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增撤销重做历史栈`

---

**任务 3：导出为 HTML 与纯文本**

- 创建：`renderer/src/editor/exportDoc.ts`
- 测试：`renderer/src/editor/exportDoc.test.ts`

- [ ] 步骤 1：编写失败的测试

覆盖：HTML 输出包含标题与 `charset="utf-8"`、包含正文、文本输出去除全部标签、
文本输出把 `<br>` 与块级标签转换为换行、导出文件名由文档名替换扩展名。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

```ts
// 导出文档：拼装独立 HTML 文件，或抽取纯文本。下载由浏览器原生 Blob 触发。
export function 导出为Html(标题: string, 正文Html: string): string {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>${标题}</title>
</head>
<body>
${正文Html}
</body>
</html>
`
}

export function 导出为文本(正文Html: string): string {
  return 正文Html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|h[1-6]|li|tr)>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** 依据文档名生成导出文件名，扩展名按目标格式替换 */
export function 生成文件名(文档名: string, 扩展名: string): string {
  const 基准 = 文档名.replace(/\.[^.]+$/, '')
  return `${基准}.${扩展名}`
}

/** 触发浏览器下载 */
export function 下载文本(内容: string, 文件名: string, 类型: string): void {
  const 片段 = new Blob([内容], { type: `${类型};charset=utf-8` })
  const 地址 = URL.createObjectURL(片段)
  const 链接 = document.createElement('a')
  链接.href = 地址
  链接.download = 文件名
  document.body.appendChild(链接)
  链接.click()
  document.body.removeChild(链接)
  URL.revokeObjectURL(地址)
}
```

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增文档导出能力`

---

**任务 4：命令注册表**

- 创建：`renderer/src/editor/commands.ts`
- 创建：`renderer/src/editor/fontOptions.ts`
- 测试：`renderer/src/editor/commands.test.ts`

- [ ] 步骤 1：编写失败的测试

覆盖：`未实现命令` 工厂生成的命令执行后调用 `notify` 并传入含「开发中」的中文提示；
命令注册表中每个 id 唯一；`查找命令(id)` 能取回已注册命令；未注册 id 返回 `undefined`。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

`fontOptions.ts` 导出 `字体列表`、`字号列表`、`行距列表`、`纸张列表`、`页边距列表`、
`分栏列表`、`水印列表`、`页面边框列表`、`突出显示颜色`、`字体颜色`、`项目符号列表`、
`编号列表`，取值与规格「下拉选项明细」一致。

`commands.ts` 导出：

- `CommandContext` 接口（含 `root`、`history`、`refresh`、`notify`、`view`、`setView`）。
- `EditorCommand` 接口。
- `未实现命令(id, label): EditorCommand`，其 `run` 调用 `notify('该功能开发中')`。
- `命令表: Record<string, EditorCommand>`，键为命令 id。
- `查找命令(id: string): EditorCommand | undefined`。

格式化类命令通过 `document.execCommand` 完成，并在执行前调用 `history.record` 记录快照。

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增编辑器命令注册表`

---

**任务 5：基础拼写检查**

- 创建：`renderer/src/editor/spellCheck.ts`
- 测试：`renderer/src/editor/spellCheck.test.ts`

- [ ] 步骤 1：编写失败的测试

覆盖：识别连续重复汉字（「的的」）、识别中文语境下的半角逗号与句号、
正常文本返回空问题列表、空文本返回空列表。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

```ts
// 基础拼写检查：检测连续重复汉字与中文语境下的半角标点，不依赖外部词典。
export interface 拼写问题 {
  类型: '重复字符' | '半角标点'
  /** 命中位置在文本中的起始下标 */
  位置: number
  /** 命中的原文片段 */
  片段: string
  建议: string
}

export function 检查文本(文本: string): 拼写问题[] {
  const 问题列表: 拼写问题[] = []
  const 重复字符 = /([\u4e00-\u9fff])\1/g
  let 命中: RegExpExecArray | null

  while ((命中 = 重复字符.exec(文本)) !== null) {
    问题列表.push({
      类型: '重复字符',
      位置: 命中.index,
      片段: 命中[0],
      建议: `疑似重复输入「${命中[1]}」`,
    })
  }

  const 半角标点 = /[\u4e00-\u9fff][,;:!?]/g
  while ((命中 = 半角标点.exec(文本)) !== null) {
    问题列表.push({
      类型: '半角标点',
      位置: 命中.index + 1,
      片段: 命中[0].slice(1),
      建议: '中文语境建议使用全角标点',
    })
  }

  return 问题列表.sort((甲, 乙) => 甲.位置 - 乙.位置)
}
```

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增基础拼写检查`

---

**任务 6：Ribbon 基础组件**

- 创建：`renderer/src/editor/ribbon/RibbonButton.tsx`、`RibbonGroup.tsx`、`RibbonPanel.tsx`、`RibbonTabs.tsx`

- [ ] 步骤 1：编写失败的测试

覆盖：`RibbonTabs` 渲染六个标签并回传点击的键；`RibbonGroup` 渲染组名与子元素；
`RibbonButton` 大按钮渲染标签文字、小按钮渲染图标按钮、下拉按钮渲染当前值并能回调；
按钮在 `active` 时带激活类名。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现四个组件

`RibbonButton` 支持三种形态：`size="large"` 上下结构（图标在上、文字在下）、
`size="small"` 紧凑图标按钮、`dropdown` 渲染当前值加下拉箭头。

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增 Ribbon 基础组件`

---

**任务 7 至 12：六个标签页内容声明**

- 创建：`renderer/src/editor/ribbon/tabs/StartTab.tsx`、`InsertTab.tsx`、`LayoutTab.tsx`、`ReferenceTab.tsx`、`ReviewTab.tsx`、`ViewTab.tsx`

每个标签页组件只做声明：按规格第三章的表格渲染若干 `RibbonGroup`，每组内渲染若干
`RibbonButton`，按钮绑定 `commands.ts` 中的命令 id。不在此处编写行为代码。

- [ ] 每个标签页各写一条测试：渲染后包含该标签的若干组名（如开始页含「剪贴板」「字体」「段落」）
- [ ] 每个标签页实现后运行测试确认通过
- [ ] 六个标签页合并提交 `feat: 新增 Ribbon 六个标签页内容`

---

**任务 13：编辑区与标尺**

- 创建：`renderer/src/editor/EditorCanvas.tsx`、`renderer/src/editor/Ruler.tsx`

- [ ] 步骤 1：编写失败的测试

覆盖：`EditorCanvas` 渲染 `contentEditable` 容器、传入初始 HTML 后内容正确、
内容变化时回调最新 HTML、`showParagraphMark` 为真时容器带对应类名。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

`EditorCanvas` 负责：挂载 `contentEditable`、内容变化时防抖回调、
拦截粘贴仅插入纯文本、按缩放比例设置纸张变换。
`Ruler` 渲染刻度与三个缩进标记，仅作视觉呈现，本轮不响应拖拽。

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增编辑区与水平标尺`

---

**任务 14：查找替换面板**

- 创建：`renderer/src/editor/FindReplacePanel.tsx`
- 测试：`renderer/src/editor/FindReplacePanel.test.tsx`

- [ ] 步骤 1：编写失败的测试

覆盖：输入为空时点击查找提示「请输入查找内容」；有输入时回调查找词；
点击全部替换回传替换结果计数；无匹配时展示「未找到匹配内容」。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

面板为受控浮层，接收 `onFind`、`onReplace`、`onReplaceAll`、`onClose` 回调，
自身只维护输入状态与提示展示。

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增查找替换面板`

---

**任务 15：文档标签栏**

- 创建：`renderer/src/editor/DocumentTabs.tsx`
- 测试：`renderer/src/editor/DocumentTabs.test.tsx`

- [ ] 步骤 1：编写失败的测试

覆盖：渲染全部文档标签、当前标签带选中类名、点击标签回传其 id、
点击关闭按钮回传关闭事件且不触发切换、点击新建标签回传新建事件。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现
- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增文档标签栏`

---

**任务 16：编辑器状态栏**

- 创建：`renderer/src/editor/EditorStatusBar.tsx`
- 测试：`renderer/src/editor/EditorStatusBar.test.tsx`

- [ ] 步骤 1：编写失败的测试

覆盖：展示页码与总页数、展示字数、展示当前缩放百分比、
点击放大与缩小按钮回传新比例、点击 100% 复位。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现
- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增编辑器状态栏`

---

**任务 17：编辑器容器装配**

- 创建：`renderer/src/editor/DocEditor.tsx`
- 测试：`renderer/src/editor/DocEditor.test.tsx`

- [ ] 步骤 1：编写失败的测试

覆盖：渲染后同时存在文档标签栏、六个 Ribbon 标签、编辑区与状态栏；
点击「插入」标签后功能区切换为插入内容；点击加粗按钮派发命令（以 spy 替换命令 run）。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

`DocEditor` 负责：持有 `CommandContext`、装配各区域、维护当前 Ribbon 标签与查找面板开关、
把 `store` 中的当前文档内容传入编辑区并在变更时写回。

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 新增编辑器容器`

---

**任务 18：状态层扩展与路由接入**

- 修改：`renderer/src/store.ts`、`renderer/src/pages/WordPage.tsx`、`renderer/src/styles.css`

- [ ] 步骤 1：编写失败的测试

覆盖：`store` 提供 `documents` 与 `activeDocumentId`；`createDoc('word')` 后新增一个文档标签；
`updateDocumentHtml` 写回内容；`closeDocument` 在关闭最后一个文档时把模块切回 `home`。

- [ ] 步骤 2：运行确认失败
- [ ] 步骤 3：实现

`EditorDocument` 结构见规格第四章。`WordPage` 改为渲染 `DocEditor`，
`styles.css` 追加编辑器全部样式类。

- [ ] 步骤 4：运行确认通过
- [ ] 步骤 5：提交 `feat: 接入编辑器并扩展多文档状态`

---

**任务 19：完整验证**

- [ ] 步骤 1：`npm run test:run` 全部通过
- [ ] 步骤 2：`npm run typecheck` 退出码 0
- [ ] 步骤 3：`npm run build` 构建成功
- [ ] 步骤 4：启动应用，通过 CDP 逐项验证

| 序号 | 操作 | 预期 |
| --- | --- | --- |
| 1 | 新建文字文档 | 进入编辑器，顶栏显示未命名文档.docx |
| 2 | 依次点击六个 Ribbon 标签 | 功能区内容随之切换，无空白标签 |
| 3 | 输入中文后点击加粗 | 文字加粗，状态栏字数随之变化 |
| 4 | 点击居中对齐 | 段落居中 |
| 5 | 撤销后重做 | 内容依次回退与恢复 |
| 6 | 查找「文档」并全部替换 | 提示替换处数，内容更新 |
| 7 | 点击图表按钮 | 提示该功能开发中，不跳转 |
| 8 | 导出为文本 | 触发下载且内容与编辑区一致 |
| 9 | 新建第二个标签后切换 | 标签切换，内容互不串档 |
| 10 | 关闭全部标签 | 回到首页视图 |

- [ ] 步骤 5：截图存于 `docs/screenshots/editor/` 并核对

---

**任务 20：文档更新与提交**

- [ ] 步骤 1：更新 `功能修改说明.md`，新增编辑器章节
- [ ] 步骤 2：更新 `README.md`，补充编辑器目录结构与运行方式
- [ ] 步骤 3：提交 `docs: 补充文字编辑器说明`

---

## 自检结论

**规格覆盖度：** 规格第二章界面结构由任务 13、15、16、17 覆盖；第三章 Ribbon 内容由任务 6 至 12 覆盖；
第四章核心架构由任务 1 至 5、13、14、18 覆盖；第五章状态栏由任务 16 覆盖；
第六章测试策略由各任务测试步骤与任务 19 覆盖；第七章验证方式由任务 19 覆盖；第八章交付物由任务 20 覆盖。

**占位符扫描：** 任务 6 至 18 的 UI 组件以「步骤 2 实现、步骤 3 测试」的形式给出职责与测试点，
未逐字列出 JSX。这是刻意的：规格第二章已明确每个区域的字段与交互，
且这些组件的结构由测试断言固定，实施时以测试为准。

**类型一致性：** `CommandContext`、`EditorCommand`、`Snapshot`、`WordCountResult`、
`拼写问题`、`EditorDocument` 在任务 1 至 5、18 中定义，后续任务只引用不重定义。

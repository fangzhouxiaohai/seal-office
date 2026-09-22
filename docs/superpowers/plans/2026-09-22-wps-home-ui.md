# WPS 首页 UI 实现计划

> **面向 AI 代理的工作者：** 必需子技能：使用 superpowers:subagent-driven-development（推荐）或 superpowers:executing-plans 逐任务实现此计划。步骤使用复选框（`- [ ]`）语法来跟踪进度。

**目标：** 将现有最简骨架界面替换为可辨识的仿 WPS 新版首页，含顶栏、左侧导航、新建四宫格、最近文档网格与列表、空状态与底部状态栏。

**架构：** 渲染进程内以 React Context（`store.ts`）承载当前模块、导航筛选、视图模式、排序与文档列表；`routes.tsx` 作为模块与导航映射的唯一事实源；`App.tsx` 只负责按当前模块装配首页视图或编辑器视图；展示组件全部为受控组件，由上层注入数据与回调。

**技术栈：** Electron 25、Vite 4、React 18、Ant Design 5、Vitest 0.34、@testing-library/react 14、jsdom 22。

**规格来源：** `docs/superpowers/specs/2026-09-22-wps-home-ui-design.md`

---

## 文件结构

| 文件 | 职责 | 动作 |
| --- | --- | --- |
| `.gitignore` | 排除构建产物与依赖目录 | 创建 |
| `vite.config.js` | 追加 vitest 测试配置 | 修改 |
| `renderer/src/test/setup.ts` | 测试环境补桩（matchMedia、ResizeObserver） | 创建 |
| `renderer/src/mock/recentDocs.ts` | 文档类型、静态示例数据、筛选排序与格式化纯函数 | 创建 |
| `renderer/src/routes.tsx` | 导航分组、模块注册表、文档类型到模块的映射 | 改写 |
| `renderer/src/store.ts` | 应用状态 Context 与 `useAppStore` | 改写 |
| `renderer/src/components/Icon.tsx` | 内联 SVG 图标集 | 创建 |
| `renderer/src/components/ErrorBoundary.tsx` | 渲染异常中文兜底 | 创建 |
| `renderer/src/components/EmptyState.tsx` | 通用空状态 | 创建 |
| `renderer/src/components/TitleBar.tsx` | 顶栏 | 创建 |
| `renderer/src/components/Sidebar.tsx` | 左侧导航 | 创建 |
| `renderer/src/components/NewDocGrid.tsx` | 新建四宫格 | 创建 |
| `renderer/src/components/DocCard.tsx` | 文档卡片（网格视图） | 创建 |
| `renderer/src/components/DocRow.tsx` | 文档行（列表视图） | 创建 |
| `renderer/src/components/RecentDocs.tsx` | 最近文档标题行、视图容器、空状态装配 | 创建 |
| `renderer/src/components/Footer.tsx` | 底部状态栏 | 创建 |
| `renderer/src/pages/EditorPlaceholder.tsx` | 编辑器占位内容（三个模块共用） | 创建 |
| `renderer/src/pages/HomePage.tsx` | 首页装配 | 创建 |
| `renderer/src/pages/WordPage.tsx` | 文档模块页 | 创建 |
| `renderer/src/pages/TablePage.tsx` | 表格模块页 | 创建 |
| `renderer/src/pages/PptPage.tsx` | 演示模块页 | 创建 |
| `renderer/src/App.tsx` | 视图分发与整体装配 | 改写 |
| `renderer/src/styles.css` | 设计令牌与全部组件样式 | 改写 |
| `package.json` | 追加 test 脚本与开发依赖 | 修改 |
| `功能修改说明.md` | 本次功能修改记录 | 改写 |
| `README.md` | 目录结构与运行方式更新 | 修改 |

类名约定：统一使用 `wps-` 前缀的 BEM 风格，例如 `wps-sidebar`、`wps-nav-item--active`、
`wps-doc-card__name`。组件与样式严格按此对齐。

---

## 任务 1：Git 仓库初始化与忽略清单

**文件：**
- 创建：`.gitignore`

- [ ] **步骤 1：创建忽略清单**

```
node_modules/
dist/
.vite/
*.log
__app_run.log
```

- [ ] **步骤 2：初始化仓库并首次提交**

运行：

```powershell
git init
git add .gitignore package.json vite.config.js main renderer docs README.md 功能修改说明.md
git commit -m "chore: 初始化仓库并纳入既有工程文件"
```

预期：输出 `create mode` 若干条，末尾显示提交哈希。`git status` 中不再出现 `node_modules` 与 `dist`。

---

## 任务 2：测试基础设施

**文件：**
- 修改：`package.json`
- 修改：`vite.config.js`
- 创建：`renderer/src/test/setup.ts`

- [ ] **步骤 1：安装开发依赖**

运行：

```powershell
npm install -D vitest@^0.34.6 @testing-library/react@^14.3.1 @testing-library/jest-dom@^6.6.3 @testing-library/user-event@^14.5.2 jsdom@^22.1.0
```

预期：`added N packages`，无 `ERESOLVE` 报错。若出现 Electron 相关的 `ETIMEDOUT`，
说明误触发了 Electron 重装，需确认 `node_modules/electron/dist/electron.exe` 仍存在。

- [ ] **步骤 2：追加测试脚本**

修改 `package.json` 的 `scripts`，在 `preview` 之后追加：

```json
    "test": "vitest",
    "test:run": "vitest run"
```

- [ ] **步骤 3：写入测试环境补桩**

创建 `renderer/src/test/setup.ts`：

```ts
// 测试环境补桩：jsdom 未实现 matchMedia 与 ResizeObserver，
// Ant Design 的响应式与尺寸监听依赖二者，缺失会导致组件渲染抛错。
import '@testing-library/jest-dom/vitest'
import { vi } from 'vitest'

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: (query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }),
})

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

Object.defineProperty(window, 'ResizeObserver', {
  writable: true,
  value: ResizeObserverStub,
})
```

- [ ] **步骤 4：追加 vitest 配置**

修改 `vite.config.js`，在 `build` 字段之后追加 `test` 字段（注意 `root` 已是 `renderer`，
因此路径相对 `renderer` 解析）：

```js
  test: {
    environment: 'jsdom',
    globals: false,
    css: false,
    include: ['src/**/*.test.{ts,tsx}'],
    setupFiles: ['src/test/setup.ts'],
  },
```

- [ ] **步骤 5：写入链路自检测试**

创建 `renderer/src/test/smoke.test.ts`：

```ts
import { describe, it, expect } from 'vitest'

describe('测试基础设施', () => {
  it('提供 jsdom 文档环境', () => {
    expect(typeof document.createElement('div').appendChild).toBe('function')
  })

  it('补齐了 matchMedia 补桩', () => {
    expect(typeof window.matchMedia).toBe('function')
  })
})
```

- [ ] **步骤 6：运行确认通过**

运行：`npm run test:run`
预期：`Test Files 1 passed`，`Tests 2 passed`。

- [ ] **步骤 7：提交**

```powershell
git add package.json package-lock.json vite.config.js renderer/src/test
git commit -m "test: 引入 Vitest 与 Testing Library 测试基础设施"
```

---

## 任务 3：文档数据层

**文件：**
- 创建：`renderer/src/mock/recentDocs.ts`
- 测试：`renderer/src/mock/recentDocs.test.ts`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/mock/recentDocs.test.ts`：

```ts
import { describe, it, expect } from 'vitest'
import {
  RECENT_DOCS,
  filterDocs,
  sortDocs,
  formatSize,
  formatTime,
  type DocItem,
} from './recentDocs'

const 样本: DocItem[] = [
  { id: 'a', name: '乙文档.docx', type: 'word', size: 2048, updatedAt: '2026-09-20 09:00', starred: false, shared: true },
  { id: 'b', name: '甲文档.xlsx', type: 'table', size: 1048576, updatedAt: '2026-09-22 18:30', starred: true, shared: false },
  { id: 'c', name: '丙文档.pptx', type: 'ppt', size: 512, updatedAt: '2026-09-21 12:00', starred: true, shared: true },
]

describe('静态示例数据', () => {
  it('覆盖四种文档类型', () => {
    const 类型集合 = new Set(RECENT_DOCS.map((文档) => 文档.type))
    expect(类型集合).toEqual(new Set(['word', 'table', 'ppt', 'pdf']))
  })

  it('标识唯一', () => {
    const 标识集合 = new Set(RECENT_DOCS.map((文档) => 文档.id))
    expect(标识集合.size).toBe(RECENT_DOCS.length)
  })
})

describe('filterDocs', () => {
  it('首页与最近返回全部文档', () => {
    expect(filterDocs(样本, 'home')).toHaveLength(3)
    expect(filterDocs(样本, 'recent')).toHaveLength(3)
  })

  it('星标仅返回已星标文档', () => {
    expect(filterDocs(样本, 'star').map((文档) => 文档.id)).toEqual(['b', 'c'])
  })

  it('共享仅返回已共享文档', () => {
    expect(filterDocs(样本, 'shared').map((文档) => 文档.id)).toEqual(['a', 'c'])
  })

  it('未知筛选键返回全部文档而不抛出异常', () => {
    expect(filterDocs(样本, '未知')).toHaveLength(3)
  })
})

describe('sortDocs', () => {
  it('按修改时间倒序', () => {
    expect(sortDocs(样本, 'time').map((文档) => 文档.id)).toEqual(['b', 'c', 'a'])
  })

  it('按名称升序使用中文拼音排序规则', () => {
    // 丙(bing) < 甲(jia) < 乙(yi)
    expect(sortDocs(样本, 'name').map((文档) => 文档.id)).toEqual(['c', 'b', 'a'])
  })

  it('按大小降序', () => {
    expect(sortDocs(样本, 'size').map((文档) => 文档.id)).toEqual(['b', 'a', 'c'])
  })

  it('不修改传入数组', () => {
    const 副本 = [...样本]
    sortDocs(样本, 'size')
    expect(样本).toEqual(副本)
  })
})

describe('formatSize', () => {
  it('小于 1KB 显示字节', () => {
    expect(formatSize(512)).toBe('512 B')
  })

  it('按 KB 保留一位小数', () => {
    expect(formatSize(2048)).toBe('2.0 KB')
  })

  it('按 MB 保留一位小数', () => {
    expect(formatSize(1048576)).toBe('1.0 MB')
  })
})

describe('formatTime', () => {
  const 当前 = new Date('2026-09-22 20:00')

  it('当天显示今天加时分', () => {
    expect(formatTime('2026-09-22 18:30', 当前)).toBe('今天 18:30')
  })

  it('前一天显示昨天', () => {
    expect(formatTime('2026-09-21 12:00', 当前)).toBe('昨天 12:00')
  })

  it('三天内显示天数', () => {
    expect(formatTime('2026-09-20 09:00', 当前)).toBe('2 天前')
  })

  it('超过三天显示日期', () => {
    expect(formatTime('2026-09-01 09:00', 当前)).toBe('2026-09-01')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- recentDocs`
预期：FAIL，报错包含 `Failed to resolve import "./recentDocs"`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/mock/recentDocs.ts`：

```ts
// 文档数据层：类型定义、静态示例数据与筛选排序纯函数。
// 本轮不接入真实文件系统，示例数据仅用于界面演示，不代表任何真实用户文件。

export type DocType = 'word' | 'table' | 'ppt' | 'pdf'

export type SortKey = 'time' | 'name' | 'size'

export interface DocItem {
  id: string
  name: string
  type: DocType
  /** 文件字节数 */
  size: number
  /** 修改时间，格式 YYYY-MM-DD HH:mm */
  updatedAt: string
  starred: boolean
  shared: boolean
}

/** 导航筛选键，与 routes.tsx 中的导航项 key 对应 */
export type NavKey = 'home' | 'recent' | 'star' | 'shared'

export const RECENT_DOCS: DocItem[] = [
  { id: 'd01', name: '2026 年第三季度经营分析报告.docx', type: 'word', size: 2438144, updatedAt: '2026-09-22 18:30', starred: true, shared: true },
  { id: 'd02', name: '部门预算执行明细表.xlsx', type: 'table', size: 856064, updatedAt: '2026-09-22 15:12', starred: true, shared: false },
  { id: 'd03', name: '产品发布方案汇报.pptx', type: 'ppt', size: 15728640, updatedAt: '2026-09-22 11:05', starred: false, shared: true },
  { id: 'd04', name: '员工入职流程说明.pdf', type: 'pdf', size: 1048576, updatedAt: '2026-09-21 17:40', starred: false, shared: true },
  { id: 'd05', name: '项目验收交付清单.docx', type: 'word', size: 327680, updatedAt: '2026-09-21 09:26', starred: false, shared: false },
  { id: 'd06', name: '客户回访记录汇总表.xlsx', type: 'table', size: 512000, updatedAt: '2026-09-20 16:55', starred: true, shared: true },
  { id: 'd07', name: '年度述职报告演示.pptx', type: 'ppt', size: 8388608, updatedAt: '2026-09-20 10:18', starred: false, shared: false },
  { id: 'd08', name: '制度汇编修订稿.docx', type: 'word', size: 1572864, updatedAt: '2026-09-19 14:02', starred: false, shared: true },
  { id: 'd09', name: '供应商报价对比表.xlsx', type: 'table', size: 409600, updatedAt: '2026-09-18 11:47', starred: true, shared: false },
  { id: 'd10', name: '安全生产培训材料.pdf', type: 'pdf', size: 5242880, updatedAt: '2026-09-17 09:30', starred: false, shared: false },
  { id: 'd11', name: '市场推广执行计划.pptx', type: 'ppt', size: 6291456, updatedAt: '2026-09-15 15:20', starred: false, shared: true },
  { id: 'd12', name: '会议纪要模板.docx', type: 'word', size: 71680, updatedAt: '2026-09-12 08:45', starred: true, shared: false },
]

/**
 * 按导航项筛选文档；未知筛选键返回全部文档，避免界面因未知状态出现空白。
 */
export function filterDocs(docs: DocItem[], navKey: string): DocItem[] {
  switch (navKey) {
    case 'star':
      return docs.filter((文档) => 文档.starred)
    case 'shared':
      return docs.filter((文档) => 文档.shared)
    case 'home':
    case 'recent':
    default:
      return [...docs]
  }
}

/**
 * 按指定维度排序；返回新数组，不修改入参。
 */
export function sortDocs(docs: DocItem[], key: SortKey): DocItem[] {
  const 结果 = [...docs]
  switch (key) {
    case 'name':
      结果.sort((甲, 乙) => 甲.name.localeCompare(乙.name, 'zh-Hans-CN'))
      break
    case 'size':
      结果.sort((甲, 乙) => 乙.size - 甲.size)
      break
    case 'time':
    default:
      结果.sort((甲, 乙) => 乙.updatedAt.localeCompare(甲.updatedAt))
      break
  }
  return 结果
}

/**
 * 将字节数格式化为中文可读大小。
 */
export function formatSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`
}

/**
 * 将修改时间格式化为中文相对时间。
 * 传入 now 便于测试获得确定性结果。
 */
export function formatTime(value: string, now: Date = new Date()): string {
  const 目标 = new Date(value.replace(' ', 'T'))
  if (Number.isNaN(目标.getTime())) {
    return value
  }

  const 当天零点 = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const 目标零点 = new Date(目标.getFullYear(), 目标.getMonth(), 目标.getDate())
  const 相差天数 = Math.round((当天零点.getTime() - 目标零点.getTime()) / 86400000)
  const 时分 = `${String(目标.getHours()).padStart(2, '0')}:${String(目标.getMinutes()).padStart(2, '0')}`

  if (相差天数 <= 0) {
    return `今天 ${时分}`
  }
  if (相差天数 === 1) {
    return `昨天 ${时分}`
  }
  if (相差天数 <= 3) {
    return `${相差天数} 天前`
  }
  return `${目标.getFullYear()}-${String(目标.getMonth() + 1).padStart(2, '0')}-${String(目标.getDate()).padStart(2, '0')}`
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- recentDocs`
预期：`Tests 15 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/mock
git commit -m "feat: 新增文档数据层与筛选排序能力"
```

---

## 任务 4：模块路由表

**文件：**
- 改写：`renderer/src/routes.tsx`
- 测试：`renderer/src/routes.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/routes.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import {
  NAV_GROUPS,
  MODULES,
  DOC_TYPE_TO_MODULE,
  NEW_DOC_ENTRIES,
  type ModuleKey,
} from './routes'

describe('导航分组', () => {
  it('包含四个分组', () => {
    expect(NAV_GROUPS).toHaveLength(4)
  })

  it('第一组为首页、最近、星标、共享', () => {
    expect(NAV_GROUPS[0].map((项) => 项.key)).toEqual(['home', 'recent', 'star', 'shared'])
  })

  it('每个导航项都有中文名称与图标键', () => {
    NAV_GROUPS.flat().forEach((项) => {
      expect(项.label.length).toBeGreaterThan(0)
      expect(项.icon.length).toBeGreaterThan(0)
    })
  })
})

describe('模块注册表', () => {
  it('覆盖首页与三个编辑器模块', () => {
    const 键集合 = Object.keys(MODULES).sort()
    expect(键集合).toEqual(['home', 'ppt', 'table', 'word'])
  })

  it('每个模块都有中文名称', () => {
    ;(Object.keys(MODULES) as ModuleKey[]).forEach((键) => {
      expect(MODULES[键].label.length).toBeGreaterThan(0)
    })
  })
})

describe('文档类型到模块的映射', () => {
  it('四种类型均有目标模块', () => {
    expect(DOC_TYPE_TO_MODULE.word).toBe('word')
    expect(DOC_TYPE_TO_MODULE.table).toBe('table')
    expect(DOC_TYPE_TO_MODULE.ppt).toBe('ppt')
    expect(DOC_TYPE_TO_MODULE.pdf).toBe('home')
  })
})

describe('新建入口', () => {
  it('包含文字、表格、演示、PDF 四项', () => {
    expect(NEW_DOC_ENTRIES.map((项) => 项.key)).toEqual(['word', 'table', 'ppt', 'pdf'])
  })

  it('前三项可跳转，PDF 标记为未实现', () => {
    expect(NEW_DOC_ENTRIES.filter((项) => 项.implemented)).toHaveLength(3)
    expect(NEW_DOC_ENTRIES.find((项) => 项.key === 'pdf')?.implemented).toBe(false)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- routes`
预期：FAIL，`routes.tsx` 未导出 `NAV_GROUPS`。

- [ ] **步骤 3：编写实现代码**

改写 `renderer/src/routes.tsx`：

```tsx
// 模块与导航注册表：全应用模块清单的唯一事实源。
// 新增模块时只需在此登记，侧栏、新建区与页面分发自动生效。
import type { ComponentType } from 'react'
import type { DocType } from './mock/recentDocs'
import HomePage from './pages/HomePage'
import WordPage from './pages/WordPage'
import TablePage from './pages/TablePage'
import PptPage from './pages/PptPage'

export type ModuleKey = 'home' | 'word' | 'table' | 'ppt'

export interface NavItem {
  key: string
  label: string
  /** Icon 组件中的图标名称 */
  icon: string
  /** 该项是否支持切换内容，未实现的项仅提示功能开发中 */
  implemented: boolean
}

export interface ModuleInfo {
  key: ModuleKey
  label: string
  page: ComponentType
}

/** 侧栏导航分组，按数组顺序渲染，组间以细线分隔 */
export const NAV_GROUPS: NavItem[][] = [
  [
    { key: 'home', label: '首页', icon: 'home', implemented: true },
    { key: 'recent', label: '最近', icon: 'clock', implemented: true },
    { key: 'star', label: '星标', icon: 'star', implemented: true },
    { key: 'shared', label: '共享', icon: 'share', implemented: true },
  ],
  [
    { key: 'cloud', label: '我的云文档', icon: 'cloud', implemented: false },
    { key: 'team', label: '团队文档', icon: 'users', implemented: false },
  ],
  [
    { key: 'pdf', label: 'PDF 工具', icon: 'pdf', implemented: false },
    { key: 'mindmap', label: '脑图', icon: 'mindmap', implemented: false },
    { key: 'flow', label: '流程图', icon: 'flow', implemented: false },
  ],
  [
    { key: 'settings', label: '设置', icon: 'settings', implemented: false },
    { key: 'help', label: '帮助与反馈', icon: 'help', implemented: false },
  ],
]

export const MODULES: Record<ModuleKey, ModuleInfo> = {
  home: { key: 'home', label: '首页', page: HomePage },
  word: { key: 'word', label: '文档', page: WordPage },
  table: { key: 'table', label: '表格', page: TablePage },
  ppt: { key: 'ppt', label: '演示', page: PptPage },
}

/** 文档类型对应的打开目标；PDF 暂不支持编辑，回落首页 */
export const DOC_TYPE_TO_MODULE: Record<DocType, ModuleKey> = {
  word: 'word',
  table: 'table',
  ppt: 'ppt',
  pdf: 'home',
}

export interface NewDocEntry {
  key: DocType
  label: string
  icon: string
  color: string
  implemented: boolean
}

/** 首页新建区四宫格入口 */
export const NEW_DOC_ENTRIES: NewDocEntry[] = [
  { key: 'word', label: '新建文字', icon: 'doc-word', color: '#2B6CF6', implemented: true },
  { key: 'table', label: '新建表格', icon: 'doc-table', color: '#00A870', implemented: true },
  { key: 'ppt', label: '新建演示', icon: 'doc-ppt', color: '#ED7B2F', implemented: true },
  { key: 'pdf', label: 'PDF 工具', icon: 'doc-pdf', color: '#E34D59', implemented: false },
]

/** 模块 key 到文档类型的反查，供编辑器视图使用 */
export function moduleToDocType(模块: ModuleKey): DocType | null {
  switch (模块) {
    case 'word':
      return 'word'
    case 'table':
      return 'table'
    case 'ppt':
      return 'ppt'
    default:
      return null
  }
}
```

说明：本步骤同时创建 `pages/` 下四个页面文件的空壳，供导入解析通过。先写入最小实现：

`renderer/src/pages/HomePage.tsx`：

```tsx
import React from 'react'

const HomePage = () => <div className="wps-home" />

export default HomePage
```

`renderer/src/pages/WordPage.tsx`：

```tsx
import React from 'react'

const WordPage = () => <div className="wps-editor" />

export default WordPage
```

`renderer/src/pages/TablePage.tsx`：

```tsx
import React from 'react'

const TablePage = () => <div className="wps-editor" />

export default TablePage
```

`renderer/src/pages/PptPage.tsx`：

```tsx
import React from 'react'

const PptPage = () => <div className="wps-editor" />

export default PptPage
```

这四个文件在任务 15、16 中补全为真实内容。

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- routes`
预期：`Tests 11 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/routes.tsx renderer/src/routes.test.tsx renderer/src/pages
git commit -m "feat: 新增模块与导航注册表"
```

---

## 任务 5：应用状态层

**文件：**
- 改写：`renderer/src/store.ts`
- 测试：`renderer/src/store.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/store.test.tsx`：

```tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { AppProvider, useAppStore } from './store'

/** 探针组件：把状态与操作暴露为可点击按钮，便于断言 */
const 探针 = () => {
  const 状态 = useAppStore()
  return (
    <div>
      <span data-testid="module">{状态.module}</span>
      <span data-testid="nav">{状态.navKey}</span>
      <span data-testid="view">{状态.viewMode}</span>
      <span data-testid="sort">{状态.sortKey}</span>
      <span data-testid="star-count">{状态.docs.filter((文档) => 文档.starred).length}</span>
      <span data-testid="visible-count">{状态.visibleDocs.length}</span>
      <button onClick={() => 状态.setModule('word')}>切模块</button>
      <button onClick={() => 状态.setNavKey('star')}>切星标</button>
      <button onClick={() => 状态.setViewMode('list')}>切列表</button>
      <button onClick={() => 状态.setSortKey('size')}>切排序</button>
      <button onClick={() => 状态.toggleStar(状态.docs[0].id)}>切首个星标</button>
    </div>
  )
}

const 渲染探针 = () =>
  render(
    <AppProvider>
      <探针 />
    </AppProvider>
  )

describe('应用状态层', () => {
  it('初始处于首页、网格视图、按时间排序', () => {
    渲染探针()
    expect(screen.getByTestId('module')).toHaveTextContent('home')
    expect(screen.getByTestId('nav')).toHaveTextContent('home')
    expect(screen.getByTestId('view')).toHaveTextContent('grid')
    expect(screen.getByTestId('sort')).toHaveTextContent('time')
  })

  it('初始展示全部示例文档', () => {
    渲染探针()
    expect(screen.getByTestId('visible-count')).toHaveTextContent('12')
  })

  it('切换模块后模块标识更新', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切模块'))
    expect(screen.getByTestId('module')).toHaveTextContent('word')
  })

  it('切换到星标筛选后可见文档减少', async () => {
    渲染探针()
    const 切换前 = screen.getByTestId('visible-count').textContent
    await userEvent.click(screen.getByText('切星标'))
    expect(screen.getByTestId('nav')).toHaveTextContent('star')
    expect(screen.getByTestId('visible-count').textContent).not.toBe(切换前)
  })

  it('切换视图模式生效', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切列表'))
    expect(screen.getByTestId('view')).toHaveTextContent('list')
  })

  it('切换排序方式生效', async () => {
    渲染探针()
    await userEvent.click(screen.getByText('切排序'))
    expect(screen.getByTestId('sort')).toHaveTextContent('size')
  })

  it('切换星标后星标数量变化', async () => {
    渲染探针()
    const 切换前 = Number(screen.getByTestId('star-count').textContent)
    await userEvent.click(screen.getByText('切首个星标'))
    const 切换后 = Number(screen.getByTestId('star-count').textContent)
    expect(Math.abs(切换后 - 切换前)).toBe(1)
  })

  it('在 Provider 之外使用时抛出中文异常', () => {
    // 抑制 React 对错误边界的控制台告警，保持测试输出整洁
    const 原始错误 = console.error
    console.error = () => {}
    expect(() => render(<探针 />)).toThrowError(/必须在 AppProvider 内使用/)
    console.error = 原始错误
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- store`
预期：FAIL，`store.ts` 未导出 `AppProvider`。

- [ ] **步骤 3：编写实现代码**

改写 `renderer/src/store.ts`：

```ts
// 应用状态层：集中承载当前模块、导航筛选、视图模式、排序方式与文档列表。
// 采用 Context 而非全局变量，保证状态随组件树卸载而释放，便于测试隔离。
import React, { createContext, useContext, useMemo, useState } from 'react'
import {
  RECENT_DOCS,
  filterDocs,
  sortDocs,
  type DocItem,
  type SortKey,
} from './mock/recentDocs'
import type { ModuleKey } from './routes'

export type ViewMode = 'grid' | 'list'

export interface AppState {
  /** 当前模块，home 为首页，其余为编辑器 */
  module: ModuleKey
  setModule: (模块: ModuleKey) => void
  /** 首页内的导航筛选键 */
  navKey: string
  setNavKey: (键: string) => void
  viewMode: ViewMode
  setViewMode: (模式: ViewMode) => void
  sortKey: SortKey
  setSortKey: (键: SortKey) => void
  /** 全量文档 */
  docs: DocItem[]
  /** 经筛选与排序后用于渲染的文档 */
  visibleDocs: DocItem[]
  toggleStar: (标识: string) => void
  /** 当前打开的文档标识，用于卡片选中态 */
  activeDocId: string | null
  setActiveDocId: (标识: string | null) => void
  /** 打开文档：按文档类型跳转到对应模块 */
  openDoc: (文档: DocItem) => void
}

const AppContext = createContext<AppState | null>(null)

/** 文档类型到模块的映射，与 routes.tsx 保持一致，此处内联以避免循环依赖 */
const 类型到模块: Record<DocItem['type'], ModuleKey> = {
  word: 'word',
  table: 'table',
  ppt: 'ppt',
  pdf: 'home',
}

export function AppProvider({ children }: { children: React.ReactNode }) {
  const [module, setModule] = useState<ModuleKey>('home')
  const [navKey, setNavKey] = useState<string>('home')
  const [viewMode, setViewMode] = useState<ViewMode>('grid')
  const [sortKey, setSortKey] = useState<SortKey>('time')
  const [docs, setDocs] = useState<DocItem[]>(RECENT_DOCS)
  const [activeDocId, setActiveDocId] = useState<string | null>(null)

  const visibleDocs = useMemo(
    () => sortDocs(filterDocs(docs, navKey), sortKey),
    [docs, navKey, sortKey]
  )

  const toggleStar = (标识: string) => {
    setDocs((当前) =>
      当前.map((文档) => (文档.id === 标识 ? { ...文档, starred: !文档.starred } : 文档))
    )
  }

  const openDoc = (文档: DocItem) => {
    setActiveDocId(文档.id)
    setModule(类型到模块[文档.type])
  }

  const 值 = useMemo<AppState>(
    () => ({
      module,
      setModule,
      navKey,
      setNavKey,
      viewMode,
      setViewMode,
      sortKey,
      setSortKey,
      docs,
      visibleDocs,
      toggleStar,
      activeDocId,
      setActiveDocId,
      openDoc,
    }),
    [module, navKey, viewMode, sortKey, docs, visibleDocs, activeDocId]
  )

  return React.createElement(AppContext.Provider, { value: 值 }, children)
}

/**
 * 读取应用状态；脱离 Provider 使用属于编码错误，直接抛出明确中文异常。
 */
export function useAppStore(): AppState {
  const 状态 = useContext(AppContext)
  if (状态 === null) {
    throw new Error('useAppStore 必须在 AppProvider 内使用')
  }
  return 状态
}
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- store`
预期：`Tests 8 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/store.ts renderer/src/store.test.tsx
git commit -m "feat: 新增应用状态层"
```

---

## 任务 6：图标集

**文件：**
- 创建：`renderer/src/components/Icon.tsx`
- 测试：`renderer/src/components/Icon.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/Icon.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import Icon, { ICON_NAMES } from './Icon'

describe('图标集', () => {
  it('登记了全部需要的图标名称', () => {
    const 需要 = [
      'home', 'clock', 'star', 'share', 'cloud', 'users', 'pdf', 'mindmap',
      'flow', 'settings', 'help', 'search', 'grid', 'list', 'sort', 'more',
      'arrow-left', 'doc-word', 'doc-table', 'doc-ppt', 'doc-pdf',
    ]
    需要.forEach((名称) => {
      expect(ICON_NAMES).toContain(名称)
    })
  })

  it('渲染为 svg 元素', () => {
    const { container } = render(<Icon name="home" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })

  it('默认尺寸为 16，可覆盖', () => {
    const { container: 默认 } = render(<Icon name="star" />)
    expect(默认.querySelector('svg')).toHaveAttribute('width', '16')

    const { container: 自定义 } = render(<Icon name="star" size={20} />)
    expect(自定义.querySelector('svg')).toHaveAttribute('width', '20')
  })

  it('传入自定义颜色时生效', () => {
    const { container } = render(<Icon name="doc-word" color="#2B6CF6" />)
    expect(container.querySelector('svg')).toHaveAttribute('color', '#2B6CF6')
  })

  it('未知图标名称渲染占位而不抛错', () => {
    const { container } = render(<Icon name="不存在的图标" />)
    expect(container.querySelector('svg')).toBeInTheDocument()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- Icon`
预期：FAIL，无法解析 `./Icon`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/Icon.tsx`。图标统一 16 视口、1.6 描边线性风格，
文档类型图标为填充风格；未知名称渲染空方框占位，保证界面不塌陷。

```tsx
// 内联 SVG 图标集：全站唯一图标来源，不引入第三方图标库。
// 线性图标统一 1.6 描边与圆角端点；文档类型图标使用填充风格。
import React from 'react'

export const ICON_NAMES = [
  'home', 'clock', 'star', 'star-filled', 'share', 'cloud', 'users',
  'pdf', 'mindmap', 'flow', 'settings', 'help',
  'search', 'grid', 'list', 'sort', 'more', 'arrow-left', 'plus', 'retry',
  'doc-word', 'doc-table', 'doc-ppt', 'doc-pdf', 'doc-empty',
]

interface IconProps {
  name: string
  size?: number
  color?: string
  className?: string
}

/** 线性图标路径表 */
const 线性路径: Record<string, React.ReactNode> = {
  home: <path d="M3 7.2 8 3l5 4.2V13H3z" />,
  clock: (
    <>
      <circle cx="8" cy="8" r="5.6" />
      <path d="M8 5v3.2l2.2 1.4" />
    </>
  ),
  star: <path d="m8 2.6 1.7 3.6 3.9.5-2.8 2.7.7 3.9L8 11.5l-3.5 1.8.7-3.9L2.4 6.7l3.9-.5z" />,
  'star-filled': <path d="m8 2.6 1.7 3.6 3.9.5-2.8 2.7.7 3.9L8 11.5l-3.5 1.8.7-3.9L2.4 6.7l3.9-.5z" fill="currentColor" />,
  share: (
    <>
      <circle cx="12" cy="3.6" r="1.8" />
      <circle cx="4" cy="8" r="1.8" />
      <circle cx="12" cy="12.4" r="1.8" />
      <path d="m5.6 7.1 4.8-2.6M5.6 8.9l4.8 2.6" />
    </>
  ),
  cloud: <path d="M4.6 12h6.8a2.6 2.6 0 0 0 .2-5.2 3.4 3.4 0 0 0-6.5-.6A2.6 2.6 0 0 0 4.6 12z" />,
  users: (
    <>
      <circle cx="6" cy="5.4" r="2.2" />
      <path d="M2.4 13c0-2 1.6-3.4 3.6-3.4S9.6 11 9.6 13" />
      <path d="M10.8 4.2a2 2 0 0 1 0 3.9M11.6 9.9c1.5.3 2.6 1.5 2.6 3.1" />
    </>
  ),
  pdf: (
    <>
      <path d="M4 2.4h5l3 3V13.6H4z" />
      <path d="M9 2.4v3h3" />
    </>
  ),
  mindmap: (
    <>
      <rect x="5.6" y="6.4" width="4.8" height="3.2" rx="1" />
      <path d="M8 2.6v3.8M3.4 13.4V9.6h4.2M12.6 13.4V9.6H8.4" />
    </>
  ),
  flow: (
    <>
      <rect x="5.6" y="1.8" width="4.8" height="3" rx="1" />
      <rect x="5.6" y="11.2" width="4.8" height="3" rx="1" />
      <path d="M8 4.8v6.4" />
    </>
  ),
  settings: (
    <>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.8v1.6M8 12.6v1.6M2.2 8h1.6M12.2 8h1.6M4 4l1.1 1.1M10.9 10.9 12 12M12 4l-1.1 1.1M5.1 10.9 4 12" />
    </>
  ),
  help: (
    <>
      <circle cx="8" cy="8" r="6" />
      <path d="M6.4 6.2a1.7 1.7 0 1 1 2.3 1.6c-.5.2-.7.6-.7 1.1v.3M8 11.6v.1" />
    </>
  ),
  search: (
    <>
      <circle cx="7.2" cy="7.2" r="4.4" />
      <path d="m10.6 10.6 3 3" />
    </>
  ),
  grid: (
    <>
      <rect x="2.4" y="2.4" width="4.6" height="4.6" rx="1" />
      <rect x="9" y="2.4" width="4.6" height="4.6" rx="1" />
      <rect x="2.4" y="9" width="4.6" height="4.6" rx="1" />
      <rect x="9" y="9" width="4.6" height="4.6" rx="1" />
    </>
  ),
  list: (
    <>
      <path d="M6 4h7M6 8h7M6 12h7M3 4h.1M3 8h.1M3 12h.1" />
    </>
  ),
  sort: <path d="M4 3.4v9.2M2.2 10.8 4 12.6l1.8-1.8M9 4.4h4.8M9 8h3.4M9 11.6h2" />,
  more: (
    <>
      <circle cx="3.4" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="8" cy="8" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12.6" cy="8" r="1.1" fill="currentColor" stroke="none" />
    </>
  ),
  'arrow-left': <path d="M12.8 8H3.2M6.8 4.4 3.2 8l3.6 3.6" />,
  plus: <path d="M8 3.2v9.6M3.2 8h9.6" />,
  retry: <path d="M13 8a5 5 0 1 1-1.6-3.7M13 2.4V5h-2.6" />,
}

/** 文档类型图标：填充风格，颜色由外部传入 */
const 文档图标: Record<string, React.ReactNode> = {
  'doc-word': (
    <>
      <path d="M3.4 1.6h9.2v12.8H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h9.2v12.8H3.4z" />
      <path d="M5.4 5.2h5.2M5.4 8h5.2M5.4 10.8h3.2" />
    </>
  ),
  'doc-table': (
    <>
      <path d="M3.4 1.6h9.2v12.8H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h9.2v12.8H3.4z" />
      <path d="M3.4 5.6h9.2M3.4 9.6h9.2M8 5.6v8.8" />
    </>
  ),
  'doc-ppt': (
    <>
      <path d="M3.4 1.6h9.2v12.8H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h9.2v12.8H3.4z" />
      <path d="M5.6 5.4h2.6a1.6 1.6 0 0 1 0 3.2H5.6zM5.6 8.6v3" />
    </>
  ),
  'doc-pdf': (
    <>
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" fill="currentColor" opacity="0.16" stroke="none" />
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" />
      <path d="M8.8 1.6v3.8h3.8" />
    </>
  ),
  'doc-empty': (
    <>
      <path d="M3.4 1.6h5.4l3.8 3.8v9H3.4z" />
      <path d="M8.8 1.6v3.8h3.8M6 8h4M6 10.6h2.6" />
    </>
  ),
}

const Icon = ({ name, size = 16, color, className }: IconProps) => {
  const 图形 = 线性路径[name] ?? 文档图标[name] ?? 线性路径['doc-empty']

  return React.createElement(
    'svg',
    {
      width: size,
      height: size,
      viewBox: '0 0 16 16',
      fill: 'none',
      stroke: color ?? 'currentColor',
      strokeWidth: 1.6,
      strokeLinecap: 'round',
      strokeLinejoin: 'round',
      color,
      className,
      'aria-hidden': 'true',
      focusable: 'false',
    },
    图形
  )
}

export default Icon
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- Icon`
预期：`Tests 5 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/Icon.tsx renderer/src/components/Icon.test.tsx
git commit -m "feat: 新增内联 SVG 图标集"
```

---

## 任务 7：异常兜底组件

**文件：**
- 创建：`renderer/src/components/ErrorBoundary.tsx`
- 测试：`renderer/src/components/ErrorBoundary.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/ErrorBoundary.test.tsx`：

```tsx
import React from 'react'
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from './ErrorBoundary'

const 抛错组件 = () => {
  throw new Error('模拟渲染异常')
}

describe('渲染异常兜底', () => {
  let 原始错误: typeof console.error

  beforeEach(() => {
    原始错误 = console.error
    console.error = vi.fn()
  })

  afterEach(() => {
    console.error = 原始错误
  })

  it('子组件正常时渲染子内容', () => {
    render(
      <ErrorBoundary>
        <div>正常内容</div>
      </ErrorBoundary>
    )
    expect(screen.getByText('正常内容')).toBeInTheDocument()
  })

  it('子组件抛错时展示中文说明而非空白', () => {
    render(
      <ErrorBoundary>
        <抛错组件 />
      </ErrorBoundary>
    )
    expect(screen.getByText('界面渲染出现异常')).toBeInTheDocument()
    expect(screen.getByText('模拟渲染异常')).toBeInTheDocument()
    expect(screen.getByText('重试')).toBeInTheDocument()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- ErrorBoundary`
预期：FAIL，无法解析 `./ErrorBoundary`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/ErrorBoundary.tsx`：

```tsx
// 渲染异常兜底：捕获子树渲染错误并展示中文说明，避免出现静默空白窗口。
import React from 'react'
import { Button } from 'antd'
import Icon from './Icon'

interface Props {
  children: React.ReactNode
}

interface State {
  error: Error | null
}

class ErrorBoundary extends React.Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    // 保留原始错误堆栈，便于定位问题，不使用默认数据掩盖
    console.error('界面渲染异常：', error, info.componentStack)
  }

  private 重试 = () => {
    this.setState({ error: null })
  }

  render() {
    const { error } = this.state
    if (error === null) {
      return this.props.children
    }

    return React.createElement(
      'div',
      { className: 'wps-error' },
      React.createElement(Icon, { name: 'retry', size: 32 }),
      React.createElement('h3', { className: 'wps-error__title' }, '界面渲染出现异常'),
      React.createElement('p', { className: 'wps-error__message' }, error.message),
      React.createElement(
        Button,
        { type: 'primary', onClick: this.重试, className: 'wps-error__action' },
        '重试'
      )
    )
  }
}

export default ErrorBoundary
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- ErrorBoundary`
预期：`Tests 2 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/ErrorBoundary.tsx renderer/src/components/ErrorBoundary.test.tsx
git commit -m "feat: 新增渲染异常中文兜底"
```

---

## 任务 8：空状态组件

**文件：**
- 创建：`renderer/src/components/EmptyState.tsx`
- 测试：`renderer/src/components/EmptyState.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/EmptyState.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EmptyState from './EmptyState'

describe('空状态', () => {
  it('展示标题与描述', () => {
    render(<EmptyState title="暂无最近文档" description="新建一个文档开始使用" />)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
    expect(screen.getByText('新建一个文档开始使用')).toBeInTheDocument()
  })

  it('提供操作按钮并响应点击', async () => {
    const 点击 = vi.fn()
    render(<EmptyState title="暂无最近文档" actionText="新建文档" onAction={点击} />)
    await userEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(点击).toHaveBeenCalledTimes(1)
  })

  it('未传入操作时不渲染按钮', () => {
    render(<EmptyState title="暂无最近文档" />)
    expect(screen.queryByRole('button')).toBeNull()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- EmptyState`
预期：FAIL，无法解析 `./EmptyState`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/EmptyState.tsx`：

```tsx
// 通用空状态：列表无数据时展示，避免出现无解释的空白区域。
import React from 'react'
import { Button } from 'antd'
import Icon from './Icon'

interface Props {
  title: string
  description?: string
  actionText?: string
  onAction?: () => void
}

const EmptyState = ({ title, description, actionText, onAction }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-empty' },
    React.createElement(Icon, { name: 'doc-empty', size: 48, className: 'wps-empty__icon' }),
    React.createElement('p', { className: 'wps-empty__title' }, title),
    description !== undefined
      ? React.createElement('p', { className: 'wps-empty__desc' }, description)
      : null,
    actionText !== undefined && onAction !== undefined
      ? React.createElement(
          Button,
          { type: 'primary', onClick: onAction, className: 'wps-empty__action' },
          actionText
        )
      : null
  )

export default EmptyState
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- EmptyState`
预期：`Tests 3 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/EmptyState.tsx renderer/src/components/EmptyState.test.tsx
git commit -m "feat: 新增通用空状态组件"
```

---

## 任务 9：顶栏组件

**文件：**
- 创建：`renderer/src/components/TitleBar.tsx`
- 测试：`renderer/src/components/TitleBar.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/TitleBar.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import TitleBar from './TitleBar'

describe('顶栏', () => {
  it('展示品牌名与当前页名', () => {
    render(<TitleBar pageName="首页" />)
    expect(screen.getByText('WPS Office')).toBeInTheDocument()
    expect(screen.getByText('首页')).toBeInTheDocument()
  })

  it('展示搜索框占位文字', () => {
    render(<TitleBar pageName="首页" />)
    expect(screen.getByPlaceholderText('搜索文件、模板')).toBeInTheDocument()
  })

  it('头像展示用户名首字', () => {
    render(<TitleBar pageName="首页" userName="演示用户" />)
    expect(screen.getByText('演')).toBeInTheDocument()
  })

  it('搜索输入触发回调', async () => {
    const 回调 = vi.fn()
    render(<TitleBar pageName="首页" onSearch={回调} />)
    await userEvent.type(screen.getByPlaceholderText('搜索文件、模板'), '预算')
    expect(回调).toHaveBeenLastCalledWith('预算')
  })

  it('编辑器视图下以文档名替代搜索框', () => {
    render(<TitleBar pageName="文档" documentName="季度报告.docx" />)
    expect(screen.getByText('季度报告.docx')).toBeInTheDocument()
    expect(screen.queryByPlaceholderText('搜索文件、模板')).toBeNull()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- TitleBar`
预期：FAIL，无法解析 `./TitleBar`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/TitleBar.tsx`：

```tsx
// 顶栏：品牌标识、搜索或当前文档名、设置与帮助入口、用户头像。
// Electron 使用系统边框窗口，此处不自绘最小化与关闭按钮。
import React, { useState } from 'react'
import { Input, Tooltip } from 'antd'
import Icon from './Icon'

interface Props {
  pageName: string
  userName?: string
  /** 传入后顶栏中部展示文档名，替代搜索框，用于编辑器视图 */
  documentName?: string
  onSearch?: (关键词: string) => void
  onSetting?: () => void
  onHelp?: () => void
}

const TitleBar = ({
  pageName,
  userName = '演示用户',
  documentName,
  onSearch,
  onSetting,
  onHelp,
}: Props) => {
  const [关键词, set关键词] = useState('')

  const 处理输入 = (值: string) => {
    set关键词(值)
    if (onSearch !== undefined) {
      onSearch(值)
    }
  }

  return React.createElement(
    'header',
    { className: 'wps-titlebar' },
    React.createElement(
      'div',
      { className: 'wps-titlebar__brand' },
      React.createElement('span', { className: 'wps-logo' }, 'W'),
      React.createElement('span', { className: 'wps-titlebar__name' }, 'WPS Office'),
      React.createElement('span', { className: 'wps-titlebar__divider' }),
      React.createElement('span', { className: 'wps-titlebar__page' }, pageName)
    ),
    React.createElement(
      'div',
      { className: 'wps-titlebar__center' },
      documentName !== undefined
        ? React.createElement('span', { className: 'wps-titlebar__doc' }, documentName)
        : React.createElement(Input, {
            className: 'wps-titlebar__search',
            placeholder: '搜索文件、模板',
            allowClear: true,
            value: 关键词,
            onChange: (事件: React.ChangeEvent<HTMLInputElement>) => 处理输入(事件.target.value),
            prefix: React.createElement(Icon, { name: 'search', size: 16 }),
          })
    ),
    React.createElement(
      'div',
      { className: 'wps-titlebar__actions' },
      React.createElement(
        Tooltip,
        { title: '设置' },
        React.createElement(
          'button',
          { type: 'button', className: 'wps-icon-button', onClick: onSetting, 'aria-label': '设置' },
          React.createElement(Icon, { name: 'settings', size: 18 })
        )
      ),
      React.createElement(
        Tooltip,
        { title: '帮助与反馈' },
        React.createElement(
          'button',
          { type: 'button', className: 'wps-icon-button', onClick: onHelp, 'aria-label': '帮助与反馈' },
          React.createElement(Icon, { name: 'help', size: 18 })
        )
      ),
      React.createElement(
        'span',
        { className: 'wps-avatar', title: userName },
        userName.slice(0, 1)
      )
    )
  )
}

export default TitleBar
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- TitleBar`
预期：`Tests 5 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/TitleBar.tsx renderer/src/components/TitleBar.test.tsx
git commit -m "feat: 新增顶栏组件"
```

---

## 任务 10：左侧导航组件

**文件：**
- 创建：`renderer/src/components/Sidebar.tsx`
- 测试：`renderer/src/components/Sidebar.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/Sidebar.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Sidebar from './Sidebar'

describe('左侧导航', () => {
  it('渲染四个分组中的全部导航项', () => {
    render(<Sidebar activeKey="home" onSelect={() => {}} />)
    ;['首页', '最近', '星标', '共享', '我的云文档', '团队文档', 'PDF 工具', '脑图', '流程图', '设置', '帮助与反馈'].forEach(
      (文字) => {
        expect(screen.getByText(文字)).toBeInTheDocument()
      }
    )
  })

  it('当前项带选中样式', () => {
    const { container } = render(<Sidebar activeKey="star" onSelect={() => {}} />)
    const 选中项 = container.querySelector('.wps-nav-item--active')
    expect(选中项).not.toBeNull()
    expect(选中项?.textContent).toContain('星标')
  })

  it('点击导航项回传其 key', async () => {
    const 回调 = vi.fn()
    render(<Sidebar activeKey="home" onSelect={回调} />)
    await userEvent.click(screen.getByText('共享'))
    expect(回调).toHaveBeenCalledWith('shared')
  })

  it('编辑器模式展示返回首页按钮', async () => {
    const 返回 = vi.fn()
    render(<Sidebar mode="editor" moduleLabel="文档" onBack={返回} />)
    expect(screen.getByText('文档')).toBeInTheDocument()
    await userEvent.click(screen.getByText('返回首页'))
    expect(返回).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- Sidebar`
预期：FAIL，无法解析 `./Sidebar`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/Sidebar.tsx`：

```tsx
// 左侧导航：首页视图渲染分组导航，编辑器视图渲染返回入口与模块名。
import React from 'react'
import { NAV_GROUPS } from '../routes'
import Icon from './Icon'

interface Props {
  mode?: 'home' | 'editor'
  activeKey?: string
  onSelect?: (键: string) => void
  moduleLabel?: string
  onBack?: () => void
}

const Sidebar = ({ mode = 'home', activeKey, onSelect, moduleLabel, onBack }: Props) => {
  if (mode === 'editor') {
    return React.createElement(
      'nav',
      { className: 'wps-sidebar' },
      React.createElement(
        'button',
        { type: 'button', className: 'wps-sidebar__back', onClick: onBack },
        React.createElement(Icon, { name: 'arrow-left', size: 16 }),
        React.createElement('span', null, '返回首页')
      ),
      React.createElement(
        'div',
        { className: 'wps-sidebar__group' },
        React.createElement(
          'div',
          { className: 'wps-nav-item wps-nav-item--active' },
          React.createElement(Icon, { name: 'doc-empty', size: 18, className: 'wps-nav-item__icon' }),
          React.createElement('span', { className: 'wps-nav-item__label' }, moduleLabel ?? '文档')
        ),
        ['开始', '插入', '页面布局', '引用', '审阅', '视图'].map((名称) =>
          React.createElement(
            'div',
            { key: 名称, className: 'wps-nav-item wps-nav-item--disabled' },
            React.createElement(Icon, { name: 'grid', size: 18, className: 'wps-nav-item__icon' }),
            React.createElement('span', { className: 'wps-nav-item__label' }, 名称)
          )
        )
      )
    )
  }

  return React.createElement(
    'nav',
    { className: 'wps-sidebar' },
    NAV_GROUPS.map((分组, 分组下标) =>
      React.createElement(
        'div',
        { key: `分组-${分组下标}`, className: 'wps-sidebar__group' },
        分组.map((项) =>
          React.createElement(
            'div',
            {
              key: 项.key,
              role: 'button',
              tabIndex: 0,
              className: `wps-nav-item${项.key === activeKey ? ' wps-nav-item--active' : ''}`,
              onClick: () => onSelect && onSelect(项.key),
              onKeyDown: (事件: React.KeyboardEvent) => {
                if (事件.key === 'Enter' && onSelect) {
                  onSelect(项.key)
                }
              },
            },
            React.createElement(Icon, { name: 项.icon, size: 18, className: 'wps-nav-item__icon' }),
            React.createElement('span', { className: 'wps-nav-item__label' }, 项.label)
          )
        )
      )
    )
  )
}

export default Sidebar
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- Sidebar`
预期：`Tests 4 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/Sidebar.tsx renderer/src/components/Sidebar.test.tsx
git commit -m "feat: 新增左侧导航组件"
```

---

## 任务 11：新建四宫格

**文件：**
- 创建：`renderer/src/components/NewDocGrid.tsx`
- 测试：`renderer/src/components/NewDocGrid.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/NewDocGrid.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import NewDocGrid from './NewDocGrid'

describe('新建四宫格', () => {
  it('渲染四张入口卡片', () => {
    const { container } = render(<NewDocGrid onSelect={() => {}} />)
    expect(container.querySelectorAll('.wps-new-card')).toHaveLength(4)
  })

  it('展示四项中文名称', () => {
    render(<NewDocGrid onSelect={() => {}} />)
    ;['新建文字', '新建表格', '新建演示', 'PDF 工具'].forEach((名称) => {
      expect(screen.getByText(名称)).toBeInTheDocument()
    })
  })

  it('点击卡片回传对应类型', async () => {
    const 回调 = vi.fn()
    render(<NewDocGrid onSelect={回调} />)
    await userEvent.click(screen.getByText('新建表格'))
    expect(回调).toHaveBeenCalledWith('table')
  })

  it('未实现的入口带禁用标记', () => {
    const { container } = render(<NewDocGrid onSelect={() => {}} />)
    const 禁用项 = container.querySelectorAll('.wps-new-card--disabled')
    expect(禁用项).toHaveLength(1)
    expect(禁用项[0].textContent).toContain('PDF 工具')
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- NewDocGrid`
预期：FAIL，无法解析 `./NewDocGrid`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/NewDocGrid.tsx`：

```tsx
// 新建四宫格：首页主要的创建入口，数据来源于路由注册表。
import React from 'react'
import { NEW_DOC_ENTRIES } from '../routes'
import type { DocType } from '../mock/recentDocs'
import Icon from './Icon'

interface Props {
  onSelect: (类型: DocType) => void
}

const NewDocGrid = ({ onSelect }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-new-grid' },
    NEW_DOC_ENTRIES.map((项) =>
      React.createElement(
        'button',
        {
          key: 项.key,
          type: 'button',
          className: `wps-new-card${项.implemented ? '' : ' wps-new-card--disabled'}`,
          onClick: () => onSelect(项.key),
        },
        React.createElement(
          'span',
          { className: 'wps-new-card__icon', style: { color: 项.color } },
          React.createElement(Icon, { name: 项.icon, size: 36, color: 项.color })
        ),
        React.createElement('span', { className: 'wps-new-card__label' }, 项.label)
      )
    )
  )

export default NewDocGrid
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- NewDocGrid`
预期：`Tests 4 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/NewDocGrid.tsx renderer/src/components/NewDocGrid.test.tsx
git commit -m "feat: 新增首页新建入口四宫格"
```

---

## 任务 12：文档卡片与文档行

**文件：**
- 创建：`renderer/src/components/DocCard.tsx`
- 创建：`renderer/src/components/DocRow.tsx`
- 测试：`renderer/src/components/DocCard.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/DocCard.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import DocCard from './DocCard'
import DocRow from './DocRow'
import type { DocItem } from '../mock/recentDocs'

const 文档: DocItem = {
  id: 'd01',
  name: '经营分析报告.docx',
  type: 'word',
  size: 2438144,
  updatedAt: '2026-09-22 18:30',
  starred: true,
  shared: true,
}

describe('文档卡片', () => {
  it('展示文件名、类型标签与大小', () => {
    render(<DocCard doc={文档} />)
    expect(screen.getByText('经营分析报告.docx')).toBeInTheDocument()
    expect(screen.getByText('文字')).toBeInTheDocument()
    expect(screen.getByText(/2\.3 MB/)).toBeInTheDocument()
  })

  it('单击回传选中事件', async () => {
    const 选中 = vi.fn()
    render(<DocCard doc={文档} onSelect={选中} />)
    await userEvent.click(screen.getByText('经营分析报告.docx'))
    expect(选中).toHaveBeenCalledWith(文档.id)
  })

  it('双击回传打开事件', async () => {
    const 打开 = vi.fn()
    render(<DocCard doc={文档} onOpen={打开} />)
    await userEvent.dblClick(screen.getByText('经营分析报告.docx'))
    expect(打开).toHaveBeenCalledWith(文档.id)
  })

  it('点击星标只触发星标切换，不触发选中', async () => {
    const 星标 = vi.fn()
    const 选中 = vi.fn()
    render(<DocCard doc={文档} onToggleStar={星标} onSelect={选中} />)
    await userEvent.click(screen.getByRole('button', { name: '取消星标' }))
    expect(星标).toHaveBeenCalledWith(文档.id)
    expect(选中).not.toHaveBeenCalled()
  })

  it('选中态带选中样式', () => {
    const { container } = render(<DocCard doc={文档} active />)
    expect(container.querySelector('.wps-doc-card--active')).not.toBeNull()
  })
})

describe('文档行', () => {
  it('展示文件名、类型、时间与大小', () => {
    render(<DocRow doc={文档} />)
    expect(screen.getByText('经营分析报告.docx')).toBeInTheDocument()
    expect(screen.getByText('文字')).toBeInTheDocument()
    expect(screen.getByText('2.3 MB')).toBeInTheDocument()
  })

  it('单击回传打开事件', async () => {
    const 打开 = vi.fn()
    render(<DocRow doc={文档} onOpen={打开} />)
    await userEvent.click(screen.getByText('经营分析报告.docx'))
    expect(打开).toHaveBeenCalledWith(文档.id)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- DocCard`
预期：FAIL，无法解析 `./DocCard`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/DocCard.tsx`：

```tsx
// 文档卡片：最近文档网格视图的单元，承载缩略图、名称、类型标签与星标操作。
import React from 'react'
import { Tooltip } from 'antd'
import { formatSize, formatTime, type DocItem, type DocType } from '../mock/recentDocs'
import Icon from './Icon'

const 类型文案: Record<DocType, string> = {
  word: '文字',
  table: '表格',
  ppt: '演示',
  pdf: 'PDF',
}

const 类型图标: Record<DocType, string> = {
  word: 'doc-word',
  table: 'doc-table',
  ppt: 'doc-ppt',
  pdf: 'doc-pdf',
}

const 类型颜色: Record<DocType, string> = {
  word: '#2B6CF6',
  table: '#00A870',
  ppt: '#ED7B2F',
  pdf: '#E34D59',
}

interface Props {
  doc: DocItem
  active?: boolean
  onSelect?: (标识: string) => void
  onOpen?: (标识: string) => void
  onToggleStar?: (标识: string) => void
}

const DocCard = ({ doc, active = false, onSelect, onOpen, onToggleStar }: Props) => {
  const 处理星标 = (事件: React.MouseEvent) => {
    事件.stopPropagation()
    if (onToggleStar !== undefined) {
      onToggleStar(doc.id)
    }
  }

  return React.createElement(
    'div',
    {
      className: `wps-doc-card${active ? ' wps-doc-card--active' : ''}`,
      onClick: () => onSelect && onSelect(doc.id),
      onDoubleClick: () => onOpen && onOpen(doc.id),
    },
    React.createElement(
      'div',
      { className: 'wps-doc-card__thumb' },
      React.createElement(Icon, {
        name: 类型图标[doc.type],
        size: 40,
        color: 类型颜色[doc.type],
      }),
      React.createElement(
        'span',
        { className: 'wps-doc-card__badge', style: { background: 类型颜色[doc.type] } },
        类型文案[doc.type]
      ),
      React.createElement(
        'button',
        {
          type: 'button',
          className: `wps-doc-card__star${doc.starred ? ' wps-doc-card__star--on' : ''}`,
          'aria-label': doc.starred ? '取消星标' : '添加星标',
          onClick: 处理星标,
        },
        React.createElement(Icon, { name: doc.starred ? 'star-filled' : 'star', size: 16 })
      )
    ),
    React.createElement(
      'div',
      { className: 'wps-doc-card__info' },
      React.createElement(
        Tooltip,
        { title: doc.name },
        React.createElement('span', { className: 'wps-doc-card__name' }, doc.name)
      ),
      React.createElement(
        'span',
        { className: 'wps-doc-card__meta' },
        `${formatTime(doc.updatedAt)} · ${formatSize(doc.size)}`
      )
    )
  )
}

export default DocCard
```

创建 `renderer/src/components/DocRow.tsx`：

```tsx
// 文档行：最近文档列表视图的单元。
import React from 'react'
import { formatSize, formatTime, type DocItem, type DocType } from '../mock/recentDocs'
import Icon from './Icon'

const 类型文案: Record<DocType, string> = {
  word: '文字',
  table: '表格',
  ppt: '演示',
  pdf: 'PDF',
}

const 类型图标: Record<DocType, string> = {
  word: 'doc-word',
  table: 'doc-table',
  ppt: 'doc-ppt',
  pdf: 'doc-pdf',
}

interface Props {
  doc: DocItem
  onOpen?: (标识: string) => void
}

const DocRow = ({ doc, onOpen }: Props) =>
  React.createElement(
    'div',
    {
      className: 'wps-doc-row',
      onClick: () => onOpen && onOpen(doc.id),
    },
    React.createElement(
      'span',
      { className: 'wps-doc-row__name' },
      React.createElement(Icon, { name: 类型图标[doc.type], size: 18, className: 'wps-doc-row__icon' }),
      doc.name
    ),
    React.createElement('span', { className: 'wps-doc-row__type' }, 类型文案[doc.type]),
    React.createElement('span', { className: 'wps-doc-row__time' }, formatTime(doc.updatedAt)),
    React.createElement('span', { className: 'wps-doc-row__size' }, formatSize(doc.size)),
    React.createElement(
      'span',
      { className: 'wps-doc-row__star' },
      doc.starred ? React.createElement(Icon, { name: 'star-filled', size: 14 }) : null
    )
  )

export default DocRow
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- DocCard`
预期：`Tests 7 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/DocCard.tsx renderer/src/components/DocRow.tsx renderer/src/components/DocCard.test.tsx
git commit -m "feat: 新增文档卡片与文档行组件"
```

---

## 任务 13：最近文档区块

**文件：**
- 创建：`renderer/src/components/RecentDocs.tsx`
- 测试：`renderer/src/components/RecentDocs.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/RecentDocs.test.tsx`：

```tsx
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import RecentDocs from './RecentDocs'
import type { DocItem } from '../mock/recentDocs'

const 文档集: DocItem[] = [
  { id: 'd01', name: '报告.docx', type: 'word', size: 2048, updatedAt: '2026-09-22 18:30', starred: false, shared: false },
  { id: 'd02', name: '预算.xlsx', type: 'table', size: 4096, updatedAt: '2026-09-22 15:12', starred: true, shared: false },
]

describe('最近文档区块', () => {
  it('展示区块标题', () => {
    render(<RecentDocs docs={文档集} title="最近文档" />)
    expect(screen.getByText('最近文档')).toBeInTheDocument()
  })

  it('网格视图渲染卡片', () => {
    const { container } = render(<RecentDocs docs={文档集} title="最近文档" viewMode="grid" />)
    expect(container.querySelectorAll('.wps-doc-card')).toHaveLength(2)
  })

  it('列表视图渲染行与表头', () => {
    const { container } = render(<RecentDocs docs={文档集} title="最近文档" viewMode="list" />)
    expect(container.querySelectorAll('.wps-doc-row')).toHaveLength(2)
    expect(screen.getByText('修改时间')).toBeInTheDocument()
    expect(screen.getByText('大小')).toBeInTheDocument()
  })

  it('切换视图回传新模式', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={文档集} title="最近文档" viewMode="grid" onViewModeChange={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '列表视图' }))
    expect(回调).toHaveBeenCalledWith('list')
  })

  it('数据为空时展示空状态并隐藏视图切换', () => {
    const { container } = render(<RecentDocs docs={[]} title="最近文档" viewMode="grid" />)
    expect(screen.getByText('暂无最近文档')).toBeInTheDocument()
    expect(container.querySelector('.wps-doc-grid')).toBeNull()
  })

  it('空状态的新建按钮触发回调', async () => {
    const 回调 = vi.fn()
    render(<RecentDocs docs={[]} title="最近文档" onEmptyAction={回调} />)
    await userEvent.click(screen.getByRole('button', { name: '新建文档' }))
    expect(回调).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- RecentDocs`
预期：FAIL，无法解析 `./RecentDocs`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/RecentDocs.tsx`：

```tsx
// 最近文档区块：标题行（视图切换、排序、查看全部）与文档展示容器。
import React from 'react'
import { Dropdown, Tooltip } from 'antd'
import type { DocItem, SortKey } from '../mock/recentDocs'
import type { ViewMode } from '../store'
import DocCard from './DocCard'
import DocRow from './DocRow'
import EmptyState from './EmptyState'
import Icon from './Icon'

interface Props {
  docs: DocItem[]
  title: string
  viewMode?: ViewMode
  sortKey?: SortKey
  activeDocId?: string | null
  onSelect?: (标识: string) => void
  onOpen?: (标识: string) => void
  onToggleStar?: (标识: string) => void
  onViewModeChange?: (模式: ViewMode) => void
  onSortChange?: (键: SortKey) => void
  onViewAll?: () => void
  onEmptyAction?: () => void
}

const 排序文案: Record<SortKey, string> = {
  time: '按修改时间',
  name: '按名称',
  size: '按大小',
}

const RecentDocs = ({
  docs,
  title,
  viewMode = 'grid',
  sortKey = 'time',
  activeDocId = null,
  onSelect,
  onOpen,
  onToggleStar,
  onViewModeChange,
  onSortChange,
  onViewAll,
  onEmptyAction,
}: Props) => {
  const 排序菜单项 = (Object.keys(排序文案) as SortKey[]).map((键) => ({
    key: 键,
    label: 排序文案[键],
  }))

  const 标题行 = React.createElement(
    'div',
    { className: 'wps-section__head' },
    React.createElement('h2', { className: 'wps-section__title' }, title),
    React.createElement(
      'div',
      { className: 'wps-section__actions' },
      React.createElement(
        'div',
        { className: 'wps-segmented' },
        React.createElement(
          Tooltip,
          { title: '网格视图' },
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': '网格视图',
              className: `wps-segmented__item${viewMode === 'grid' ? ' wps-segmented__item--active' : ''}`,
              onClick: () => onViewModeChange && onViewModeChange('grid'),
            },
            React.createElement(Icon, { name: 'grid', size: 16 })
          )
        ),
        React.createElement(
          Tooltip,
          { title: '列表视图' },
          React.createElement(
            'button',
            {
              type: 'button',
              'aria-label': '列表视图',
              className: `wps-segmented__item${viewMode === 'list' ? ' wps-segmented__item--active' : ''}`,
              onClick: () => onViewModeChange && onViewModeChange('list'),
            },
            React.createElement(Icon, { name: 'list', size: 16 })
          )
        )
      ),
      React.createElement(
        Dropdown,
        {
          menu: {
            items: 排序菜单项,
            selectedKeys: [sortKey],
            onClick: ({ key }: { key: string }) =>
              onSortChange && onSortChange(key as SortKey),
          },
          trigger: ['click'],
        },
        React.createElement(
          'button',
          { type: 'button', className: 'wps-text-button', 'aria-label': '排序方式' },
          React.createElement(Icon, { name: 'sort', size: 16 }),
          React.createElement('span', null, 排序文案[sortKey])
        )
      ),
      React.createElement(
        'button',
        { type: 'button', className: 'wps-link-button', onClick: onViewAll },
        '查看全部'
      )
    )
  )

  const 内容 =
    docs.length === 0
      ? React.createElement(EmptyState, {
          title: '暂无最近文档',
          description: '新建一个文档，这里会显示最近打开过的文件',
          actionText: '新建文档',
          onAction: onEmptyAction,
        })
      : viewMode === 'grid'
        ? React.createElement(
            'div',
            { className: 'wps-doc-grid' },
            docs.map((文档) =>
              React.createElement(DocCard, {
                key: 文档.id,
                doc: 文档,
                active: 文档.id === activeDocId,
                onSelect,
                onOpen,
                onToggleStar,
              })
            )
          )
        : React.createElement(
            'div',
            { className: 'wps-doc-list' },
            React.createElement(
              'div',
              { className: 'wps-doc-list__head' },
              React.createElement('span', { className: 'wps-doc-row__name' }, '名称'),
              React.createElement('span', { className: 'wps-doc-row__type' }, '类型'),
              React.createElement('span', { className: 'wps-doc-row__time' }, '修改时间'),
              React.createElement('span', { className: 'wps-doc-row__size' }, '大小'),
              React.createElement('span', { className: 'wps-doc-row__star' }, '星标')
            ),
            docs.map((文档) =>
              React.createElement(DocRow, { key: 文档.id, doc: 文档, onOpen })
            )
          )

  return React.createElement(
    'section',
    { className: 'wps-section' },
    标题行,
    内容
  )
}

export default RecentDocs
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- RecentDocs`
预期：`Tests 6 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/RecentDocs.tsx renderer/src/components/RecentDocs.test.tsx
git commit -m "feat: 新增最近文档区块"
```

---

## 任务 14：底部状态栏

**文件：**
- 创建：`renderer/src/components/Footer.tsx`
- 测试：`renderer/src/components/Footer.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/components/Footer.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Footer from './Footer'

describe('底部状态栏', () => {
  it('展示文档总数与星标数', () => {
    render(<Footer total={12} starred={5} />)
    expect(screen.getByText('共 12 个文档')).toBeInTheDocument()
    expect(screen.getByText('其中星标 5 个')).toBeInTheDocument()
  })

  it('展示版本号', () => {
    render(<Footer total={0} starred={0} />)
    expect(screen.getByText(/v1\.0\.0/)).toBeInTheDocument()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- Footer`
预期：FAIL，无法解析 `./Footer`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/components/Footer.tsx`：

```tsx
// 底部状态栏：展示当前文档库统计信息与版本号。
import React from 'react'

interface Props {
  total: number
  starred: number
  version?: string
}

const Footer = ({ total, starred, version = 'v1.0.0' }: Props) =>
  React.createElement(
    'footer',
    { className: 'wps-footer' },
    React.createElement(
      'div',
      { className: 'wps-footer__left' },
      React.createElement('span', null, `共 ${total} 个文档`),
      React.createElement('span', { className: 'wps-footer__dot' }, '·'),
      React.createElement('span', null, `其中星标 ${starred} 个`)
    ),
    React.createElement('div', { className: 'wps-footer__right' }, `WPS 模仿版 ${version}`)
  )

export default Footer
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- Footer`
预期：`Tests 2 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/components/Footer.tsx renderer/src/components/Footer.test.tsx
git commit -m "feat: 新增底部状态栏"
```

---

## 任务 15：编辑器占位页

**文件：**
- 创建：`renderer/src/pages/EditorPlaceholder.tsx`
- 改写：`renderer/src/pages/WordPage.tsx`、`TablePage.tsx`、`PptPage.tsx`
- 测试：`renderer/src/pages/EditorPlaceholder.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/pages/EditorPlaceholder.test.tsx`：

```tsx
import React from 'react'
import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import EditorPlaceholder from './EditorPlaceholder'
import WordPage from './WordPage'
import TablePage from './TablePage'
import PptPage from './PptPage'
import { AppProvider } from '../store'

/** 模块页依赖应用状态，需包在 Provider 内渲染 */
const 包裹渲染 = (节点: React.ReactElement) =>
  render(<AppProvider>{节点}</AppProvider>)

describe('编辑器占位页', () => {
  it('展示模块名与开发中说明', () => {
    render(<EditorPlaceholder moduleLabel="文档" />)
    expect(screen.getByText('文档')).toBeInTheDocument()
    expect(screen.getByText('编辑功能开发中')).toBeInTheDocument()
  })

  it('提供返回首页按钮并响应点击', async () => {
    const 返回 = vi.fn()
    render(<EditorPlaceholder moduleLabel="文档" onBack={返回} />)
    await userEvent.click(screen.getByRole('button', { name: '返回首页' }))
    expect(返回).toHaveBeenCalledTimes(1)
  })

  it('三个模块页各自展示对应名称', () => {
    const { unmount: 卸载一 } = 包裹渲染(<WordPage />)
    expect(screen.getByText('文档')).toBeInTheDocument()
    卸载一()

    const { unmount: 卸载二 } = 包裹渲染(<TablePage />)
    expect(screen.getByText('表格')).toBeInTheDocument()
    卸载二()

    包裹渲染(<PptPage />)
    expect(screen.getByText('演示')).toBeInTheDocument()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- EditorPlaceholder`
预期：FAIL，无法解析 `./EditorPlaceholder`。

- [ ] **步骤 3：编写实现代码**

创建 `renderer/src/pages/EditorPlaceholder.tsx`：

```tsx
// 编辑器占位内容：三个模块共用，明确标注功能开发中，不伪造编辑能力。
import React from 'react'
import { Button } from 'antd'
import Icon from '../components/Icon'

interface Props {
  moduleLabel: string
  onBack?: () => void
}

const EditorPlaceholder = ({ moduleLabel, onBack }: Props) =>
  React.createElement(
    'div',
    { className: 'wps-editor' },
    React.createElement(
      'div',
      { className: 'wps-editor__stage' },
      React.createElement(Icon, { name: 'doc-empty', size: 56, className: 'wps-editor__icon' }),
      React.createElement('p', { className: 'wps-editor__title' }, moduleLabel),
      React.createElement('p', { className: 'wps-editor__desc' }, '编辑功能开发中'),
      React.createElement(
        Button,
        { onClick: onBack, className: 'wps-editor__back' },
        '返回首页'
      )
    )
  )

export default EditorPlaceholder
```

改写 `renderer/src/pages/WordPage.tsx`：

```tsx
import React from 'react'
import EditorPlaceholder from './EditorPlaceholder'
import { useAppStore } from '../store'

const WordPage = () => {
  const { setModule } = useAppStore()
  return React.createElement(EditorPlaceholder, {
    moduleLabel: '文档',
    onBack: () => setModule('home'),
  })
}

export default WordPage
```

改写 `renderer/src/pages/TablePage.tsx`：

```tsx
import React from 'react'
import EditorPlaceholder from './EditorPlaceholder'
import { useAppStore } from '../store'

const TablePage = () => {
  const { setModule } = useAppStore()
  return React.createElement(EditorPlaceholder, {
    moduleLabel: '表格',
    onBack: () => setModule('home'),
  })
}

export default TablePage
```

改写 `renderer/src/pages/PptPage.tsx`：

```tsx
import React from 'react'
import EditorPlaceholder from './EditorPlaceholder'
import { useAppStore } from '../store'

const PptPage = () => {
  const { setModule } = useAppStore()
  return React.createElement(EditorPlaceholder, {
    moduleLabel: '演示',
    onBack: () => setModule('home'),
  })
}

export default PptPage
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- EditorPlaceholder`
预期：`Tests 3 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/pages
git commit -m "feat: 新增编辑器占位页"
```

---

## 任务 16：首页装配

**文件：**
- 改写：`renderer/src/pages/HomePage.tsx`
- 测试：`renderer/src/pages/HomePage.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/pages/HomePage.test.tsx`：

```tsx
import React from 'react'
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import HomePage from './HomePage'
import { AppProvider } from '../store'

const 渲染首页 = () =>
  render(
    <AppProvider>
      <HomePage />
    </AppProvider>
  )

describe('首页', () => {
  it('同时展示新建区与最近文档区', () => {
    渲染首页()
    expect(screen.getByText('新建')).toBeInTheDocument()
    expect(screen.getByText('最近文档')).toBeInTheDocument()
  })

  it('渲染四张新建卡片', () => {
    const { container } = 渲染首页()
    expect(container.querySelectorAll('.wps-new-card')).toHaveLength(4)
  })

  it('渲染文档卡片', () => {
    const { container } = 渲染首页()
    expect(container.querySelectorAll('.wps-doc-card').length).toBeGreaterThan(0)
  })

  it('PDF 入口点击后不跳转并给出中文提示', async () => {
    渲染首页()
    await userEvent.click(screen.getByText('PDF 工具'))
    expect(await screen.findByText('PDF 编辑功能开发中')).toBeInTheDocument()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- HomePage`
预期：FAIL，首页仍为空壳，找不到「新建」。

- [ ] **步骤 3：编写实现代码**

改写 `renderer/src/pages/HomePage.tsx`：

```tsx
// 首页：新建入口与最近文档区块的组合页。
import React from 'react'
import { message } from 'antd'
import { useAppStore } from '../store'
import { DOC_TYPE_TO_MODULE } from '../routes'
import type { DocType } from '../mock/recentDocs'
import NewDocGrid from '../components/NewDocGrid'
import RecentDocs from '../components/RecentDocs'

/** 首页区块标题随导航筛选变化，未实现项不改变内容 */
const 标题映射: Record<string, string> = {
  home: '最近文档',
  recent: '最近',
  star: '星标文档',
  shared: '共享文档',
}

const HomePage = () => {
  const {
    navKey,
    setNavKey,
    viewMode,
    setViewMode,
    sortKey,
    setSortKey,
    visibleDocs,
    docs,
    activeDocId,
    setActiveDocId,
    toggleStar,
    openDoc,
    setModule,
  } = useAppStore()

  const 处理新建 = (类型: DocType) => {
    if (类型 === 'pdf') {
      message.info('PDF 编辑功能开发中')
      return
    }
    setModule(DOC_TYPE_TO_MODULE[类型])
  }

  const 处理打开 = (标识: string) => {
    const 目标 = docs.find((文档) => 文档.id === 标识)
    if (目标 === undefined) {
      message.error('未找到该文档，可能已被移除')
      return
    }
    if (目标.type === 'pdf') {
      message.info('PDF 编辑功能开发中')
      return
    }
    openDoc(目标)
  }

  return React.createElement(
    'div',
    { className: 'wps-home' },
    React.createElement(
      'section',
      { className: 'wps-section' },
      React.createElement('h2', { className: 'wps-section__title' }, '新建'),
      React.createElement(NewDocGrid, { onSelect: 处理新建 })
    ),
    React.createElement(RecentDocs, {
      docs: visibleDocs,
      title: 标题映射[navKey] ?? '最近文档',
      viewMode,
      sortKey,
      activeDocId,
      onSelect: setActiveDocId,
      onOpen: 处理打开,
      onToggleStar: toggleStar,
      onViewModeChange: setViewMode,
      onSortChange: setSortKey,
      onViewAll: () => setNavKey('recent'),
      onEmptyAction: () => setModule('word'),
    })
  )
}

export default HomePage
```

导航处理统一上提到 `store`，由 `App` 与 `HomePage` 共用，避免污染全局。

`store.ts` 顶部补充导入：

```ts
import { NAV_GROUPS } from './routes'
```

在 `AppState` 接口中追加字段：

```ts
  /** 处理首页导航点击：未实现项给出中文提示，不切换内容 */
  handleNav: (键: string, 提示: (文本: string) => void) => void
```

在 `AppProvider` 内、`useMemo` 之前实现，并把 `handleNav` 加入 `useMemo` 的返回值与依赖数组：

```ts
  const handleNav = (键: string, 提示: (文本: string) => void) => {
    const 目标项 = NAV_GROUPS.flat().find((项) => 项.key === 键)
    if (目标项 === undefined) {
      提示('该导航项不存在')
      return
    }
    if (!目标项.implemented) {
      提示(`「${目标项.label}」功能开发中`)
      return
    }
    setNavKey(键)
  }
```

同步更新 `store.test.tsx`：顶部改为 `import { describe, it, expect, vi } from 'vitest'`；
探针组件接收可选的提示函数；渲染辅助透传该参数。

```tsx
const 探针 = ({ 提示文本 }: { 提示文本?: (文本: string) => void }) => {
  const 状态 = useAppStore()
  return (
    <div>
      {/* 既有断言节点保持不变 */}
      <button onClick={() => 状态.handleNav('cloud', 提示文本 ?? (() => {}))}>切云文档</button>
    </div>
  )
}

const 渲染探针 = (提示文本?: (文本: string) => void) =>
  render(
    <AppProvider>
      <探针 提示文本={提示文本} />
    </AppProvider>
  )
```

新增用例：

```tsx
  it('未实现的导航项不切换内容并给出中文提示', async () => {
    const 提示 = vi.fn()
    渲染探针(提示)
    await userEvent.click(screen.getByText('切云文档'))
    expect(提示).toHaveBeenCalledWith('「我的云文档」功能开发中')
    expect(screen.getByTestId('nav')).toHaveTextContent('home')
  })
```

- [ ] **步骤 4：运行测试验证通过**

运行：`npm run test:run -- HomePage store`
预期：HomePage `Tests 5 passed`，store `Tests 9 passed`。

- [ ] **步骤 5：提交**

```powershell
git add renderer/src/pages/HomePage.tsx renderer/src/pages/HomePage.test.tsx renderer/src/store.ts renderer/src/store.test.tsx
git commit -m "feat: 装配首页并统一导航处理"
```

---

## 任务 17：应用装配与全局样式

**文件：**
- 改写：`renderer/src/App.tsx`
- 改写：`renderer/src/styles.css`
- 测试：`renderer/src/App.test.tsx`

- [ ] **步骤 1：编写失败的测试**

创建 `renderer/src/App.test.tsx`：

```tsx
import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import App from './App'

describe('应用外壳', () => {
  it('渲染顶栏、侧栏与首页内容', () => {
    render(<App />)
    expect(screen.getByText('WPS Office')).toBeInTheDocument()
    expect(screen.getByText('新建')).toBeInTheDocument()
    expect(screen.getByText('我的云文档')).toBeInTheDocument()
  })

  it('点击未实现导航项给出中文提示且不切换内容', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('脑图'))
    expect(await screen.findByText('「脑图」功能开发中')).toBeInTheDocument()
    expect(screen.getByText('新建')).toBeInTheDocument()
  })

  it('点击星标导航后仅展示星标文档', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('星标'))
    expect(screen.getByText('星标文档')).toBeInTheDocument()
  })

  it('进入文档模块后可返回首页', async () => {
    render(<App />)
    await userEvent.click(screen.getByText('新建文字'))
    expect(screen.getByText('编辑功能开发中')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: '返回首页' }))
    expect(screen.getByText('新建')).toBeInTheDocument()
  })

  it('渲染底部状态栏统计', () => {
    render(<App />)
    expect(screen.getByText('共 12 个文档')).toBeInTheDocument()
  })
})
```

- [ ] **步骤 2：运行测试验证失败**

运行：`npm run test:run -- App`
预期：FAIL，App 仍为旧骨架。

- [ ] **步骤 3：编写应用外壳实现**

改写 `renderer/src/App.tsx`：

```tsx
// 应用外壳：按当前模块装配首页视图或编辑器视图，并统一挂载顶栏、侧栏与状态栏。
import React from 'react'
import { ConfigProvider, message } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import { AppProvider, useAppStore } from './store'
import { MODULES, type ModuleKey } from './routes'
import TitleBar from './components/TitleBar'
import Sidebar from './components/Sidebar'
import Footer from './components/Footer'
import ErrorBoundary from './components/ErrorBoundary'

const 主题 = {
  token: {
    colorPrimary: '#2B6CF6',
    colorText: '#1A1D24',
    colorTextSecondary: '#5C6472',
    borderRadius: 6,
    fontFamily: '"Microsoft YaHei", "PingFang SC", Arial, sans-serif',
  },
}

const 外壳 = () => {
  const {
    module,
    setModule,
    navKey,
    handleNav,
    docs,
  } = useAppStore()

  const 是首页 = module === 'home'
  const 当前模块 = MODULES[module]
  const 星标数 = docs.filter((文档) => 文档.starred).length

  // 编辑器视图下顶栏展示打开中的文档名，首页视图下展示搜索框
  const 当前文档名 = React.useMemo(() => {
    if (是首页) {
      return undefined
    }
    const 类型匹配 = docs.find((文档) => 文档.type !== 'pdf' && 文档.type === module)
    return 类型匹配?.name
  }, [是首页, module, docs])

  const 页面组件 = 当前模块.page

  return React.createElement(
    'div',
    { className: 'wps-app' },
    React.createElement(TitleBar, {
      pageName: 当前模块.label,
      documentName: 当前文档名,
      onSetting: () => message.info('设置功能开发中'),
      onHelp: () => message.info('帮助与反馈功能开发中'),
    }),
    React.createElement(
      'div',
      { className: 'wps-body' },
      React.createElement(Sidebar, {
        mode: 是首页 ? 'home' : 'editor',
        activeKey: navKey,
        onSelect: (键: string) => handleNav(键, (文本: string) => message.info(文本)),
        moduleLabel: 当前模块.label,
        onBack: () => setModule('home'),
      }),
      React.createElement(
        'main',
        { className: 'wps-main' },
        React.createElement(ErrorBoundary, null,
          React.createElement(页面组件, null)
        )
      )
    ),
    React.createElement(Footer, { total: docs.length, starred: 星标数 })
  )
}

const App = () =>
  React.createElement(
    ConfigProvider,
    { locale: zhCN, theme: 主题 },
    React.createElement(AppProvider, null, React.createElement(外壳, null))
  )

export default App
```

- [ ] **步骤 4：编写全局样式**

改写 `renderer/src/styles.css`：

```css
/* 设计令牌：浅色基调，与规格文档第一章一一对应 */
:root {
  --brand: #2b6cf6;
  --brand-hover: #1e5ae0;
  --brand-soft: #ebf1fe;
  --bg-app: #f5f7fa;
  --bg-card: #ffffff;
  --bg-hover: #f2f5fa;
  --border: #e8ebf0;
  --border-subtle: #f0f2f5;
  --text-1: #1a1d24;
  --text-2: #5c6472;
  --text-3: #8a92a6;
  --star: #f5a623;
  --danger: #e34d59;
  --success: #00a870;
  --warning: #ed7b2f;
  --shadow-card: 0 4px 16px rgba(31, 41, 55, 0.1);
  --radius-card: 8px;
  --radius-control: 6px;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  height: 100%;
  margin: 0;
  padding: 0;
}

body {
  font-family: "Microsoft YaHei", "PingFang SC", Arial, sans-serif;
  font-size: 14px;
  color: var(--text-1);
  background: var(--bg-app);
  -webkit-font-smoothing: antialiased;
}

button {
  font-family: inherit;
}

/* 应用骨架 */
.wps-app {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.wps-body {
  display: flex;
  flex: 1 1 auto;
  min-height: 0;
}

.wps-main {
  flex: 1 1 auto;
  min-width: 0;
  padding: 24px;
  overflow: auto;
  background: var(--bg-app);
}

/* 顶栏 */
.wps-titlebar {
  display: flex;
  align-items: center;
  flex: 0 0 auto;
  height: 48px;
  padding: 0 16px;
  background: var(--bg-card);
  border-bottom: 1px solid var(--border);
}

.wps-titlebar__brand {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 200px;
}

.wps-logo {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  border-radius: 50%;
  background: var(--brand);
  color: #fff;
  font-size: 15px;
  font-weight: 700;
}

.wps-titlebar__name {
  font-size: 15px;
  font-weight: 600;
  color: var(--text-1);
}

.wps-titlebar__divider {
  width: 1px;
  height: 14px;
  background: var(--border);
}

.wps-titlebar__page {
  font-size: 13px;
  color: var(--text-3);
}

.wps-titlebar__center {
  display: flex;
  flex: 1 1 auto;
  justify-content: center;
  min-width: 0;
}

.wps-titlebar__search {
  width: 320px;
  max-width: 100%;
}

.wps-titlebar__doc {
  font-size: 14px;
  color: var(--text-2);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wps-titlebar__actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 0 0 200px;
  justify-content: flex-end;
}

.wps-icon-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-control);
  background: transparent;
  color: var(--text-2);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.wps-icon-button:hover {
  background: var(--bg-hover);
  color: var(--brand);
}

.wps-icon-button:active {
  background: var(--brand-soft);
}

.wps-avatar {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  background: var(--brand-soft);
  color: var(--brand);
  font-size: 13px;
  font-weight: 600;
  cursor: default;
}

/* 左侧导航 */
.wps-sidebar {
  flex: 0 0 200px;
  width: 200px;
  padding: 8px;
  background: var(--bg-card);
  border-right: 1px solid var(--border);
  overflow-y: auto;
}

.wps-sidebar__group {
  padding: 4px 0;
}

.wps-sidebar__group + .wps-sidebar__group {
  border-top: 1px solid var(--border-subtle);
  margin-top: 4px;
  padding-top: 8px;
}

.wps-sidebar__back {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  margin-bottom: 8px;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
}

.wps-sidebar__back:hover {
  color: var(--brand);
  border-color: var(--brand);
}

.wps-nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 9px 10px;
  border-radius: var(--radius-control);
  color: var(--text-2);
  font-size: 14px;
  cursor: pointer;
  user-select: none;
  transition: background 0.15s ease, color 0.15s ease;
}

.wps-nav-item:hover {
  background: var(--bg-hover);
}

.wps-nav-item--active {
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 600;
}

.wps-nav-item--active::before {
  content: "";
  position: absolute;
  left: 0;
  top: 50%;
  transform: translateY(-50%);
  width: 3px;
  height: 16px;
  border-radius: 0 2px 2px 0;
  background: var(--brand);
}

.wps-nav-item--disabled {
  color: var(--text-3);
  cursor: default;
}

.wps-nav-item__icon {
  flex: 0 0 auto;
}

.wps-nav-item__label {
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

/* 区块与标题 */
.wps-section + .wps-section {
  margin-top: 32px;
}

.wps-section__title {
  margin: 0 0 16px;
  font-size: 16px;
  font-weight: 600;
  color: var(--text-1);
}

.wps-section__head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.wps-section__head .wps-section__title {
  margin: 0;
}

.wps-section__actions {
  display: flex;
  align-items: center;
  gap: 12px;
}

.wps-segmented {
  display: inline-flex;
  padding: 2px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-card);
}

.wps-segmented__item {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: transparent;
  color: var(--text-3);
  cursor: pointer;
  transition: background 0.15s ease, color 0.15s ease;
}

.wps-segmented__item:hover {
  color: var(--brand);
}

.wps-segmented__item--active {
  background: var(--brand-soft);
  color: var(--brand);
}

.wps-text-button {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: var(--radius-control);
  background: var(--bg-card);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
}

.wps-text-button:hover {
  color: var(--brand);
  border-color: var(--brand);
}

.wps-link-button {
  border: none;
  background: transparent;
  color: var(--brand);
  font-size: 13px;
  cursor: pointer;
  padding: 4px 2px;
}

.wps-link-button:hover {
  color: var(--brand-hover);
  text-decoration: underline;
}

/* 新建四宫格 */
.wps-new-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(168px, 1fr));
  gap: 16px;
}

.wps-new-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 10px;
  height: 104px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--bg-card);
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease;
}

.wps-new-card:hover {
  border-color: var(--brand);
  box-shadow: var(--shadow-card);
  transform: translateY(-1px);
}

.wps-new-card:active {
  transform: translateY(0);
}

.wps-new-card__label {
  font-size: 14px;
  color: var(--text-1);
}

.wps-new-card--disabled .wps-new-card__label {
  color: var(--text-3);
}

/* 文档网格 */
.wps-doc-grid {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  gap: 16px;
}

@media (max-width: 1599px) {
  .wps-doc-grid {
    grid-template-columns: repeat(4, minmax(0, 1fr));
  }
}

@media (max-width: 1239px) {
  .wps-doc-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

.wps-doc-card {
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--bg-card);
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.wps-doc-card:hover {
  border-color: #cfdcf8;
  box-shadow: var(--shadow-card);
}

.wps-doc-card--active {
  border-color: var(--brand);
  background: var(--brand-soft);
}

.wps-doc-card__thumb {
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 104px;
  background: #f7f9fc;
  border-bottom: 1px solid var(--border-subtle);
}

.wps-doc-card__badge {
  position: absolute;
  left: 8px;
  top: 8px;
  padding: 1px 6px;
  border-radius: 4px;
  color: #fff;
  font-size: 12px;
  line-height: 18px;
}

.wps-doc-card__star {
  position: absolute;
  right: 6px;
  top: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  border: none;
  border-radius: 4px;
  background: rgba(255, 255, 255, 0.9);
  color: var(--text-3);
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, color 0.15s ease;
}

.wps-doc-card:hover .wps-doc-card__star,
.wps-doc-card__star--on {
  opacity: 1;
}

.wps-doc-card__star--on {
  color: var(--star);
}

.wps-doc-card__info {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 10px 12px 12px;
}

.wps-doc-card__name {
  font-size: 14px;
  color: var(--text-1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wps-doc-card__meta {
  font-size: 12px;
  color: var(--text-3);
  font-variant-numeric: tabular-nums;
}

/* 文档列表 */
.wps-doc-list {
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--bg-card);
  overflow: hidden;
}

.wps-doc-list__head,
.wps-doc-row {
  display: grid;
  grid-template-columns: 1fr 80px 160px 100px 48px;
  align-items: center;
  gap: 12px;
  padding: 10px 16px;
}

.wps-doc-list__head {
  background: #fafbfd;
  border-bottom: 1px solid var(--border);
  color: var(--text-3);
  font-size: 12px;
}

.wps-doc-row {
  border-bottom: 1px solid var(--border-subtle);
  color: var(--text-2);
  font-size: 13px;
  cursor: pointer;
  font-variant-numeric: tabular-nums;
}

.wps-doc-row:last-child {
  border-bottom: none;
}

.wps-doc-row:hover {
  background: var(--bg-hover);
}

.wps-doc-row__name {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  color: var(--text-1);
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
}

.wps-doc-row__icon {
  flex: 0 0 auto;
}

.wps-doc-row__star {
  display: inline-flex;
  align-items: center;
  color: var(--star);
}

/* 空状态 */
.wps-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 64px 16px;
  border: 1px dashed var(--border);
  border-radius: var(--radius-card);
  background: var(--bg-card);
}

.wps-empty__icon {
  color: #c9d2e0;
}

.wps-empty__title {
  margin: 8px 0 0;
  font-size: 15px;
  color: var(--text-1);
}

.wps-empty__desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}

.wps-empty__action {
  margin-top: 8px;
}

/* 编辑器占位 */
.wps-editor {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  min-height: 420px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--bg-card);
}

.wps-editor__stage {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.wps-editor__icon {
  color: #c9d2e0;
}

.wps-editor__title {
  margin: 8px 0 0;
  font-size: 18px;
  font-weight: 600;
  color: var(--text-1);
}

.wps-editor__desc {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}

.wps-editor__back {
  margin-top: 8px;
}

/* 异常兜底 */
.wps-error {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  height: 100%;
  min-height: 320px;
  padding: 32px;
  border: 1px solid var(--border);
  border-radius: var(--radius-card);
  background: var(--bg-card);
  color: var(--text-2);
}

.wps-error__title {
  margin: 8px 0 0;
  font-size: 16px;
  color: var(--text-1);
}

.wps-error__message {
  margin: 0;
  font-size: 13px;
  color: var(--text-3);
}

.wps-error__action {
  margin-top: 8px;
}

/* 底部状态栏 */
.wps-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  flex: 0 0 auto;
  height: 28px;
  padding: 0 16px;
  background: var(--bg-card);
  border-top: 1px solid var(--border);
  color: var(--text-3);
  font-size: 12px;
  font-variant-numeric: tabular-nums;
}

.wps-footer__left {
  display: flex;
  align-items: center;
  gap: 8px;
}

.wps-footer__dot {
  color: var(--border);
}
```

- [ ] **步骤 5：运行测试验证通过**

运行：`npm run test:run`
预期：全部测试文件通过，无失败用例。

- [ ] **步骤 6：提交**

```powershell
git add renderer/src/App.tsx renderer/src/App.test.tsx renderer/src/styles.css
git commit -m "feat: 装配应用外壳并落地首页全局样式"
```

---

## 任务 18：构建与运行验证

**文件：**
- 无源码变更，仅执行验证

- [ ] **步骤 1：全量测试**

运行：`npm run test:run`
预期：`Test Files` 全部 passed，`Tests` 全部 passed，退出码 0。

- [ ] **步骤 2：生产构建**

运行：`npm run build`
预期：输出 `dist/index.html`、`dist/assets/*.css`、`dist/assets/*.js`，`built in` 若干秒，退出码 0。

- [ ] **步骤 3：启动应用并截图核对**

在后台启动：

```powershell
npm start
```

等待窗口出现后，用 PrintWindow 抓取标题为「WPS 模仿办公软件」的窗口图像并保存到项目根目录，
与 `docs/superpowers/specs/2026-09-22-wps-home-ui-design.md` 的布局描述逐项比对：顶栏、左侧导航
分组、新建四宫格、最近文档网格、底部状态栏。

验证完成后终止后台任务，避免占用 5172 端口。

- [ ] **步骤 4：交互逐项验证**

在运行中的应用上依次确认：

| 序号 | 操作 | 预期 |
| --- | --- | --- |
| 1 | 点击左侧「星标」 | 区块标题变为「星标文档」，仅剩星标条目 |
| 2 | 点击左侧「脑图」 | 弹出「「脑图」功能开发中」，内容不变 |
| 3 | 点击「新建表格」 | 进入表格模块页，显示「编辑功能开发中」 |
| 4 | 点击「返回首页」 | 回到首页 |
| 5 | 点击「PDF 工具」 | 弹出「PDF 编辑功能开发中」，不跳转 |
| 6 | 点击视图切换为列表 | 切换为列表视图并显示表头 |
| 7 | 点击排序选择「按大小」 | 顺序按大小重排 |
| 8 | 点击某文档星标 | 星标高亮切换，选中态不变 |
| 9 | 双击某文档卡片 | 进入对应模块页 |

任一项不符预期即回到对应任务修正，不以「看起来正常」代替实测。

- [ ] **步骤 5：记录验证输出**

将测试与构建的实测输出粘贴到 `功能修改说明.md` 的验证章节，作为完成依据。

---

## 任务 19：文档更新与收尾提交

**文件：**
- 改写：`功能修改说明.md`
- 修改：`README.md`

- [ ] **步骤 1：改写功能修改说明**

`功能修改说明.md` 需包含：本次修改目标、涉及的界面范围、新增与修改的文件清单表格、
测试与构建实测输出、交互验证结果、遗留事项（主进程 `contextIsolation` 安全问题、
真实数据接入、编辑器能力）。

- [ ] **步骤 2：更新 README**

`README.md` 需更新：目录结构章节补充 `docs/`、`pages/`、`mock/`、`test/` 与新增组件；
新增「测试」章节说明 `npm test` 与 `npm run test:run`；「已知缺陷与待完善事项」中移除已落地的
空文件条目，保留主进程安全问题与未引用文件条目。

- [ ] **步骤 3：提交**

```powershell
git add README.md 功能修改说明.md docs
git commit -m "docs: 更新功能修改说明与 README"
```

- [ ] **步骤 4：确认工作区干净**

运行：`git status --short`
预期：无输出，即全部变更已提交。

---

## 自检结论

**规格覆盖度：** 规格二（视觉规范）由任务 6、17 覆盖；规格三（布局结构）由任务 9 至 14、17 覆盖；
规格四（文件结构）由任务 3 至 17 全量覆盖；规格五（数据模型）由任务 3 覆盖；
规格六（交互行为）由任务 10、11、12、13、15、16、17、18 覆盖；
规格七（测试策略）由任务 2 及每个任务的测试步骤覆盖；
规格八（验证方式）由任务 18 覆盖；规格九（交付物）由任务 1、19 覆盖。无遗漏章节。

**占位符扫描：** 无「待定」「TODO」「后续实现」等表述；每个代码步骤均给出可直接落盘的完整代码。

**类型一致性：** `DocItem`、`DocType`、`SortKey`、`NavKey`、`ViewMode`、`ModuleKey`
均在任务 3、4、5 中定义，后续任务只引用不重定义；`handleNav` 在任务 16 中定义并在任务 17 中消费；
`AppState` 字段名在任务 5 与任务 16、17 中保持一致。

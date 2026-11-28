// 唯一文案台账入口（2.8.0 工作流一）：渲染层与移动 Web 共用；新增域在此汇总。
// 规则见 2.8.0 升级计划附录 C：键名 域.页面.用途，只用小写字母、数字与点号，同一键不得重复。
import { 应用页文案 } from './apps'
import { 图形项目文案 } from './diagram'
import { 多维表格文案 } from './multitable'
import type { 台账条目 } from './types'

export const 台账 = { ...应用页文案, ...图形项目文案, ...多维表格文案 } satisfies Record<string, 台账条目>
export type 文案键 = keyof typeof 台账
/** 已完成显式迁移的源码文件：扫描器要求其中不再出现未经台账的中文界面文字 */
export const 已迁移文件 = ['renderer/src/localTools/AppsPage.tsx', 'renderer/src/localTools/DiagramLibrary.tsx']
export type { 台账条目 }

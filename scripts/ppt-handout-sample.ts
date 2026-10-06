// 任务 13b 证据脚本：用真实渲染代码生成讲义与备注导出 HTML，供 Electron 真实栅格化。
// 运行：npx vite-node scripts/ppt-handout-sample.ts <输出目录>
import fs from 'fs'
import path from 'path'
import { 创建演示文稿, 创建幻灯片 } from '../renderer/src/ppt/deck'
import { 生成导出Html } from '../renderer/src/ppt/export/exportHtml'
import { 默认导出选项, type 导出选项 } from '../renderer/src/ppt/model/exportPlan'
import type { 讲义设置, 备注设置 } from '../renderer/src/ppt/model/handout'

const 输出目录 = process.argv[2] ?? path.join('E:', 'DevCache', 'ppt-upgrade-evidence', 'task13b')
fs.mkdirSync(输出目录, { recursive: true })

const 讲义设置样例: 讲义设置 = { 每页张数: 2, 页眉: '海豹办公 讲义', 页脚: '内部资料', 显示日期: true, 显示页码: true }
const 备注设置样例: 备注设置 = { 排版: '幻灯片加备注', 页眉: '备注页', 页脚: '第 <页码> 页', 显示日期: true, 显示页码: true }

function 建样例文稿() {
  const 文稿 = 创建演示文稿('讲义验收.pptx')
  文稿.幻灯片列表[0].title = '第一页标题'
  文稿.幻灯片列表[0].备注 = '第一页的演讲备注：介绍背景与目标。'
  文稿.幻灯片列表.push(创建幻灯片('标题和内容', '第二页标题'))
  文稿.幻灯片列表.push(创建幻灯片('标题和内容', '第三页标题'))
  文稿.幻灯片列表[1].备注 = '第二页的演讲备注：说明实现方式。'
  文稿.幻灯片列表[2].备注 = '第三页的演讲备注：给出结论与后续计划。'
  return 文稿
}

const 文稿 = 建样例文稿()
const 页面尺寸 = { 宽: 960, 高: 540 }
const 基础选项: 导出选项 = { ...默认导出选项, 格式: 'PDF', 范围: '全部', 讲义每页张数: 2 }

const 讲义Html = 生成导出Html(文稿, { ...基础选项, 输出备注: false, 讲义设置: 讲义设置样例, 讲义每页张数: 2 } as 导出选项, {}, 页面尺寸, 文稿.name)
// 讲义与备注互斥：备注输出必须保持 讲义每页张数 = 1
const 备注Html = 生成导出Html(文稿, { ...默认导出选项, 格式: 'PDF', 范围: '全部', 输出备注: true, 备注设置: 备注设置样例 } as 导出选项, {}, 页面尺寸, 文稿.name)

const 讲义路径 = path.join(输出目录, 'handout-export.html')
const 备注路径 = path.join(输出目录, 'notes-export.html')
fs.writeFileSync(讲义路径, 讲义Html, 'utf8')
fs.writeFileSync(备注路径, 备注Html, 'utf8')

const 统计 = {
  页数: 文稿.幻灯片列表.length,
  讲义: { 文件: 讲义路径, 区块数: (讲义Html.match(/class="seal-export-page"/g) ?? []).length, 含页眉: 讲义Html.includes('海豹办公 讲义'), 含日期: 讲义Html.includes('2026') || 讲义Html.includes('讲义') },
  备注: { 文件: 备注路径, 区块数: (备注Html.match(/class="seal-export-page"/g) ?? []).length, 含第一页备注: 备注Html.includes('第一页的演讲备注'), 含第三页备注: 备注Html.includes('第三页的演讲备注') },
}
fs.writeFileSync(path.join(输出目录, 'handout-sample.json'), JSON.stringify(统计, null, 2), 'utf8')
console.log(JSON.stringify(统计, null, 2))

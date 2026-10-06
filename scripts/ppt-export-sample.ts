// 任务 10 证据脚本：用真实渲染代码生成导出 HTML，供 Electron 栅格化核验。
// 运行：npx vite-node scripts/ppt-export-sample.ts <输出目录>
import fs from 'fs'
import path from 'path'
import { 添加幻灯片, 创建演示文稿, 创建文本框 } from '../renderer/src/ppt/deck'
import { 创建图形, 创建表格, 创建图表 } from '../renderer/src/ppt/model/elements'
import { 生成导出Html } from '../renderer/src/ppt/export/exportHtml'
import { 默认导出选项 } from '../renderer/src/ppt/model/exportPlan'

const 输出目录 = process.argv[2] ?? path.join('E:', 'DevCache', 'ppt-upgrade-evidence', 'task10')
fs.mkdirSync(输出目录, { recursive: true })

/** 1×1 透明 PNG，仅用于让图片对象有真实可用资源 */
const 示例图片 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8AAAwAB/AGb7yQAAAAASUVORK5CYII='

function 建样例文稿() {
  let 文稿 = 创建演示文稿('导出样例.pptx')
  文稿 = 添加幻灯片(文稿)
  文稿 = 添加幻灯片(文稿)

  const 标题页 = 文稿.幻灯片列表[0]
  标题页.文本框列表 = [创建文本框(80, 60, 800, 120, '导出能力验收样例', 40)]
  标题页.对象列表 = [
    { id: '样例图片', 类型: '图片', x: 560, y: 240, width: 320, height: 200, 资源标识: '示例图片' },
    创建图形('矩形', '图形对象'),
    创建表格(3, 3),
    创建图表('柱状图'),
  ]

  const 正文页 = 文稿.幻灯片列表[1]
  正文页.文本框列表 = [创建文本框(80, 60, 800, 80, '第二页：中文与标点，导出应一致。', 32)]
  正文页.备注 = '这一页有演讲备注，PDF 备注输出会在同一页下方显示。'
  正文页.对象列表 = [创建图形('椭圆', '椭圆')]
  正文页.隐藏 = false

  const 隐藏页 = 文稿.幻灯片列表[2]
  隐藏页.文本框列表 = [创建文本框(80, 60, 800, 80, '隐藏页', 32)]
  隐藏页.隐藏 = true

  return 文稿
}

const 文稿 = 建样例文稿()
const 图片地址 = { 示例图片 }
const 页面尺寸 = { 宽: 960, 高: 540 }

const 输出 = [
  { 名称: 'sample-全部页面.html', 选项: { ...默认导出选项, 格式: 'HTML' as const, 含隐藏页: true } },
  { 名称: 'sample-讲义6.html', 选项: { ...默认导出选项, 格式: 'PDF' as const, 含隐藏页: true, 讲义每页张数: 6 as const } },
  { 名称: 'sample-备注.html', 选项: { ...默认导出选项, 格式: 'PDF' as const, 含隐藏页: true, 输出备注: true } },
  { 名称: 'sample-扫描件.html', 选项: { ...默认导出选项, 格式: '扫描件PDF' as const, 含隐藏页: true } },
]

const 记录 = 输出.map(项 => {
  const html = 生成导出Html(文稿, 项.选项, 图片地址, 页面尺寸, 文稿.name)
  fs.writeFileSync(path.join(输出目录, 项.名称), html, 'utf8')
  return { 文件: 项.名称, 区块数: (html.match(/class="seal-export-page"/g) ?? []).length, 字节数: Buffer.byteLength(html, 'utf8') }
})

// 供 Electron 栅格化脚本读取的页面清单
fs.writeFileSync(path.join(输出目录, 'samples.json'), JSON.stringify({ 页面尺寸, 输出: 记录, 条目: 文稿.幻灯片列表.map((页, 序号) => ({ 序号, 标识: 页.id, 隐藏: Boolean(页.隐藏) })) }, null, 2), 'utf8')
console.log(JSON.stringify(记录, null, 2))

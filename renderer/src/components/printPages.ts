import { 载入PDF } from '../pdf/pdfLoader'

/**
 * 把预览用的 PDF 逐页栅格化成纯 HTML 打印页。
 *
 * Electron 在隐藏窗口里直接 print() 内置 PDF 查看器时，查看器位于独立的插件框架，
 * 系统打印只拿到外层空白文档，结果整页空白（Windows 打印对话框显示"没有可用的预览"）。
 * 这里改为在渲染层用 pdf.js 画出每一页，再交给普通 HTML 打印，保证与预览一致。
 */
export interface 打印页面选项 {
  /** 打印分辨率，默认 200 DPI；超长文档自动降到 150 DPI 控制内存。 */
  dpi?: number
  on进度?: (当前: number, 总数: number) => void
  是否取消?: () => boolean
}

const 每英寸点数 = 72

export function 转义属性(文本: string): string {
  return 文本.replace(/[&<>"]/g, (字符) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[字符] as string))
}

/** 生成每页一个具名 @page 的打印 HTML，纵横混排的 PDF 也能各自保持原始纸张尺寸。 */
export function 组装打印HTML(页面: Array<{ 图片: string; 宽pt: number; 高pt: number }>, 标题 = '打印'): string {
  const 尺寸表 = new Map<string, string>()
  const 页样式: string[] = []
  const 页面片段 = 页面.map((页) => {
    const 键 = `${页.宽pt.toFixed(2)}x${页.高pt.toFixed(2)}`
    let 名称 = 尺寸表.get(键)
    if (!名称) {
      名称 = `p${尺寸表.size}`
      尺寸表.set(键, 名称)
      页样式.push(`@page ${名称} { size: ${页.宽pt.toFixed(2)}pt ${页.高pt.toFixed(2)}pt; margin: 0; }`
        // 高度比纸张少 1pt：恰好等高时 Chromium 的分页取整会在每页后多出一张空白页。
        + `.sheet.${名称} { page: ${名称}; width: ${页.宽pt.toFixed(2)}pt; height: ${(页.高pt - 1).toFixed(2)}pt; }`)
    }
    return `<div class="sheet ${名称}"><img src="${页.图片}" alt=""></div>`
  })
  const 首页 = 页面[0]
  const 默认尺寸 = 首页 ? `${首页.宽pt.toFixed(2)}pt ${首页.高pt.toFixed(2)}pt` : 'A4'
  return `<!doctype html><html><head><meta charset="utf-8"><title>${转义属性(标题)}</title><style>
@page { size: ${默认尺寸}; margin: 0; }
${页样式.join('\n')}
html, body { margin: 0; padding: 0; background: #fff; }
.sheet { position: relative; overflow: hidden; break-inside: avoid; page-break-inside: avoid; break-after: page; page-break-after: always; }
.sheet:last-child { break-after: auto; page-break-after: auto; }
.sheet img { display: block; width: 100%; height: 100%; object-fit: fill; }
* { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
</style></head><body>${页面片段.join('')}</body></html>`
}

export async function 生成打印页面HTML(pdf数据: string, 标题 = '打印', 选项: 打印页面选项 = {}): Promise<string> {
  const { 文档, 关闭 } = await 载入PDF(pdf数据)
  try {
    const 总数 = 文档.numPages
    const dpi = 选项.dpi ?? (总数 > 80 ? 150 : 200)
    const 页面: Array<{ 图片: string; 宽pt: number; 高pt: number }> = []
    for (let 页码 = 1; 页码 <= 总数; 页码 += 1) {
      if (选项.是否取消?.()) throw new Error('打印已取消')
      选项.on进度?.(页码, 总数)
      const 页 = await 文档.getPage(页码)
      const 原始 = 页.getViewport({ scale: 1 })
      // 单页像素上限约 2400 万，避免超大图纸撑爆画布。
      let 比例 = dpi / 每英寸点数
      const 像素 = 原始.width * 原始.height * 比例 * 比例
      if (像素 > 24_000_000) 比例 *= Math.sqrt(24_000_000 / 像素)
      const 视口 = 页.getViewport({ scale: 比例 })
      const 画布 = document.createElement('canvas')
      画布.width = Math.max(1, Math.floor(视口.width))
      画布.height = Math.max(1, Math.floor(视口.height))
      const 画笔 = 画布.getContext('2d')
      if (!画笔) throw new Error('无法创建打印画布')
      画笔.fillStyle = '#ffffff'
      画笔.fillRect(0, 0, 画布.width, 画布.height)
      await 页.render({ canvas: 画布, canvasContext: 画笔, viewport: 视口, intent: 'print' }).promise
      页面.push({ 图片: 画布.toDataURL('image/png'), 宽pt: 原始.width, 高pt: 原始.height })
      画布.width = 0
      画布.height = 0
      页.cleanup()
    }
    if (!页面.length) throw new Error('文档没有可打印的页面')
    return 组装打印HTML(页面, 标题)
  } finally {
    关闭()
  }
}

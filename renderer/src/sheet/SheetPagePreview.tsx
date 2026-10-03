import { 解析地址, 生成地址 } from './address'
import { 读取单元格, 默认列宽, 默认行高, 默认页面设置, type Sheet } from './model'

interface Props {
  工作表: Sheet
}

const 纸张像素: Record<string, [number, number]> = {
  A4: [794, 1123],
  A5: [559, 794],
  B5: [665, 945],
  Letter: [816, 1056],
  跟随打印机: [794, 1123],
}

const 页边距英寸: Record<string, { 左: number; 右: number; 上: number; 下: number }> = {
  常规: { 左: 0.7, 右: 0.7, 上: 0.75, 下: 0.75 },
  窄: { 左: 0.25, 右: 0.25, 上: 0.75, 下: 0.75 },
  适中: { 左: 0.75, 右: 0.75, 上: 1, 下: 1 },
  宽: { 左: 1, 右: 1, 上: 1, 下: 1 },
}

function 按尺寸分页(尺寸: number[], 可用尺寸: number): number[][] {
  const 页: number[][] = []
  let 当前页: number[] = []
  let 已使用 = 0
  尺寸.forEach((长度, 索引) => {
    if (当前页.length > 0 && 已使用 + 长度 > 可用尺寸) {
      页.push(当前页)
      当前页 = []
      已使用 = 0
    }
    当前页.push(索引)
    已使用 += 长度
  })
  if (当前页.length > 0) 页.push(当前页)
  return 页
}

/** 按已有内容和页面尺寸分页，预览时不把空白的整张工作表铺成多页。 */
export default function SheetPagePreview({ 工作表 }: Props) {
  let 最大行 = 0
  let 最大列 = 0
  Object.entries(工作表.单元格).forEach(([地址, 单元]) => {
    if (!单元.原始值 && !单元.批注) return
    const 位置 = 解析地址(地址)
    if (!位置) return
    最大行 = Math.max(最大行, 位置.行)
    最大列 = Math.max(最大列, 位置.列)
  })
  const 设置 = { ...默认页面设置, ...工作表.页面设置 }
  const 原尺寸 = 纸张像素[设置.纸张大小] ?? 纸张像素.A4
  const [宽, 高] = 设置.方向 === '横向' ? [原尺寸[1], 原尺寸[0]] : 原尺寸
  const 边距 = 页边距英寸[设置.页边距] ?? 页边距英寸.常规
  const 留白 = { 左: 边距.左 * 96, 右: 边距.右 * 96, 上: 边距.上 * 96, 下: 边距.下 * 96 }
  const 列页 = 按尺寸分页(
    Array.from({ length: 最大列 + 1 }, (_, 列) => 工作表.列宽[列] ?? 默认列宽),
    宽 - 留白.左 - 留白.右
  )
  const 行页 = 按尺寸分页(
    Array.from({ length: 最大行 + 1 }, (_, 行) => 工作表.行高[行] ?? 默认行高),
    高 - 留白.上 - 留白.下
  )
  const 页面列表 = 行页.flatMap((行号列表) => 列页.map((列号列表) => ({ 行号列表, 列号列表 })))

  return (
    <div className="wps-sheet-print-preview" role="region" aria-label="页面布局预览">
      <div className="wps-sheet-print-preview__heading">
        <strong>{工作表.name}</strong>
        <span>{设置.纸张大小}，{设置.方向}，{设置.页边距}页边距，共 {页面列表.length} 页</span>
      </div>
      {页面列表.map(({ 行号列表, 列号列表 }, 页号) => (
        <section
          className="wps-sheet-print-preview__paper"
          aria-label={`第 ${页号 + 1} 页`}
          key={`${行号列表[0]}-${列号列表[0]}`}
          style={{ width: 宽, height: 高, padding: `${留白.上}px ${留白.右}px ${留白.下}px ${留白.左}px` }}
        >
          <table style={{ width: 列号列表.reduce((总宽, 列) => 总宽 + (工作表.列宽[列] ?? 默认列宽), 0) }}>
            <colgroup>{列号列表.map((列) => <col key={列} style={{ width: 工作表.列宽[列] ?? 默认列宽 }} />)}</colgroup>
            <tbody>
              {行号列表.map((行) => (
                <tr key={行} style={{ height: 工作表.行高[行] ?? 默认行高 }}>
                  {列号列表.map((列) => <td key={列}>{读取单元格(工作表, 生成地址(行, 列)).显示值}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <span className="wps-sheet-print-preview__page-number">{页号 + 1} / {页面列表.length}</span>
        </section>
      ))}
    </div>
  )
}

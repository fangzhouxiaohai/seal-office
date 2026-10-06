// 检查与本机美化面板：文字溢出、缺失字体、资源完整性检查与本机对齐排版。
// 明确不含 AI 布局建议（AI 候选美化属于任务 14，本面板不调用模型）。
import { useMemo, useState } from 'react'
import type { 演示文稿 } from '../deck'
import { 检查文字溢出, 检查缺失字体, 检查文稿完整性, 本机美化, 预览本机美化, type 文字度量 } from '../model/themes'
import { 读取当前幻灯片 } from '../deck'
import { 默认字体检测 } from './ThemePanel'

export interface 检查面板属性 {
  文稿: 演示文稿
  只读: boolean
  on应用: (文稿: 演示文稿) => void
  检测字体?: (字体: string) => boolean
  度量?: 文字度量
}

const 只读提示 = '当前演示文稿为只读状态，请先关闭只读查看'

export default function DesignCheckPanel({ 文稿, 只读, on应用, 检测字体 = 默认字体检测, 度量 }: 检查面板属性) {
  const 当前页 = 读取当前幻灯片(文稿)
  const [状态, set状态] = useState('')
  const [预览项, set预览项] = useState<string[] | null>(null)
  const [左边距, set左边距] = useState(80)
  const [标题字号, set标题字号] = useState(40)
  const [正文字号, set正文字号] = useState(24)
  const 溢出列表 = useMemo(() => 检查文字溢出(文稿, 度量), [文稿, 度量])
  const 缺失字体 = useMemo(() => 检查缺失字体(文稿, 检测字体), [文稿, 检测字体])
  const 完整性 = useMemo(() => 检查文稿完整性(文稿), [文稿])
  const 选项 = { 左边距, 统一标题字号: 标题字号, 统一正文字号: 正文字号, ...(当前页 ? { 页标识: 当前页.id } : {}) }
  const 禁用原因 = () => (只读 ? 只读提示 : undefined)

  return (
    <aside className="wps-ppt-design" aria-label="设计检查面板">
      <header className="wps-ppt-design__header">
        <h2>检查与美化</h2>
      </header>

      <section className="wps-ppt-design__section" aria-label="检查结果">
        <h3>检查结果</h3>
        <p className="wps-ppt-design__check">文字溢出：{溢出列表.length} 处{溢出列表.length ? `（首处需要 ${溢出列表[0].需要高度}px，可用 ${溢出列表[0].可用高度}px）` : ''}</p>
        <p className="wps-ppt-design__check">缺失字体：{缺失字体.length ? 缺失字体.map((项) => `${项.字体}（${项.数量} 处）`).join('、') : '无缺失'}</p>
        <p className="wps-ppt-design__check">资源完整性：{完整性.通过 ? '通过' : '未通过'}</p>
        {完整性.问题.length > 0 && (
          <ul className="wps-ppt-design__problems">
            {完整性.问题.map((项) => <li key={项}>{项}</li>)}
          </ul>
        )}
        {完整性.未引用资源.length > 0 && <p className="wps-ppt-design__hint">未引用但已保存的资源：{完整性.未引用资源.length} 项（删除前会保留，避免撤销后缺失）</p>}
        <p className="wps-ppt-design__hint">本机对齐与排版，不含 AI 布局建议；AI 候选美化将在后续任务接入模型后单独预览。</p>
      </section>

      <section className="wps-ppt-design__section" aria-label="本机美化">
        <h3>本机美化</h3>
        <label className="wps-ppt-design__field">
          左边距
          <input aria-label="美化左边距" type="number" value={左边距} disabled={只读} title={禁用原因()} onChange={(事件) => set左边距(Number(事件.target.value))} />
        </label>
        <label className="wps-ppt-design__field">
          标题字号
          <input aria-label="美化标题字号" type="number" value={标题字号} disabled={只读} title={禁用原因()} onChange={(事件) => set标题字号(Number(事件.target.value))} />
        </label>
        <label className="wps-ppt-design__field">
          正文字号
          <input aria-label="美化正文字号" type="number" value={正文字号} disabled={只读} title={禁用原因()} onChange={(事件) => set正文字号(Number(事件.target.value))} />
        </label>
        <div className="wps-ppt-design__actions">
          <button
            type="button"
            disabled={只读}
            title={禁用原因()}
            onClick={() => {
              try {
                const 预览 = 本机美化(文稿, 选项)
                set预览项(预览.调整列表)
                set状态(`预览：将调整 ${预览.调整列表.length} 处，确认后写入文稿`)
              } catch (错误) {
                set状态(错误 instanceof Error ? 错误.message : '美化预览失败')
              }
            }}
          >
            预览本机美化
          </button>
          <button
            type="button"
            disabled={只读}
            title={禁用原因()}
            onClick={() => {
              try {
                const 结果 = 本机美化(文稿, 选项)
                on应用(结果.文稿)
                set预览项(null)
                set状态(结果.调整列表.length ? `已应用 ${结果.调整列表.length} 处对齐与排版调整，可单次撤销还原` : '未发现需要调整的对齐与排版')
              } catch (错误) {
                set状态(错误 instanceof Error ? 错误.message : '本机美化失败')
              }
            }}
          >
            应用本机美化
          </button>
          <button
            type="button"
            disabled={只读}
            title={禁用原因()}
            onClick={() => {
              const 预览 = 预览本机美化(文稿, 选项)
              set预览项(null)
              set状态(预览 === 文稿 ? '当前没有可美化的页面' : '已生成全部页面的美化预览，确认后写入文稿')
            }}
          >
            预览全部页面
          </button>
        </div>
        {预览项 && <ul className="wps-ppt-design__problems">{预览项.map((项) => <li key={项}>{项}</li>)}</ul>}
      </section>

      <p className="wps-ppt-design__status" role="status" aria-live="polite">{状态}</p>
    </aside>
  )
}

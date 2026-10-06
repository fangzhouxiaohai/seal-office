import { useState } from 'react'
import { App } from 'antd'
import { 桥接, type 比对页结果, type 比对结果 } from '../../ipc/bridge'
import './review.css'

interface Props {
  /** 当前演示文稿已保存的路径，可作为左侧默认值 */
  当前路径?: string
}

const 类型名称: Record<string, string> = { 页面: '页面', 文本: '文本', 对象: '对象', 备注: '备注', 批注: '批注', 动画: '动画' }

/** 把差异值转成简短可读文本，避免把长对象直接铺在面板上 */
export function 格式化差异值(值: unknown): string {
  if (值 === undefined || 值 === null) return '（无）'
  if (typeof 值 === 'string') return 值.length > 60 ? `${值.slice(0, 60)}…` : 值 || '（空）'
  if (typeof 值 === 'number' || typeof 值 === 'boolean') return String(值)
  if (Array.isArray(值)) return `共 ${值.length} 项`
  return '（复合值）'
}

function 差异列表({ 页项 }: { 页项: 比对页结果 }) {
  const 分组 = new Map<string, typeof 页项.差异>()
  for (const 项 of 页项.差异 ?? []) {
    const 列表 = 分组.get(项.类型) ?? []
    列表.push(项)
    分组.set(项.类型, 列表)
  }
  return (
    <>
      {Array.from(分组, ([类型, 列表]) => (
        <div className="wps-compare__group" key={类型}>
          <h4>{类型名称[类型] ?? 类型}（{列表!.length}）</h4>
          <ul className="wps-compare__diffs">
            {列表!.map((项, 序号) => (
              <li key={`${项.标识}-${项.字段}-${序号}`}>
                <span className="wps-compare__target">{项.标识}</span>
                <span className="wps-compare__field">{项.字段 === '存在' ? '对象存在性' : 项.字段}</span>
                <span className="wps-compare__value">{格式化差异值(项.左)}</span>
                <span aria-hidden="true">→</span>
                <span className="wps-compare__value">{格式化差异值(项.右)}</span>
              </li>
            ))}
          </ul>
        </div>
      ))}
    </>
  )
}

export default function ComparePanel({ 当前路径 }: Props) {
  const { modal } = App.useApp()
  const [左路径, set左路径] = useState(当前路径 ?? '')
  const [右路径, set右路径] = useState('')
  const [结果, set结果] = useState<比对结果 | null>(null)
  const [进行中, set进行中] = useState(false)

  const 选择文件 = async (设置: (值: string) => void, 名称: string) => {
    try {
      const 路径 = await 桥接.showOpenDialog('ppt' as const)
      if (路径) 设置(路径)
      else if (路径 === null) modal.info({ title: '已取消选择', content: `未选择${名称}，文件没有被修改。` })
    } catch (错误) {
      modal.error({ title: '选择文件失败', content: 错误 instanceof Error ? 错误.message : `无法打开${名称}选择窗口` })
    }
  }

  const 开始比对 = async () => {
    if (!左路径.trim() || !右路径.trim()) {
      modal.warning({ title: '无法比对', content: '请先选择两份演示文稿文件。' })
      return
    }
    set进行中(true)
    set结果(null)
    try {
      const 返回 = await 桥接.presentationCompare.compareFiles(左路径, 右路径)
      if (!返回.成功) throw new Error(返回.错误 ?? '无法比对这两份文件')
      set结果(返回)
    } catch (错误) {
      modal.error({ title: '比对失败', content: 错误 instanceof Error ? 错误.message : '无法比对这两份文件' })
    } finally {
      set进行中(false)
    }
  }

  return (
    <aside className="wps-ppt-properties wps-compare" aria-label="文档比对">
      <fieldset disabled={进行中}>
        <legend>选择要比对的两份演示文稿</legend>
        <label>左侧文件<input aria-label="左侧文件" value={左路径} readOnly placeholder="尚未选择" /></label>
        <button type="button" onClick={() => void 选择文件(set左路径, '左侧文件')}>选择左侧文件</button>
        <label>右侧文件<input aria-label="右侧文件" value={右路径} readOnly placeholder="尚未选择" /></label>
        <button type="button" onClick={() => void 选择文件(set右路径, '右侧文件')}>选择右侧文件</button>
        <div className="wps-ppt-properties__actions">
          <button type="button" onClick={() => void 开始比对()} disabled={进行中}>{进行中 ? '正在比对…' : '开始比对'}</button>
          <button type="button" onClick={() => { set结果(null); set右路径('') }} disabled={进行中}>清空结果</button>
        </div>
        <p>比对只读取两份文件，不会修改其中任何一份。</p>
      </fieldset>
      {进行中 && <p aria-live="polite">正在读取并比对，请稍候。</p>}
      {结果 && (
        <section className="wps-compare__result">
          <h3>比对结果</h3>
          <p className="wps-compare__summary">
            新增 {结果.汇总?.新增页 ?? 0} 页、删除 {结果.汇总?.删除页 ?? 0} 页、移动 {结果.汇总?.移动页 ?? 0} 页、修改 {结果.汇总?.修改页 ?? 0} 页，共 {结果.汇总?.差异项 ?? 0} 项差异
          </p>
          {(结果.警告?.左.length || 结果.警告?.右.length) ? (
            <p className="wps-compare__warning">
              导入风险：{[...(结果.警告?.左 ?? []).map(项 => `左侧：${项}`), ...(结果.警告?.右 ?? []).map(项 => `右侧：${项}`)].join('；')}
            </p>
          ) : null}
          {(结果.批注?.未归属页面.length ?? 0) > 0 ? (
            <div className="wps-compare__group">
              <h4>批注（未归属到现存页面，{结果.批注!.未归属页面.length}）</h4>
              <ul className="wps-compare__diffs">
                {结果.批注!.未归属页面.map((项, 序号) => (
                  <li key={`${项.标识}-${项.字段}-${序号}`}>
                    <span className="wps-compare__target">{项.页标识 ? `${项.页标识} · ${项.标识}` : 项.标识}</span>
                    <span className="wps-compare__field">{项.字段 === '存在' ? '批注存在性' : 项.字段}</span>
                    <span className="wps-compare__value">{格式化差异值(项.左)}</span>
                    <span aria-hidden="true">→</span>
                    <span className="wps-compare__value">{格式化差异值(项.右)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {(结果.页面 ?? []).length === 0 && !(结果.批注?.数量 ?? 0)
            ? <p>两份文稿没有可报告的差异。</p>
            : (
              <ol className="wps-compare__pages">
                {(结果.页面 ?? []).map(页项 => (
                  <li key={页项.标识}>
                    <h4>{页项.类型}：{页项.标题 || 页项.标识}{页项.位置变化 ? '（顺序变化）' : ''}</h4>
                    {页项.差异?.length ? <差异列表 页项={页项} /> : <p>仅页面顺序不同，内容一致。</p>}
                  </li>
                ))}
              </ol>
            )}
        </section>
      )}
    </aside>
  )
}

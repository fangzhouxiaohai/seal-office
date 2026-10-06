// 母版面板：母版与版式管理、占位符编辑、继承与单页覆盖、页脚与页面尺寸。
import { useMemo, useState } from 'react'
import type { 演示文稿 } from '../deck'
import {
  应用页面尺寸,
  设置页脚,
  读取有效页脚,
  读取页面尺寸,
  页面尺寸预设,
  type 页脚设置,
} from '../model/themes'
import {
  创建默认母版,
  新增版式,
  套用版式,
  应用母版,
  编辑占位符,
  解除继承,
  恢复继承,
  同步占位符,
  解析页面继承,
  type 版式定义,
  type 占位符定义,
} from '../model/masters'
import { 读取当前幻灯片 } from '../deck'

export interface 母版面板属性 {
  文稿: 演示文稿
  只读: boolean
  on应用: (文稿: 演示文稿) => void
}

const 只读提示 = '当前演示文稿为只读状态，请先关闭只读查看'
const 对齐选项: Array<占位符定义['对齐']> = ['left', 'center', 'right']

export default function MasterPanel({ 文稿, 只读, on应用 }: 母版面板属性) {
  const 母版列表 = 文稿.母版列表?.length ? 文稿.母版列表 : [创建默认母版()]
  const 当前页 = 读取当前幻灯片(文稿)
  const 继承 = 当前页 ? 解析页面继承({ ...文稿, 母版列表 }, 当前页) : null
  const [选中母版标识, set选中母版标识] = useState(母版列表[0].标识)
  const 选中母版 = 母版列表.find((项) => 项.标识 === 选中母版标识) ?? 母版列表[0]
  const 当前版式: 版式定义 | null = useMemo(() => {
    if (!当前页) return 选中母版.版式列表[0] ?? null
    return 选中母版.版式列表.find((项) => 项.标识 === 当前页.版式标识)
      ?? 选中母版.版式列表.find((项) => 项.名称 === 当前页.版式)
      ?? 选中母版.版式列表[0]
      ?? null
  }, [当前页, 选中母版])
  const [选中占位符标识, set选中占位符标识] = useState<string | null>(null)
  const 占位符 = 当前版式?.占位符列表.find((项) => 项.标识 === 选中占位符标识) ?? 当前版式?.占位符列表[0] ?? null
  const [草稿, set草稿] = useState<占位符定义 | null>(null)
  const [新版式名称, set新版式名称] = useState('')
  const [状态, set状态] = useState('')
  const 页脚基线 = 文稿.页脚设置 ?? (当前页 ? 读取有效页脚(文稿, 当前页, 文稿.当前索引) ?? {} : {})
  const [页脚草稿, set页脚草稿] = useState<页脚设置>({ ...页脚基线 })
  const 尺寸 = 读取页面尺寸(文稿)
  const [自定义宽, set自定义宽] = useState(String(尺寸.宽))
  const [自定义高, set自定义高] = useState(String(尺寸.高))

  const 禁用原因 = () => (只读 ? 只读提示 : undefined)
  const 当前占位符 = 草稿 ?? 占位符

  const 保存占位符 = () => {
    if (只读 || !当前版式 || !当前占位符) return
    const 编辑后 = 编辑占位符(母版列表, 选中母版.标识, 当前版式.标识, 当前占位符)
    const 新母版 = 编辑后.find((项) => 项.标识 === 选中母版.标识)!
    on应用(应用母版({ ...文稿, 母版列表: 编辑后 }, 新母版))
    set草稿(null)
    set状态('已保存占位符，继承该占位符的页面同步更新，单页覆盖保持不变')
  }

  return (
    <aside className="wps-ppt-design" aria-label="设计母版面板">
      <header className="wps-ppt-design__header">
        <h2>幻灯片母版</h2>
        <span className="wps-ppt-design__hint">优先级：单页覆盖 &gt; 版式 &gt; 母版 &gt; 主题</span>
      </header>

      <section className="wps-ppt-design__section" aria-label="母版与版式">
        <label className="wps-ppt-design__field">
          母版
          <select aria-label="母版" value={选中母版.标识} disabled={只读} title={禁用原因()} onChange={(事件) => set选中母版标识(事件.target.value)}>
            {母版列表.map((母版) => <option key={母版.标识} value={母版.标识}>{母版.名称}</option>)}
          </select>
        </label>
        <div className="wps-ppt-design__actions">
          {选中母版.版式列表.map((版式) => (
            <button
              key={版式.标识}
              type="button"
              disabled={只读}
              title={禁用原因()}
              aria-pressed={当前页?.版式标识 === 版式.标识}
              onClick={() => {
                if (!当前页) return
                on应用(套用版式({ ...文稿, 母版列表 }, 当前页.id, 版式.标识))
                set状态(`已套用版式「${版式.名称}」，原有文字、对象与备注保持`)
              }}
            >
              套用版式：{版式.名称}
            </button>
          ))}
        </div>
        <label className="wps-ppt-design__field">
          新版式名称
          <input aria-label="新版式名称" value={新版式名称} disabled={只读} title={禁用原因()} onChange={(事件) => set新版式名称(事件.target.value)} />
        </label>
        <button
          type="button"
          disabled={只读}
          title={禁用原因()}
          onClick={() => {
            const 名称 = 新版式名称.trim()
            if (!名称) { set状态('请填写新版式名称'); return }
            const 已有 = 母版列表.some((母版) => 母版.版式列表.some((版式) => 版式.名称 === 名称))
            if (已有) { set状态(`版式「${名称}」已存在，请换一个名称`); return }
            on应用({ ...文稿, 母版列表: 新增版式(母版列表, 选中母版.标识, 名称) })
            set新版式名称('')
            set状态(`已新增版式「${名称}」`)
          }}
        >
          新增版式
        </button>
        <div className="wps-ppt-design__actions">
          <button
            type="button"
            disabled={只读 || !当前页}
            title={当前页 ? 禁用原因() : '当前没有可编辑的页面'}
            onClick={() => {
              if (!当前页) return
              on应用(解除继承({ ...文稿, 母版列表 }, 当前页.id))
              set状态('已解除当前页继承，母版与版式取值已固化为单页覆盖')
            }}
          >
            解除当前页继承
          </button>
          <button
            type="button"
            disabled={只读 || !当前页}
            title={当前页 ? 禁用原因() : '当前没有可编辑的页面'}
            onClick={() => {
              if (!当前页) return
              on应用(恢复继承({ ...文稿, 母版列表 }, 当前页.id))
              set状态('已恢复当前页继承，重新跟随版式占位符')
            }}
          >
            恢复当前页继承
          </button>
          <button
            type="button"
            disabled={只读 || !当前页}
            title={当前页 ? 禁用原因() : '当前没有可编辑的页面'}
            onClick={() => {
              if (!当前页) return
              const 结果 = 同步占位符({ ...文稿, 母版列表 }, 当前页.id)
              on应用(结果.文稿)
              set状态(`已同步版式占位符，更新 ${结果.更新数量} 个文本框，单页覆盖保持不变`)
            }}
          >
            同步版式占位符
          </button>
        </div>
        {继承 && <p className="wps-ppt-design__hint">当前页使用母版「{继承.母版.名称}」{继承.版式 ? `／版式「${继承.版式.名称}」` : ''}，共 {继承.占位符列表.length} 个占位符。</p>}
      </section>

      {当前版式 && (
        <section className="wps-ppt-design__section" aria-label="占位符编辑">
          <h3>占位符</h3>
          <div className="wps-ppt-design__actions">
            {当前版式.占位符列表.map((项) => (
              <button key={项.标识} type="button" aria-pressed={当前占位符?.标识 === 项.标识} onClick={() => { set选中占位符标识(项.标识); set草稿({ ...项 }) }}>
                {项.类型}
              </button>
            ))}
          </div>
          {当前占位符 && (
            <>
              <label className="wps-ppt-design__field">
                占位符水平位置
                <input
                  aria-label="占位符水平位置"
                  type="number"
                  value={当前占位符.x}
                  disabled={只读}
                  title={禁用原因()}
                  onChange={(事件) => set草稿({ ...当前占位符, x: Number(事件.target.value) })}
                />
              </label>
              <label className="wps-ppt-design__field">
                占位符垂直位置
                <input
                  aria-label="占位符垂直位置"
                  type="number"
                  value={当前占位符.y}
                  disabled={只读}
                  title={禁用原因()}
                  onChange={(事件) => set草稿({ ...当前占位符, y: Number(事件.target.value) })}
                />
              </label>
              <label className="wps-ppt-design__field">
                占位符字号
                <input
                  aria-label="占位符字号"
                  type="number"
                  value={当前占位符.字号}
                  disabled={只读}
                  title={禁用原因()}
                  onChange={(事件) => set草稿({ ...当前占位符, 字号: Number(事件.target.value) })}
                />
              </label>
              <label className="wps-ppt-design__field">
                占位符对齐
                <select
                  aria-label="占位符对齐"
                  value={当前占位符.对齐}
                  disabled={只读}
                  title={禁用原因()}
                  onChange={(事件) => set草稿({ ...当前占位符, 对齐: 事件.target.value as 占位符定义['对齐'] })}
                >
                  {对齐选项.map((项) => <option key={项} value={项}>{项}</option>)}
                </select>
              </label>
              <button type="button" disabled={只读} title={禁用原因()} onClick={保存占位符}>保存占位符</button>
            </>
          )}
        </section>
      )}

      <section className="wps-ppt-design__section" aria-label="页脚设置">
        <h3>页脚、日期与页码</h3>
        <label className="wps-ppt-design__field">
          页脚文本
          <input aria-label="页脚文本" value={页脚草稿.页脚文本 ?? ''} disabled={只读} title={禁用原因()} onChange={(事件) => set页脚草稿({ ...页脚草稿, 页脚文本: 事件.target.value })} />
        </label>
        <label className="wps-ppt-design__inline">
          <input aria-label="显示页码" type="checkbox" checked={页脚草稿.显示页码 === true} disabled={只读} onChange={(事件) => set页脚草稿({ ...页脚草稿, 显示页码: 事件.target.checked })} />
          显示页码
        </label>
        <label className="wps-ppt-design__inline">
          <input aria-label="显示日期" type="checkbox" checked={页脚草稿.显示日期 === true} disabled={只读} onChange={(事件) => set页脚草稿({ ...页脚草稿, 显示日期: 事件.target.checked })} />
          显示日期
        </label>
        <label className="wps-ppt-design__inline">
          <input aria-label="首页不显示" type="checkbox" checked={页脚草稿.首页不显示 === true} disabled={只读} onChange={(事件) => set页脚草稿({ ...页脚草稿, 首页不显示: 事件.target.checked })} />
          首页不显示
        </label>
        <button
          type="button"
          disabled={只读}
          title={禁用原因()}
          onClick={() => {
            on应用(设置页脚(文稿, 页脚草稿, '全部'))
            set状态('已应用页脚、日期与页码设置到全部页面')
          }}
        >
          应用页脚到全部
        </button>
        <button
          type="button"
          disabled={只读 || !当前页}
          title={当前页 ? 禁用原因() : '当前没有可编辑的页面'}
          onClick={() => {
            if (!当前页) return
            on应用(设置页脚(文稿, 页脚草稿, '当前页'))
            set状态('已应用页脚设置到当前页（单页覆盖）')
          }}
        >
          仅当前页
        </button>
      </section>

      <section className="wps-ppt-design__section" aria-label="页面尺寸">
        <h3>幻灯片大小</h3>
        <p className="wps-ppt-design__hint">当前 {尺寸.宽}×{尺寸.高} 像素（{尺寸.宽 >= 尺寸.高 ? '横向' : '纵向'}）</p>
        <div className="wps-ppt-design__actions">
          <button type="button" disabled={只读} title={禁用原因()} onClick={() => { on应用(应用页面尺寸(文稿, 页面尺寸预设['16:9'], '缩放内容')); set状态('已切换为 16:9 并缩放内容，可单次撤销还原') }}>页面尺寸 16:9</button>
          <button type="button" disabled={只读} title={禁用原因()} onClick={() => { on应用(应用页面尺寸(文稿, 页面尺寸预设['4:3'], '缩放内容')); set状态('已切换为 4:3 并缩放内容，可单次撤销还原') }}>页面尺寸 4:3</button>
          <button
            type="button"
            disabled={只读}
            title={禁用原因()}
            onClick={() => { on应用(应用页面尺寸(文稿, { 宽: 尺寸.高, 高: 尺寸.宽 }, '缩放内容')); set状态('已切换页面方向并缩放内容，可单次撤销还原') }}
          >
            切换页面方向
          </button>
        </div>
        <div className="wps-ppt-design__actions">
          <label className="wps-ppt-design__field">
            自定义宽度
            <input aria-label="自定义宽度" type="number" value={自定义宽} disabled={只读} title={禁用原因()} onChange={(事件) => set自定义宽(事件.target.value)} />
          </label>
          <label className="wps-ppt-design__field">
            自定义高度
            <input aria-label="自定义高度" type="number" value={自定义高} disabled={只读} title={禁用原因()} onChange={(事件) => set自定义高(事件.target.value)} />
          </label>
          <label className="wps-ppt-design__field">
            尺寸应用方式
            <select aria-label="尺寸应用方式" defaultValue="缩放内容" disabled={只读} title={禁用原因()} id="wps-尺寸方式">
              <option value="缩放内容">缩放内容</option>
              <option value="保留坐标">保留对象坐标</option>
            </select>
          </label>
          <button
            type="button"
            disabled={只读}
            title={禁用原因()}
            onClick={() => {
              const 方式 = (document.getElementById('wps-尺寸方式') as HTMLSelectElement | null)?.value === '保留坐标' ? '保留坐标' : '缩放内容'
              try {
                on应用(应用页面尺寸(文稿, { 宽: Number(自定义宽), 高: Number(自定义高) }, 方式))
                set状态(`已应用自定义尺寸 ${自定义宽}×${自定义高}（${方式}），可单次撤销还原`)
              } catch (错误) {
                set状态(错误 instanceof Error ? 错误.message : '自定义尺寸无效')
              }
            }}
          >
            应用自定义尺寸
          </button>
        </div>
      </section>

      <p className="wps-ppt-design__status" role="status" aria-live="polite">{状态}</p>
    </aside>
  )
}
